import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { buildMonthlyLeaderboard, computeLeaderboardUserStats, eligibleLeaderboardGames } from '../server/leaderboard';
import { beginLeaderboardGame, hasUnsavedLeaderboardResult, persistLeaderboardResult } from '../server/leaderboardRecording';
import { mongoLeaderboardStore, registerLeaderboardRoutes } from '../server/leaderboardRoutes';
import { createDemoLeaderboardStore } from '../server/leaderboardDemo';
import { monthBounds, shanghaiMonth, shiftMonth, sortAdminPlayers } from '../shared/leaderboard';

const NOW = Date.parse('2026-09-29T04:00:00Z');
const users = ['A', 'B', 'C', 'D'].map((username, index) => ({ _id: String(index), username, isGuest: false, createdAt: new Date('2026-01-01T00:00:00Z') }));
function game(patch: Record<string, any> = {}): Record<string, any> {
  return { _id: 'db1', roomId: 'room1', winnerId: 0, mapType: 'standard', turnCount: 30,
    completedAt: new Date('2026-09-28T10:00:00Z'),
    players: [10, 8, 8, 4].map((score, id) => ({ id, name: users[id].username, isBot: false, score })), ...patch };
}
const board = (games: any[], accounts = users, month = '2026-09', count = 20) => buildMonthlyLeaderboard(games, accounts, month, count, NOW);

test('legacy score breakdowns and history award the same monthly points', () => {
  const scores = [[14, 10], [15, 10, 2], [15, 4]];
  const records = scores.map((values, index) => game({ roomId: `screenshot-${index}`, mapType: 'archipelago',
    players: values.map((total, id) => ({ id, name: id === 0 ? 'A' : `AI ${id}`, isBot: id !== 0,
      score: id === 0 ? 10 : total,
      breakdown: { settlements: id === 0 ? total : 0, cities: 0, longestRoad: false, largestArmy: false, vpCards: 0, islandBonus: 0 } })) }));
  const row = board(records).entries[0];
  assert.deepEqual([row.points, row.gameCount, row.wins], [7, 3, 3]);
  const response = buildMonthlyLeaderboard(records, users, '2026-09', 20, NOW, '0');
  assert.deepEqual(response.myGames?.map(game => game.points), [2, 3, 2]);
  assert.equal(response.myGames?.reduce((sum, game) => sum + game.points, 0), row.points);
  assert.equal(response.scoringVersion, 'rank-points-v15');
});

test('a corrected complete breakdown governs ranking while malformed details cannot inflate a score', () => {
  const record = game();
  record.players[1].breakdown = { settlements: 1, cities: 3, longestRoad: true, largestArmy: false, vpCards: 1, islandBonus: 0 };
  assert.deepEqual(board([record]).entries.map(row => [row.userId, row.points]), [['0', 4], ['1', 4], ['2', 2], ['3', 1]]);
  record.players[1].breakdown.cities = '999';
  assert.equal(board([record]).entries.find(row => row.userId === '1')!.points, 3);
});

test('N - strictly higher participants awards tied high positions, and monthly ranks tie', () => {
  const result = board([game()]);
  assert.deepEqual(result.entries.map(row => [row.points, row.rank]), [[4, 1], [3, 2], [3, 2], [1, 4]]);
  assert.deepEqual(result.entries.map(row => row.wins), [1, 0, 0, 0]);
  assert.equal(result.timeZone, 'Asia/Shanghai');
  assert.equal(result.source, 'stored-client-results');
});

test('AI and guests count toward N and ranking but do not get leaderboard entries; spectators never count', () => {
  const record = game();
  record.players[0].isBot = true;
  const accounts = users.map(user => user._id === '1' ? { ...user, isGuest: true } : user);
  record.players.push({ id: 99, name: 'Observer', isBot: false, score: 99, isSpectator: true } as any);
  const result = board([record], accounts);
  assert.deepEqual(result.entries.map(row => [row.userId, row.points]), [['2', 3], ['3', 1]]);
});

test('new stable IDs survive renamed users, exclude unverified users, and retain takeover humans', () => {
  const record = game({ identityVersion: 1, gameId: 'stable' });
  record.players = record.players.map((player, index) => ({ ...player, isBot: true, isOriginalBot: false,
    userId: index < 2 ? String(index) : null, sessionId: `s${index}` }));
  const accounts = users.map(user => ({ ...user, username: `renamed-${user.username}` }));
  assert.deepEqual(board([record], accounts).entries.map(row => [row.username, row.points]), [['renamed-A', 4], ['renamed-B', 3]]);
  record.players[0].userId = 'deleted-account';
  assert.deepEqual(board([record]).entries.map(row => row.userId), ['1']);
});

