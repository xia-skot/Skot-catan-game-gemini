#!/usr/bin/env node
// Read-only source measurement. Only a uniquely named, temporary LOCAL demo room is used.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import ts from 'typescript';
import { io } from 'socket.io-client';
import { Encoder, Decoder } from 'socket.io-parser';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('node scripts/measure-bandwidth.mjs [--offline | --require-demo] [--url http://127.0.0.1:5174]\nPrints JSON to stdout; creates no files. Default: bounded local-demo measurement with offline fallback.');
  process.exit(0);
}
const value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const origin = new URL(value('--url', 'http://127.0.0.1:5174'));
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
  || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Only a plain HTTP loopback origin is allowed. Production is never contacted.');
}
const encoder = new Encoder();
const bytes = value => Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const sourceFiles = ['src/App.tsx', 'src/useCatanGame.ts', 'src/socketService.ts', 'server.ts'];
const sourceHashes = () => Object.fromEntries(sourceFiles.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
const sourcesAtStart = sourceHashes();
const packet = (event, ...data) => '4' + encoder.encode({ type: 2, nsp: '/', data: [event, ...data] })[0];
const frameHeader = (length, masked = false) => (length < 126 ? 2 : length <= 65535 ? 4 : 10) + (masked ? 4 : 0);
const wire = (event, data, masked = false) => {
  const size = bytes(packet(event, ...data));
  return size + frameHeader(size, masked);
};
const clone = value => JSON.parse(JSON.stringify(value));
const sum = values => values.reduce((a, b) => a + b, 0);

// Compile existing TS modules in memory; no build output, source edits, or mocked game rules.
const require = createRequire(import.meta.url);
const modules = new Map();
function loadTs(filename) {
  filename = path.resolve(filename);
  if (!filename.startsWith(path.join(root, 'src') + path.sep)) throw new Error('Unexpected source import');
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  const localRequire = specifier => specifier.startsWith('.')
    ? loadTs(path.resolve(path.dirname(filename), specifier + '.ts')) : require(specifier);
  new Function('require', 'module', 'exports', 'window', compiled)(
    localRequire, module, module.exports, { location: { search: '' } });
  return module.exports;
}
const { useCatanGame, getHexesForVertex } = loadTs(path.join(root, 'src/useCatanGame.ts'));
function runHook(initial, action) {
  let seeded = !initial;
  let acted = false;
  let state;
  function Harness() {
    const game = useCatanGame();
    if (!seeded) { seeded = true; game.syncGameState(clone(initial)); }
    else if (!acted) { acted = true; action(game); }
    state = game.gameState;
    return null;
  }
  renderToString(React.createElement(Harness));
  assert(state, 'Hook did not produce a state');
  return clone(state);
}
let seed = 20260929;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const originalRandom = Math.random;
const originalLog = console.log;
let initialStates;
let tradeTemplate;
try {
  Math.random = random;
  console.log = () => {};
  initialStates = ['standard', 'archipelago'].flatMap(mapType => [4, 6].map(count => ({
    mapType, count, state: runHook(null, game => game.initGame(count, mapType, undefined,
      Array(count).fill(false), Array.from({ length: count }, (_, i) => `bw-player-${i}`),
      Array.from({ length: count }, (_, i) => `\u73a9\u5bb6 ${i + 1}`))),
  })));
  const main = { ...clone(initialStates[2].state), phase: 'main', hasRolled: true };
  tradeTemplate = runHook(main, game => game.proposeTrade(
    { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
    { lumber: 0, brick: 1, wool: 0, grain: 0, ore: 0 }, null)).tradeOffers[0];
} finally { Math.random = originalRandom; console.log = originalLog; }

function measureState(state) {
  const json = JSON.stringify(state);
  const down = packet('game_state_updated', state);
  return {
    jsonBytes: bytes(json), jsonGzipBytes: gzipSync(json).length, sha256: sha(json),
    hexes: state.board.length, players: state.players.length,
    gameUpdatePacketBytes: bytes(down), gameUpdateWsBytes: bytes(down) + frameHeader(bytes(down)),
    updateGameStatePacketBytes: bytes(packet('update_game_state', '123456', state)),
    fields: Object.fromEntries(Object.entries(state).map(([key, v]) => [key, bytes(v)])),
  };
}

// Serialization fixtures, NOT legal playthroughs: coordinates come from the generated board.
function evolvingState(initial, fraction, logLines = 0) {
  const state = clone(initial);
  state.phase = 'main'; state.hasRolled = true; state.dice = [3, 4]; state.diceRollPending = false;
  const vertices = new Set();
  const edges = new Set();
  for (const hex of state.board.filter(h => h.type !== 'sea')) {
    const points = Array.from({ length: 6 }, (_, i) => {
      const angle = Math.PI / 180 * (60 * i + 30);
      return `${Math.round(Math.sqrt(3) * 40 * (hex.q + hex.r / 2) + 40 * Math.cos(angle))},${Math.round(60 * hex.r + 40 * Math.sin(angle))}`;
    });
    points.forEach((v, i) => { vertices.add(v); edges.add([v, points[(i + 1) % 6]].sort().join('|')); });
  }
  const players = state.players.length;
  state.settlements = [...vertices].slice(0, 2 * players + Math.round(3 * players * fraction)).map((v, i) => ({
    vertexId: v, hexIds: getHexesForVertex(state.board, v).map(h => h.id),
    playerId: i % players, isCity: i < Math.round(2 * players * fraction),
  }));
  state.roads = [...edges].slice(0, 2 * players + Math.round(8 * players * fraction)).map((edgeId, i) => ({ edgeId, playerId: i % players }));
  const shipOffset = players === 4 ? 50 : 70;
  state.ships = state.mapType === 'standard' ? [] : [...edges].slice(shipOffset, shipOffset + Math.round(3 * players * fraction)).map((edgeId, i) => ({ edgeId, playerId: i % players }));
  state.players.forEach(p => {
    p.resources = { lumber: 2, brick: 2, wool: 2, grain: 2, ore: 2 };
    p.settlements = state.settlements.filter(s => s.playerId === p.id && !s.isCity).length;
    p.cities = state.settlements.filter(s => s.playerId === p.id && s.isCity).length;
    p.roads = state.roads.filter(s => s.playerId === p.id).length;
    p.ships = state.ships.filter(s => s.playerId === p.id).length;
  });
  state.tradeOffers = Array.from({ length: Math.round(20 * fraction) }, (_, i) => ({
    ...clone(tradeTemplate), id: String(i).padStart(7, '0'), status: 'completed', acceptedBy: [1], completedWith: 1,
  }));
  if (logLines) state.logs = Array.from({ length: Math.round(logLines * fraction) }, (_, i) => ({
    id: i, timestamp: 1790630400000 + i * 1000, playerId: i % state.players.length,
    message: '\u73a9\u5bb6\u5b8c\u6210\u64cd\u4f5c\uff1a'.repeat(6),
  }));
  return state;
}

function inventory() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/assetManifest.json'), 'utf8'));
  const items = [];
  for (const kind of ['images', 'audio']) for (const url of new Set(Object.values(manifest[kind]))) {
    items.push({ group: kind, file: 'public' + url });
  }
  const installManifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
  const iconFiles = [...new Set(installManifest.icons.map(icon => 'public' + icon.src))];
  for (const file of ['dist/index.html', 'public/manifest.json', ...iconFiles]) {
    if (fs.existsSync(path.join(root, file))) items.push({ group: 'shell', file });
  }
  if (fs.existsSync(path.join(root, 'dist/assets'))) for (const file of fs.readdirSync(path.join(root, 'dist/assets'))) {
    if (/\.(js|css)$/.test(file)) items.push({ group: 'bundle', file: `dist/assets/${file}` });
  }
  const files = items.map(item => {
    const full = path.join(root, item.file);
    const content = fs.readFileSync(full);
    return { ...item, bytes: content.length, gzipBytes: gzipSync(content).length,
      modifiedAt: fs.statSync(full).mtime.toISOString(), sha256: sha(content) };
  });
  const totals = Object.fromEntries(['images', 'audio', 'shell', 'bundle'].map(group => [group, {
    count: files.filter(f => f.group === group).length,
    bytes: sum(files.filter(f => f.group === group).map(f => f.bytes)),
    gzipBytes: sum(files.filter(f => f.group === group).map(f => f.gzipBytes)),
  }]));
  return { version: manifest.version, files, totals, rawBytes: sum(files.map(f => f.bytes)),
    gzipBytes: sum(files.map(f => f.gzipBytes)) };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function once(socket, event, timeout = 6000) {
  return new Promise((resolve, reject) => {
    const handler = (...data) => { clearTimeout(timer); resolve(data); };
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timed out: ${event}`)); }, timeout);
    socket.once(event, handler);
  });
}
async function localFetch(pathname, options = {}) {
  const response = await fetch(new URL(pathname, origin), { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`${pathname}: ${response.status}`);
  return response;
}
async function demoMeasurement() {
  const sessionResponse = await localFetch('/api/demo/session');
  if (!sessionResponse.headers.get('content-type')?.includes('application/json')) throw new Error('Not a demo API');
  const session = await sessionResponse.json();
  if (session.user?.email !== 'demo@example.test') throw new Error('Refusing non-demo session');
  const messageResponse = await localFetch('/api/messages', { headers: { Authorization: `Bearer ${session.token}` } });
  const messageBody = await messageResponse.text();
  const healthResponse = await localFetch('/api/health');
  const healthBody = await healthResponse.text();
  const samples = [];
  const clients = [];
  const roomId = `bw-measure-${randomUUID()}`;
  let handshake;
  let liveRoom;
  const roundTrips = [];
  function capture(direction, index, packet) {
    if (packet.type === 'open') { handshake = JSON.parse(packet.data); return; }
    if (packet.type !== 'message') {
      samples.push({ direction, index, event: `engine:${packet.type}`, bytes: 1 }); return;
    }
    const decoder = new Decoder();
    decoder.on('decoded', decoded => samples.push({ direction, index,
      event: decoded.type === 2 ? decoded.data[0] : `socket:${decoded.type}`,
      bytes: 1 + bytes(packet.data) }));
    decoder.add(packet.data); decoder.destroy();
  }
  try {
    for (let i = 0; i < 4; i++) {
      const socket = io(origin.origin, { path: '/socket.io', transports: ['polling', 'websocket'],
        autoConnect: false, reconnection: false, timeout: 5000, forceNew: true });
      clients.push(socket);
      const connected = once(socket, 'connect');
      socket.connect();
      socket.io.engine.on('packet', p => capture('down', i, p));
      socket.io.engine.on('packetCreate', p => capture('up', i, p));
      await connected;
      const joined = once(socket, 'room_state');
      socket.emit('join_room', roomId, `bw-player-${i}`, `\u73a9\u5bb6 ${i + 1}`, false);
      [liveRoom] = await joined;
      if (i === 0) {
        const settings = once(socket, 'room_state');
        socket.emit('update_settings', roomId, 'bw-player-0', { botConfig: [false, false, false, false] });
        await settings;
      }
    }
    // Wait for the normal polling -> WebSocket upgrade before counting representative events.
    for (let tries = 0; tries < 50 && clients.some(s => s.io.engine.transport.name !== 'websocket'); tries++) await delay(100);
    assert(clients.every(s => s.io.engine.transport.name === 'websocket'), 'WebSocket upgrade unavailable');
    const start = once(clients[1], 'game_init');
    clients[0].emit('start_game', roomId, initialStates[2].state);
    const [started] = await start;
    roundTrips.push({ label: 'archipelago4-start', ...measureState(started) });
    for (const label of ['main', 'robber', 'knight']) {
      const state = evolvingState(initialStates[2].state, 0.5);
      if (label !== 'main') state.phase = 'robber';
      if (label === 'knight') state.playingDevCard = 'knight';
      const changed = once(clients[1], 'game_state_updated');
      clients[0].emit('update_game_state', roomId, state);
      const [received] = await changed;
      assert.deepEqual(received, state);
      roundTrips.push({ label, ...measureState(received) });
    }
    const tradeState = evolvingState(initialStates[2].state, 0.5);
    tradeState.tradeOffers.push(clone(tradeTemplate));
    let received = once(clients[1], 'game_state_updated');
    clients[0].emit('update_game_state', roomId, tradeState); await received;
    received = once(clients[0], 'game_state_updated');
    clients[1].emit('react_to_trade', roomId, tradeTemplate.id, 1, 'accept'); await received;
    received = once(clients[0], 'game_state_updated');
    clients[0].emit('finalize_trade', roomId, tradeTemplate.id, 1); await received;
    const synced = once(clients[0], 'room_state');
    clients[0].emit('request_sync', roomId); [liveRoom] = await synced;
    const idleStart = samples.length;
    const idleStartTime = performance.now();
    await delay(9000);
    const idle = { milliseconds: Math.round(performance.now() - idleStartTime), packets: samples.slice(idleStart) };
    const grouped = Object.values(samples.reduce((result, s) => {
      const key = `${s.direction}:${s.event}`;
      const entry = result[key] ??= { direction: s.direction, event: s.event, count: 0, packetBytes: 0, minBytes: Infinity, maxBytes: 0 };
      entry.count++; entry.packetBytes += s.bytes; entry.minBytes = Math.min(entry.minBytes, s.bytes); entry.maxBytes = Math.max(entry.maxBytes, s.bytes);
      return result;
    }, {}));
    const count = (direction, event) => grouped.find(row => row.direction === direction && row.event === event)?.count || 0;
    assert.equal(count('up', 'update_game_state'), 4);
    assert.equal(count('down', 'game_state_updated'), 4 * 3 + 2 * 4 + 1,
      'Expected four peer-only broadcasts, two all-client trade broadcasts, and one manual sync');
    assert.equal(count('down', 'game_init'), 4);
    assert(!idle.packets.some(p => p.event === 'game_state_updated'), 'Unexpected periodic game snapshots');
    return {
      status: 'measured-local-demo', origin: origin.origin,
      pingInterval: handshake.pingInterval, pingTimeout: handshake.pingTimeout, maxPayload: handshake.maxPayload,
      transport: clients[0].io.engine.transport.name,
      websocketExtensions: clients[0].io.engine.transport.ws?.extensions ?? 'unavailable',
      roomJsonBytes: bytes(liveRoom), roomStatePacketBytes: bytes(packet('room_state', liveRoom)),
      messagesBodyBytes: bytes(messageBody), messagesGzipBytes: gzipSync(messageBody).length,
      messagesCount: JSON.parse(messageBody).messages?.length,
      healthBodyBytes: bytes(healthBody), roundTrips, grouped, idle,
    };
  } finally {
    // Remove this measurement's room only. Never reset shared demo data or delete another room.
    if (clients[0]?.connected && liveRoom?.hostId === 'bw-player-0' && liveRoom.roomId === roomId) {
      const reset = once(clients[0], 'game_reset', 1500).catch(() => null);
      clients[0].emit('reset_game', roomId, 'bw-player-0'); await reset;
    }
    clients.forEach(socket => socket.disconnect());
  }
}

const actions = {
  initialRollsAndResolution: 8, initialOrder: 1, setupPlacements: 16, setupModes: 16,
  normalRollsAndResolution: 160, endTurns: 80, buildingPlacements: 64, buildingModes: 45,
  bankTrades: 24, developmentActivationsAndOtherEffects: 20,
  sevenTransitionsDiscardsMovesTargetsSteals: 66, knightMovesTargetsSteals: 18,
  goldSelections: 8, tradeProposalsAndCancellations: 24, miscellaneous: 12,
};
const localUpdates = sum(Object.values(actions));
const tradeUpdates = 40 + 16;
function estimate(initial, assets, demo, spectators = 0, logLines = 0) {
  const humans = initial.players.length;
  const recipients = humans + spectators;
  // Two extra setup roll commits, eight setup placement/mode commits, and
  // sixteen later construction commits per extra human match the size envelope.
  const updates = localUpdates + (humans - 4) * 26;
  let upload = 0;
  let jsonTotal = 0;
  let lateSize = 0;
  const downSizes = [];
  for (let i = 0; i < updates; i++) {
    const state = evolvingState(initial, i / (updates - 1), logLines);
    lateSize = bytes(state);
    jsonTotal += lateSize;
    upload += wire('update_game_state', ['123456', state], true);
    downSizes.push(wire('game_state_updated', [state]));
  }
  const averageDown = sum(downSizes) / updates;
  const localDown = sum(downSizes) * (recipients - 1);
  const serverDown = averageDown * tradeUpdates * recipients;
  const tradeUp = 40 * wire('react_to_trade', ['123456', '0000000', 1, 'accept'], true)
    + 16 * wire('finalize_trade', ['123456', '0000000', 1], true);
  const initialSize = bytes(initial);
  // One reconnect and one manual sync per HUMAN: intentionally budget duplicate room snapshots.
  const roomAllowance = 1200;
  const startAndRecoveryDown = recipients * (initialSize + 50)
    + humans * ((recipients + 1) * (lateSize + roomAllowance) + (lateSize + 50))
    + humans * (lateSize * 2 + roomAllowance + 100)
    + humans * (recipients - 1) * (lateSize + roomAllowance);
  const setupAndRecoveryUp = initialSize + 2000 * humans;
  const pings = Math.ceil(3600000 / (demo?.pingInterval || 8000));
  const controlDown = recipients * pings * 3;
  const controlUp = recipients * pings * 7;
  const messageBytes = demo?.messagesBodyBytes ?? 1024;
  const httpDownPerClient = 901 * (messageBytes + 500) + 12 * ((demo?.healthBodyBytes ?? 64) + 500);
  const httpUpPerClient = (901 + 12) * 700;
  const serverEgress = localDown + serverDown + startAndRecoveryDown + controlDown + recipients * httpDownPerClient;
  const serverIngress = upload + tradeUp + setupAndRecoveryUp + controlUp + recipients * httpUpPerClient;
  const spectatorDown = sum(downSizes) + averageDown * tradeUpdates + (initialSize + 50)
    + humans * 2 * (lateSize + roomAllowance) + pings * 3 + httpDownPerClient;
  const playerDownload = (serverEgress - spectators * spectatorDown) / humans;
  const playerUpload = (serverIngress - spectators * (pings * 7 + httpUpPerClient)) / humans;
  return { mapType: initial.mapType, humans, spectators, logLines, localUpdates: updates, tradeUpdates,
    averageSnapshotJsonBytes: jsonTotal / updates,
    endSnapshotJsonBytes: lateSize, exceedsDefaultMessageLimit: lateSize + 100 >= 1000000,
    serverEgressBytes: serverEgress, serverIngressBytes: serverIngress,
    averagePlayerDownloadBytes: playerDownload, averagePlayerUploadBytes: playerUpload,
    spectatorDownloadBytes: spectators ? spectatorDown : null,
    cachedGameEgressMB: serverEgress / 1e6, freshGameEgressMB: (serverEgress + recipients * assets.rawBytes) / 1e6,
    cachedPlayerTotalMB: (playerDownload + playerUpload) / 1e6,
    freshPlayerTotalMB: (playerDownload + playerUpload + assets.rawBytes) / 1e6,
    cachedGamesPer5GB: Math.floor(5e9 / serverEgress), freshGamesPer5GB: Math.floor(5e9 / (serverEgress + recipients * assets.rawBytes)),
    cachedGamesPer5GBWith20PercentReserve: Math.floor(5e9 / (serverEgress * 1.2)),
    freshGamesPer5GBWith20PercentReserve: Math.floor(5e9 / ((serverEgress + recipients * assets.rawBytes) * 1.2)),
  };
}

const assets = inventory();
let demo = { status: 'not-requested' };
if (!args.includes('--offline')) {
  try { demo = await demoMeasurement(); }
  catch (error) {
    demo = { status: 'unavailable', error: error.message };
    if (args.includes('--require-demo')) { console.error(JSON.stringify(demo)); process.exitCode = 1; }
  }
}
const sources = sourceHashes();
const report = {
  measuredAt: new Date().toISOString(), node: process.version, seed: 20260929,
  units: 'Bytes; MB=1000000 bytes; assumed quota=5000000000 outbound bytes, not a universal plan allowance',
  sources, sourcesAtStart, sourcesChangedDuringRun: sourceFiles.filter(file => sourcesAtStart[file] !== sources[file]),
  assumptions: { durationSeconds: 3600, turns: 80, actions, localUpdates, tradeReactions: 40, tradeFinalizations: 16,
    messagesResponses: 901, healthResponses: 12, httpResponseHeaderAllowance: 500, httpRequestAllowance: 700,
    reconnectsPerHuman: 1, manualSyncsPerHuman: 1, logsAreHypothetical: true,
    fixtureNotice: 'Initial snapshots use real initGame. Evolving piece/trade/log fixtures estimate bytes, not valid playthroughs. No TLS/TCP/IP overhead or retransmission is measured. SSR does not run effects.' },
  snapshots: initialStates.map(({ mapType, count, state }) => ({ mapType, count, ...measureState(state) })),
  assets, demo,
  scenarios: initialStates.map(({ state }) => estimate(state, assets, demo)),
  sensitivities: [estimate(initialStates[2].state, assets, demo, 2),
    estimate(initialStates[2].state, assets, demo, 0, 1000), estimate(initialStates[2].state, assets, demo, 0, 5000)],
  longMessageHistory: [1024, 100000, 1000000].map(bodyBytes => ({ bodyBytes, perPlayerHourMB: 901 * (bodyBytes + 500) / 1e6 })),
};
assert.equal(localUpdates, 562);
assert.equal(bytes(packet('probe', '\u6728')), Buffer.byteLength('42["probe","\u6728"]'));
assert(assets.rawBytes > 0);
console.log(JSON.stringify(report, null, 2));