test('ambiguous registered/guest names, duplicate human seats, and post-game registration get no attribution', () => {
  const collision = [...users, { ...users[0], _id: 'guest', username: ' a ', isGuest: true }];
  assert.equal(board([game()], collision).entries.some(row => row.userId === '0'), false);
  const duplicated = game();
  duplicated.players[1].name = 'A';
  assert.equal(board([duplicated]).entries.some(row => row.userId === '0'), false);
  const tooNew = users.map(user => ({ ...user, createdAt: new Date(NOW) }));
  assert.equal(board([game()], tooNew).entries.length, 0);
});

test('explicit duplicate IDs count once, prefer earliest completion, and reject conflicting outcomes', () => {
  const first = game({ gameId: 'same', completedAt: new Date('2026-08-31T15:59:59Z') });
  const retry = { ...first, _id: 'db2', completedAt: new Date('2026-08-31T16:00:00Z') };
  assert.equal(board([retry, first]).entries.length, 0);
  assert.equal(board([retry, first], users, '2026-08').entries[0].gameCount, 1);
  assert.equal(board([first, { ...retry, winnerId: 2 }], users, '2026-08').entries.length, 0);
});

test('legacy retries deduplicate across months and order; distinct rooms and outcomes stay distinct', () => {
  const first = game({ completedAt: new Date('2026-08-31T15:59:59Z') });
  const retry = { ...first, _id: 'another', completedAt: new Date('2026-08-31T16:00:00Z'), players: [...first.players].reverse() };
  assert.equal(board([retry, first]).entries.length, 0);
  assert.equal(board([first, retry], users, '2026-08').entries[0].gameCount, 1);
  assert.equal(board([game(), game({ roomId: 'other' }), game({ turnCount: 31 })]).entries[0].gameCount, 3);
});

test('invalid or incomplete records never fabricate scores or complete games', () => {
  const invalid = [
    game({ completedAt: null }), game({ completedAt: new Date(NOW + 1) }), game({ completedAt: '2026-09-28' }),
    game({ winnerId: null }), game({ winnerId: 99 }), game({ phase: 'main' }), game({ mapType: 'unknown' }),
    game({ players: [game().players[0]] }), game({ players: [...game().players, game().players[0]] }),
    game({ players: game().players.map(player => ({ ...player, score: undefined })) }),
    game({ players: game().players.map(player => ({ ...player, isBot: undefined })) }),
    game({ players: game().players.map(player => ({ ...player, score: -1 })) }),
    game({ players: game().players.map(player => ({ ...player, score: 1.5 })) }),
    game({ players: game().players.map(player => ({ ...player, score: Infinity })) }),
    game({ players: game().players.map(player => ({ ...player, score: 9 })) }),
    game({ roomId: undefined }), game({ turnCount: undefined }), game({ identityVersion: 2 }),
  ];
  for (const record of invalid) assert.equal(eligibleLeaderboardGames([record], NOW).length, 0, JSON.stringify(record));
});

test('Shanghai calendar start/end, leap February and year rollover are independent of machine timezone', () => {
  assert.equal(shanghaiMonth(new Date('2026-08-31T16:00:00Z')), '2026-09');
  assert.deepEqual(monthBounds('2026-09'), { start: Date.parse('2026-08-31T16:00:00Z'), end: Date.parse('2026-09-30T16:00:00Z') });
  assert.equal((monthBounds('2024-02').end - monthBounds('2024-02').start) / 86400000, 29);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  for (const month of ['2026-00', '2026-13', '2026-9', '2026-01x', '1999-12']) assert.throws(() => monthBounds(month));
  const records = ['2026-08-31T15:59:59Z', '2026-08-31T16:00:00Z', '2026-09-30T15:59:59Z', '2026-09-30T16:00:00Z']
    .map((completedAt, index) => game({ gameId: `boundary-${index}`, completedAt: new Date(completedAt) }));
  assert.equal(buildMonthlyLeaderboard(records, users, '2026-09', 20, Date.parse('2026-10-02T00:00:00Z')).entries[0].gameCount, 2);
});

test('recent activity counts eligible completions in trailing 72h, including exact boundary', () => {
  const records = [-72 * 3600000 - 1, -72 * 3600000, -1, 1].map((offset, index) => game({ gameId: `recent-${index}`, completedAt: new Date(NOW + offset) }));
  const stats = computeLeaderboardUserStats(records, users, NOW);
  assert.deepEqual(stats.get('0'), { totalGames: 3, wins: 3, winRate: 100, recent3DayGames: 2 });
  assert.deepEqual(stats.get('1'), { totalGames: 3, wins: 0, winRate: 0, recent3DayGames: 2 });
});

test('all four sort fields support both directions without mutation; missing values stay last', () => {
  const players = [{ _id: '2', username: 'B', createdAt: '2026-02-01T00:00:00Z', winRate: 50, totalGames: 3, recent3DayGames: 1 },
    { _id: '1', username: 'A', createdAt: '2026-01-01T00:00:00Z', winRate: 10, totalGames: 1, recent3DayGames: 0 }, { _id: '3', username: 'C' }];
  for (const field of ['createdAt', 'winRate', 'totalGames', 'recent3DayGames'] as const) {
    assert.deepEqual(sortAdminPlayers(players, field, 'asc').map(player => player._id), ['1', '2', '3']);
    assert.deepEqual(sortAdminPlayers(players, field, 'desc').map(player => player._id), ['2', '1', '3']);
  }
  assert.equal(players[0]._id, '2');
});

test('strict top count caps ties, no zero-game rows, and empty month stays empty', () => {
  assert.equal(board([game()], users, '2026-09', 2).entries.length, 2);
  assert.equal(board([], users).entries.length, 0);
  assert.equal(board([game()], users, '2026-08').entries.length, 0);
  assert.throws(() => board([game()], users, '2026-09', 101));
});

function roomAndState() {
  const room = { hostId: 'session-human', players: [{ id: 'session-human', name: 'A', userId: '0', socketId: 'socket-1' }],
    settings: { playerCount: 2, mapType: 'standard', botConfig: [false, false, false, true] } };
  const state = { players: [{ id: 0, name: 'A', sessionId: 'session-human', userId: 'forged', isBot: true },
    { id: 1, name: 'AI original slot 3', isBot: false }] };
  return { room, state };
}

test('noncontiguous original AI slot 3 compacts to game seat 1; runtime bot/userId input cannot alter identity', async () => {
  const { room, state } = roomAndState();
  assert.equal(beginLeaderboardGame(room, state), true);
  const writes: any[] = [];
  const collection = { updateOne: async (...args: any[]) => { writes.push(args); } };
  const result = game({ players: [{ ...state.players[0], score: 10 }, { ...state.players[1], score: 7 }] });
  await persistLeaderboardResult(room, result, collection);
  const stored = writes[0][1].$setOnInsert;
  assert.equal(stored.identityVersion, 1);
  assert.match(stored.gameId, /^[a-f0-9-]{36}$/);
  assert.equal(stored.players[0].userId, '0');
  assert.equal(stored.players[0].isOriginalBot, false);
  assert.equal(stored.players[1].isOriginalBot, true);
  assert.equal(stored.players[1].userId, null);
  assert.deepEqual(board([stored]).entries.map(row => [row.userId, row.points]), [['0', 2]]);
  assert.equal(writes[0][2].upsert, true);
});

test('captured human identity persists across runtime changes, concurrent results and retries use one first snapshot', async () => {
  const { room, state } = roomAndState();
  beginLeaderboardGame(room, state);
  assert.equal(hasUnsavedLeaderboardResult(room), false);
  assert.equal(hasUnsavedLeaderboardResult({}), false);
  room.players[0].userId = 'replacement';
  let calls = 0;
  let release!: () => void;
  const writes: any[] = [];
  const collection = { updateOne: async (...args: any[]) => { calls++; writes.push(args); await new Promise<void>(resolve => { release = resolve; }); if (calls === 1) throw new Error('temporary failure'); } };
  const result = game({ players: [{ ...state.players[0], score: 10 }, { ...state.players[1], score: 7 }] });
  const first = persistLeaderboardResult(room, result, collection);
  assert.equal(hasUnsavedLeaderboardResult(room), true);
  const second = persistLeaderboardResult(room, { ...result, completedAt: new Date(NOW) }, collection);
  assert.equal(first, second);
  const failed = assert.rejects(first, /temporary failure/);
  await Promise.resolve();
  release();
  await failed;
  assert.equal(hasUnsavedLeaderboardResult(room), true);
  const retry = persistLeaderboardResult(room, { ...result, completedAt: new Date(NOW) }, collection);
  await Promise.resolve();
  release();
  await retry;
  assert.equal(hasUnsavedLeaderboardResult(room), false);
  await persistLeaderboardResult(room, result, collection);
  assert.equal(calls, 2);
  assert.deepEqual(writes[0], writes[1]);
  assert.equal(writes[1][1].$setOnInsert.players[0].userId, '0');
});

test('unknown sessions, swapped compact seats, restored history and unverified accounts cannot acquire identity', async () => {
  const { room, state } = roomAndState();
  assert.equal(beginLeaderboardGame(room, { players: [{ ...state.players[0], sessionId: 'foreign' }, state.players[1]] }), false);
  assert.equal(beginLeaderboardGame(room, { players: [{ ...state.players[0], id: 1 }, { ...state.players[1], id: 0 }] }), false);
  let writes = 0, restored: any;
  const oldRoom = {};
  const restoredCollection = { updateOne: async (_filter: any, update: any) => { writes++; restored = update.$setOnInsert; } };
  await persistLeaderboardResult(oldRoom, game(), restoredCollection);
  await persistLeaderboardResult(oldRoom, game(), restoredCollection);
  assert.equal(writes, 1);
  assert.equal(restored.identityVersion, 1);
  assert.equal(restored.players.every((player: any) => player.userId === null && player.isGuest === true), true);
  assert.equal(board([restored]).entries.length, 0);
  delete (room.players[0] as any).userId;
  assert.equal(beginLeaderboardGame(room, state), true);
  let stored: any;
  await persistLeaderboardResult(room, game({ players: [{ ...state.players[0], score: 10 }, { ...state.players[1], score: 7 }] }),
    { updateOne: async (_filter: any, update: any) => { stored = update.$setOnInsert; } });
  assert.equal(board([stored]).entries.length, 0);
});

test('Mongo setting persists in its isolated document across store instances; sensitive fields are projected out', async () => {
  let setting: any = null;
  const projections: any[] = [];
  const rows = (records: any[]) => ({ find: () => ({ project: (fields: any) => { projections.push(fields); return { toArray: async () => records }; } }) });
  const collections = { games: rows([game()]), users: rows(users), settings: {
    findOne: async (filter: any) => { assert.deepEqual(filter, { _id: 'monthly-leaderboard' }); return setting; },
    updateOne: async (filter: any, update: any, options: any) => { assert.deepEqual(filter, { _id: 'monthly-leaderboard' }); assert.equal(options.upsert, true); setting = update.$set; },
  } };
  await mongoLeaderboardStore(() => collections).writeTopCount(37);
  assert.equal(await mongoLeaderboardStore(() => collections).readTopCount(), 37);
  await mongoLeaderboardStore(() => collections).readRecords();
  assert.equal(projections[1].email, undefined);
  assert.equal(projections[1].password, undefined);
});

test('HTTP routes enforce signed auth/admin, strict settings, calendar validation and never accept caller awards', async () => {
  const app = express();
  app.use(express.json());
  const secret = 'leaderboard-test-only-secret';
  const authenticate = (req: any, res: any, next: any) => {
    try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); next(); }
    catch { res.status(401).json({ error: 'unauthorized' }); }
  };
  const requireAdmin = (req: any, res: any, next: any) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'forbidden' });
  const demo = createDemoLeaderboardStore(() => NOW);
  registerLeaderboardRoutes(app, authenticate, requireAdmin, demo.store, () => NOW);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = (role: string) => ({ Authorization: `Bearer ${jwt.sign({ userId: '0', role }, secret)}` });
  const put = (value: any, role = 'admin') => fetch(url + '/api/admin/leaderboard/settings', { method: 'PUT', headers: { ...token(role), 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  try {
    assert.equal((await fetch(url + '/api/leaderboard')).status, 401);
    assert.equal((await fetch(url + '/api/admin/leaderboard/settings', { headers: token('user') })).status, 403);
    assert.equal((await put({ topCount: 1 }, 'user')).status, 403);
    for (const value of [0, 101, -1, 1.5, '20', null, true]) assert.equal((await put({ topCount: value })).status, 400);
    assert.equal((await put({})).status, 400);
    assert.equal((await put({ topCount: 100 })).status, 200);
    assert.equal((await put({ topCount: 1, points: 999, userId: 'forged' })).status, 200);
    const response = await fetch(url + '/api/leaderboard?points=99999&topCount=100', { headers: token('user') });
    const result: any = await response.json();
    assert.equal(result.month, '2026-09');
    assert.equal(result.topCount, 1);
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].points, 8);
    assert.equal(result.entries[0].email, undefined);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    for (const query of ['month=2026-13', 'month=2026-1', 'month=2026-09&month=2026-08', 'month[$gt]=2026']) {
      assert.equal((await fetch(url + '/api/leaderboard?' + query, { headers: token('user') })).status, 400);
    }
    assert.equal((await fetch(url + '/api/leaderboard', { method: 'POST', headers: token('admin') })).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
