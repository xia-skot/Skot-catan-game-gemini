import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { AddressInfo } from 'node:net';
import { buildAccountGameHistory, buildMonthlyLeaderboard, computeLeaderboardUserStats, eligibleLeaderboardGames, repairLegacySeatAttribution } from '../server/leaderboard';
import { beginLeaderboardGame, observeLeaderboardGame, hasUnsavedLeaderboardResult, persistLeaderboardResult } from '../server/leaderboardRecording';
import { resultRankPoints, storedResultRankPoints } from '../shared/gameResult';
import { canAcceptCriticalGameTransition } from '../shared/criticalGameTransition';
import { mongoLeaderboardStore, registerLeaderboardRoutes } from '../server/leaderboardRoutes';
import { createDemoLeaderboardStore } from '../server/leaderboardDemo';
import { verifiedRoomIdentity } from '../server/socketIdentity';
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
  assert.deepEqual([row.points, row.gameCount, row.wins], [3, 3, 3]);
  const response = buildMonthlyLeaderboard(records, users, '2026-09', 20, NOW, '0');
  assert.deepEqual(response.myGames?.map(game => game.points), [1, 1, 1]);
  assert.equal(response.myGames?.reduce((sum, game) => sum + game.points, 0), row.points);
  assert.equal(response.scoringVersion, 'human-rank-points-v22');
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

test('AI keep their overall rank but do not reduce human awards; guests and spectators never receive leaderboard entries', () => {
  const record = game();
  record.players[0].isBot = true;
  const accounts = users.map(user => user._id === '1' ? { ...user, isGuest: true } : user);
  record.players.push({ id: 99, name: 'Observer', isBot: false, score: 99, isSpectator: true } as any);
  const result = board([record], accounts);
  assert.deepEqual(result.entries.map(row => [row.userId, row.points]), [['2', 3], ['3', 1]]);
});

test('zx October history and monthly totals use the same two awards without mixing a namesake account', () => {
  const now = Date.parse('2026-10-01T13:00:00Z');
  const guestId = '6abe08bed82ddf96f4fa2e9f';
  const accounts = [
    { _id: guestId, username: 'zx', isGuest: false, createdAt: new Date('2026-09-01T00:00:00Z') },
    { _id: 'member-zx', username: 'zx', isGuest: false, createdAt: new Date('2026-09-01T00:00:00Z') },
    ...['snow', 'haha'].map(username => ({ _id: username, username, isGuest: false, createdAt: new Date('2026-09-01T00:00:00Z') })),
  ];
  const records = ['639283', '792081'].map((roomId, index) => game({
    gameId: roomId, roomId, mapType: 'archipelago', identityVersion: 2, scoringVersion: 'rank-points-v18',
    completedAt: new Date(`2026-10-01T${index ? '11' : '12'}:00:00Z`),
    players: [
      { id: 0, name: index ? 'haha' : 'snow', score: 14, userId: index ? 'haha' : 'snow', sessionId: index ? 'haha' : 'snow',
        isOriginalBot: false, isBot: false, isGuest: false, rankAward: { rank: 1, points: 2 } },
      { id: 1, name: 'zx', score: index ? 5 : 9, userId: guestId, sessionId: guestId,
        isOriginalBot: false, isBot: false, isGuest: false, rankAward: { rank: 2, points: 1 } },
    ],
  }));
  records.push(game({ gameId: 'namesake', roomId: 'namesake', identityVersion: 2,
    completedAt: new Date('2026-10-01T10:00:00Z'), players: [
      { id: 0, name: 'zx', score: 10, userId: 'member-zx', isOriginalBot: false, isGuest: false },
      { id: 1, name: 'AI', score: 5, userId: null, isOriginalBot: true, isGuest: true },
    ] }));
  const history = buildAccountGameHistory(records, accounts, guestId, now);
  const monthly = buildMonthlyLeaderboard(records, accounts, '2026-10', 20, now, guestId);
  assert.deepEqual(history.games.map(record => record.roomId), ['639283', '792081']);
  assert.deepEqual(history.stats, { totalGames: 2, wins: 0, winRate: 0 });
  const sum = history.games.reduce((total, record) => total + storedResultRankPoints(record.players,
    record.players.find((player: any) => String(player.id) === record.viewerPlayerId), record).points, 0);
  const row = monthly.entries.find(entry => entry.userId === guestId)!;
  assert.deepEqual([sum, row.points, row.gameCount], [2, 2, 2]);
  assert.deepEqual(monthly.myGames?.map(record => record.points), [1, 1]);
  const namesake = monthly.entries.find(entry => entry.userId === 'member-zx')!;
  assert.deepEqual([namesake.points, namesake.gameCount], [1, 1]);
  assert.deepEqual(buildAccountGameHistory(records, accounts, 'member-zx', now).games.map(record => record.roomId), ['namesake']);
  const spoofed = structuredClone(records[0]);
  spoofed.players[1].sessionId = 'member-zx';
  assert.equal(buildAccountGameHistory([spoofed], accounts, 'member-zx', now).games.length, 0);
});

test('history loads account-linked matches after renaming', () => {
  const records = [game({ identityVersion: 2, gameId: 'renamed', players: game().players.map((player: any) => ({
    ...player, userId: String(player.id), isOriginalBot: false })) })];
  const renamed = users.map(user => ({ ...user, username: `new-${user.username}` }));
  assert.deepEqual(buildAccountGameHistory(records, renamed, '0', NOW).stats, { totalGames: 1, wins: 1, winRate: 100 });
});

test('authenticated registered account survives recording and can collect its own solo win', async () => {
  const { room, state } = roomAndState();
  Object.assign(room.players[0], { userId: 'guest-id', isGuest: false });
  state.players[0].isBot = false;
  assert.equal(beginLeaderboardGame(room, state, 1000), true);
  let stored: any;
  await persistLeaderboardResult(room, game({ players: [{ ...state.players[0], score: 10 }, { ...state.players[1], score: 7 }] }),
    { updateOne: async (_filter: any, update: any) => { stored = update.$setOnInsert; } }, 2000);
  assert.equal(stored.players[0].userId, 'guest-id');
  assert.equal(stored.players[0].isGuest, false);
  const accounts = [{ ...users[0], _id: 'guest-id', isGuest: false }];
  assert.deepEqual(board([stored], accounts).entries.map(row => [row.userId, row.points]), [['guest-id', 1]]);
  assert.equal(buildAccountGameHistory([stored], accounts, 'guest-id', NOW).games.length, 1);
});

test('new stable IDs survive renamed users, exclude unverified users, and retain takeover humans', () => {
  const record = game({ identityVersion: 1, accountBindingVersion: 1, gameId: 'stable' });
  record.players = record.players.map((player, index) => ({ ...player, isBot: true, isOriginalBot: false,
    userId: index < 2 ? String(index) : null, sessionId: `s${index}` }));
  const accounts = users.map(user => ({ ...user, username: `renamed-${user.username}` }));
  assert.deepEqual(board([record], accounts).entries.map(row => [row.username, row.points]), [['renamed-A', 4], ['renamed-B', 3]]);
  record.players[0].userId = 'deleted-account';
  assert.deepEqual(board([record]).entries.map(row => row.userId), ['1']);
});

test('legacy fallback ignores guest namesakes, credits current members, but rejects duplicate seats and registered namesakes', () => {
  const collision = [...users, { ...users[0], _id: 'guest', username: ' a ', isGuest: true }];
  assert.equal(board([game()], collision).entries.some(row => row.userId === '0'), true);
  assert.equal(board([game()], [...users, { ...users[0], _id: 'other-member' }]).entries.some(row => row.userId === '0'), false);
  const duplicated = game();
  duplicated.players[1].name = 'A';
  assert.equal(board([duplicated]).entries.some(row => row.userId === '0'), false);
  const tooNew = users.map(user => ({ ...user, createdAt: new Date(NOW) }));
  assert.equal(board([game()], tooNew).entries.length, 4);
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
  assert.equal(beginLeaderboardGame(room, state, 0), true);
  const writes: any[] = [];
  const collection = { updateOne: async (...args: any[]) => { writes.push(args); } };
  const result = game({ players: [{ ...state.players[0], score: 10 }, { ...state.players[1], score: 7 }] });
  await persistLeaderboardResult(room, result, collection, 0);
  const stored = writes[0][1].$setOnInsert;
  assert.equal(stored.identityVersion, 2);
  assert.equal(stored.accountBindingVersion, 1);
  assert.equal(stored.scoringVersion, 'human-rank-points-v22');
  assert.match(stored.gameId, /^[a-f0-9-]{36}$/);
  assert.equal(stored.players[0].userId, '0');
  assert.equal(stored.players[0].isOriginalBot, false);
  assert.equal(stored.players[1].isOriginalBot, true);
  assert.equal(stored.players[1].userId, null);
  assert.deepEqual(stored.players[0].rankAward, { rank: 1, points: 1 });
  assert.deepEqual(board([stored]).entries.map(row => [row.userId, row.points]), [['0', 1]]);
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

test('unknown sessions stay unverified; legacy restored records recover only unambiguous registered accounts', async () => {
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
  assert.deepEqual(board([restored]).entries.map(row => [row.userId, row.points]), [['0', 4], ['1', 3], ['2', 3], ['3', 1]]);
  delete (room.players[0] as any).userId;
  assert.equal(beginLeaderboardGame(room, state), true);
  let stored: any;
  await persistLeaderboardResult(room, game({ players: [{ ...state.players[0], score: 10 }, { ...state.players[1], score: 7 }] }),
    { updateOne: async (_filter: any, update: any) => { stored = update.$setOnInsert; } });
  assert.equal(board([stored]).entries.length, 0);
});

test('restored October result plus a signed result give zx exactly two points in both history and monthly HTTP APIs', async () => {
  const now = Date.parse('2026-10-01T13:00:00Z');
  const accounts = ['zx', 'snow', 'haha'].map(username => ({ _id: username, username, isGuest: false,
    createdAt: new Date('2026-09-01T00:00:00Z') }));
  const records = ['639283', '792081'].map((roomId, index) => game({ roomId, gameId: roomId,
    mapType: 'archipelago', identityVersion: index ? 1 : 2,
    completedAt: new Date(`2026-10-01T${index ? '11' : '12'}:00:00Z`),
    players: [index ? 'haha' : 'snow', 'zx'].map((name, id) => ({ id, name,
      score: id ? (index ? 5 : 9) : 14, isBot: false, isOriginalBot: false,
      userId: index ? null : name, sessionId: index ? null : name, isGuest: !!index })),
  }));
  const original = structuredClone(records);
  const app = express(), secret = 'history-test-only';
  const authenticate = (req: any, res: any, next: any) => {
    try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), secret); next(); }
    catch { res.sendStatus(401); }
  };
  registerLeaderboardRoutes(app, authenticate,
    (req: any, res, next) => req.user.role === 'admin' ? next() : res.sendStatus(403), {
      readRecords: async () => ({ games: records, users: accounts }), readTopCount: async () => 20, writeTopCount: async () => {},
    }, () => now);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { Authorization: `Bearer ${jwt.sign({ userId: 'zx', role: 'admin' }, secret)}` };
  try {
    const history: any = await (await fetch(url + '/api/user/games', { headers })).json();
    const adminHistory: any = await (await fetch(url + '/api/admin/user/zx/games?userId=zx', { headers })).json();
    const monthly: any = await (await fetch(url + '/api/leaderboard?month=2026-10', { headers })).json();
    assert.deepEqual(history, adminHistory);
    assert.deepEqual(history.games.map((record: any) => [record.roomId, record.rankingStatus]), [['639283', 'counted'], ['792081', 'counted']]);
    const historyPoints = history.games.reduce((sum: number, record: any) => sum + record.players.find((p: any) => String(p.id) === record.viewerPlayerId).rankAward.points, 0);
    const row = monthly.entries.find((entry: any) => entry.userId === 'zx');
    assert.deepEqual([historyPoints, row.points, row.gameCount, history.stats.totalGames], [2, 2, 2, 2]);
    assert.equal(monthly.entries.find((entry: any) => entry.userId === 'haha').points, 2);
    assert.equal(monthly.myGames.length, 2);
    assert.deepEqual(records, original, 'read-time compatibility must not mutate the stored originals');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('legacy name-only recovery is independent of guest flags while verified new games require account IDs', () => {
  const restored = game({ identityVersion: 1, players: game().players.map((player: any) => ({ ...player,
    userId: null, sessionId: null, isOriginalBot: false, isGuest: true })) });
  const collision = [...users, { ...users[0], _id: 'guest-A', isGuest: true }];
  assert.equal(board([restored], collision).entries.some(row => row.userId === '0'), true);
  const pending = buildAccountGameHistory([restored], collision, '0', NOW);
  assert.equal(pending.games.length, 1);
  assert.equal(pending.games[0].rankingStatus, 'counted');
  assert.equal(board([restored], users.map(user => ({ ...user, createdAt: new Date(NOW) }))).entries.length, 4);
  assert.equal(board([{ ...restored, identityVersion: 2, scoringVersion: 'rank-points-v18', accountBindingVersion: 1 }]).entries.length, 0);
});

test('792081 credits zx independently whether hahaha is registered, a guest, or absent', () => {
  const now = Date.parse('2026-10-01T13:00:00Z');
  for (const opponentStatus of ['registered', 'guest', 'absent']) {
    for (const missingId of [null, 'old-guest-session']) {
      const accounts = ['zx', 'snow'].map(username => ({ _id: username, username, isGuest: false }));
      accounts.push({ _id: 'guest-zx', username: 'zx', isGuest: true });
      if (opponentStatus !== 'absent') accounts.push({ _id: 'hahaha', username: 'hahaha', isGuest: opponentStatus === 'guest' });
      const records = ['639283', '792081'].map((roomId, index) => game({ roomId, gameId: roomId,
        identityVersion: 2, scoringVersion: 'rank-points-v18', mapType: 'archipelago',
        completedAt: new Date(`2026-10-01T${index ? '11' : '12'}:00:00Z`),
        players: [index ? 'hahaha' : 'snow', 'zx'].map((name, id) => ({
          id, name, score: id ? (index ? 5 : 9) : 14, isOriginalBot: false, isBot: false,
          userId: index ? missingId : name, sessionId: `session-${id}`, isGuest: !!index,
          rankAward: { rank: id + 1, points: 2 - id },
        })),
      }));
      const original = structuredClone(records);
      const history = buildAccountGameHistory(records, accounts, 'zx', now);
      const monthly = buildMonthlyLeaderboard(records, accounts, '2026-10', 20, now, 'zx');
      assert.deepEqual(history.games.map(record => record.rankingStatus), ['counted', 'counted']);
      assert.deepEqual(history.games[1].players.map((player: any) => player.rankAward.points), [2, 1]);
      assert.deepEqual(history.games[1].players.map((player: any) => player.leaderboardUserId),
        [opponentStatus === 'registered' ? 'hahaha' : null, 'zx']);
      const zx = monthly.entries.find(entry => entry.userId === 'zx')!;
      assert.deepEqual([zx.points, zx.gameCount], [2, 2]);
      assert.equal(monthly.entries.find(entry => entry.userId === 'hahaha')?.points,
        opponentStatus === 'registered' ? 2 : undefined);
      assert.equal(monthly.entries.some(entry => entry.userId === 'guest-zx'), false);
      assert.deepEqual(records, original);
    }
  }
});

test('legacy account recovery preserves autoplay exclusion and never awards bots', () => {
  const record = game({ identityVersion: 2, durationMs: 10000, players: game().players.map((player: any) => ({
    ...player, isGuest: true, userId: null, isOriginalBot: player.id === 0, autoplayMs: player.id === 1 ? 5001 : 0,
  })) });
  const result = board([record]);
  assert.equal(result.entries.some(entry => entry.userId === '0'), false);
  assert.equal(result.entries.find(entry => entry.userId === '1')?.points, 0);
  assert.equal(result.entries.find(entry => entry.userId === '2')?.points, 3);
});

test('history retains unresolved outcomes without hiding them or presenting an invented zero', () => {
  const invalid = game({ winnerId: null });
  const history = buildAccountGameHistory([invalid], users, '0', NOW);
  assert.equal(history.games.length, 1);
  assert.equal(history.games[0].rankingStatus, 'pending');
  assert.match(history.games[0].rankingReason, /结算数据不完整/);
  assert.equal(board([invalid]).entries.length, 0);
  const first = game(), retry = { ...first, _id: 'retry', completedAt: new Date(NOW - 1) };
  assert.equal(buildAccountGameHistory([first, retry], users, '0', NOW).games.length, 1);
});

test('room authentication rejects expired, missing and mismatched tokens instead of silently losing a registered account', () => {
  const secret = 'room-test-only';
  const valid = jwt.sign({ userId: 'zx', isGuest: false }, secret);
  assert.deepEqual(verifiedRoomIdentity(valid, 'zx', secret), { accountId: 'zx', userId: 'zx', isGuest: false });
  assert.equal(verifiedRoomIdentity(valid, 'other', secret), null);
  assert.equal(verifiedRoomIdentity(undefined, 'zx', secret), null);
  assert.equal(verifiedRoomIdentity(valid, 'zx', 'other-secret'), null);
  assert.equal(verifiedRoomIdentity(jwt.sign({ userId: 'zx', isGuest: false }, secret, { expiresIn: -1 }), 'zx', secret), null);
  assert.deepEqual(verifiedRoomIdentity(jwt.sign({ userId: 'visitor', isGuest: true }, secret), 'visitor', secret),
    { accountId: 'visitor', userId: undefined, isGuest: true });
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
  assert.equal(projections[0].durationMs, 1);
  assert.equal(projections[0].accountBindingVersion, 1);
});

test('mixed rooms award human positions independent of AI, bots receive zero, and solo humans must actually win', () => {
  const players = [
    { id: 0, score: 10, isBot: true }, { id: 1, score: 9, isBot: false },
    { id: 2, score: 8, isBot: false }, { id: 3, score: 7, isBot: true },
  ];
  assert.deepEqual(players.map(player => resultRankPoints(players, player, { winnerId: 0 }).points), [0, 2, 1, 0]);
  const solo = players.filter(player => player.id !== 2);
  assert.equal(resultRankPoints(solo, solo[1], { winnerId: 0 }).points, 0);
  solo[1].score = 10;
  assert.equal(resultRankPoints(solo, solo[1], { winnerId: 0 }).points, 0, 'a tied non-winner is not a solo win');
  assert.equal(resultRankPoints(solo, solo[1], { winnerId: 1 }).points, 1);
});

test('mary receives one point behind an AI and old zero snapshots recalculate consistently in history and monthly totals', () => {
  const accounts = ['rose', 'mary'].map(username => ({ _id: username, username, isGuest: false, createdAt: new Date('2026-01-01T00:00:00Z') }));
  const record = game({ roomId: '135569', gameId: 'mary-mixed', identityVersion: 2,
    scoringVersion: 'rank-points-v18', durationMs: 10000,
    players: ['rose', '领主 AI 4', 'mary', '领主 AI 3'].map((name, id) => ({
      id, name, score: [10, 9, 8, 6][id], userId: id === 0 || id === 2 ? name : null,
      isOriginalBot: id === 1 || id === 3, isGuest: false, autoplayMs: 0,
      rankAward: { rank: id + 1, points: id === 0 ? 2 : 0 },
    })),
  });
  const original = structuredClone(record);
  const history = buildAccountGameHistory([record], accounts, 'mary', NOW);
  assert.deepEqual(history.games[0].players[2].rankAward, { rank: 3, points: 1 });
  assert.equal(history.games[0].scoringVersion, 'human-rank-points-v22');
  const monthly = buildMonthlyLeaderboard([record], accounts, '2026-09', 20, NOW, 'mary');
  assert.equal(monthly.entries.find(entry => entry.userId === 'mary')?.points, 1);
  assert.equal(monthly.myGames?.[0].points, 1);
  assert.deepEqual(record, original);
  record.players[2].autoplayMs = 5001;
  assert.equal(board([record], accounts).entries.find(entry => entry.userId === 'mary')?.points, 0);
});

test('server accumulates multiple autoplay periods, freezes at finish, and overrides forged timing', async () => {
  const { room, state } = roomAndState();
  state.players[0].isBot = false;
  beginLeaderboardGame(room, state, 1000);
  const update = (time: number, isBot: boolean, winnerId: number | null = null) =>
    observeLeaderboardGame(room, { ...state, winnerId, players: [{ ...state.players[0], isBot }, state.players[1]] }, time);
  update(2000, true);
  update(5000, false);
  update(6000, true);
  update(10000, false, 0);
  update(50000, true);
  let stored: any;
  await persistLeaderboardResult(room, game({ durationMs: 999999, players: [
    { ...state.players[0], score: 10, autoplayMs: 0 }, { ...state.players[1], score: 7 },
  ] }), { updateOne: async (_filter: any, update: any) => { stored = update.$setOnInsert; } }, 60000);
  assert.equal(stored.durationMs, 9000);
  assert.equal(stored.players[0].autoplayMs, 7000);
  assert.equal(stored.players[1].autoplayMs, 0);
  assert.deepEqual(board([stored]).entries.map(row => [row.points, row.gameCount, row.wins]), [[0, 1, 1]]);
  assert.equal(resultRankPoints(stored.players, stored.players[0], stored).points, 0);
});

test('opening dice reorder keeps account and autoplay attached to the same human', async () => {
  const room = { hostId: 'session-a', players: [0, 1, 2].map(index => ({ id: `session-${'abc'[index]}`, name: users[index].username, userId: String(index) })),
    settings: { playerCount: 4, mapType: 'archipelago', botConfig: [false, false, true, false] } };
  const initial = { players: [
    { id: 0, name: 'A', sessionId: 'session-a', isBot: false },
    { id: 1, name: 'B', sessionId: 'session-b', isBot: false },
    { id: 2, name: '领主 AI 3', isBot: true },
    { id: 3, name: 'C', sessionId: 'session-c', isBot: false },
  ] };
  assert.equal(beginLeaderboardGame(room, initial, 1000), true);
  const reordered = [
    { ...initial.players[3], id: 0, score: 14 },
    { ...initial.players[1], id: 1, score: 11 },
    { ...initial.players[0], id: 2, score: 11, isBot: true },
    { ...initial.players[2], id: 3, score: 4 },
  ];
  observeLeaderboardGame(room, { players: reordered }, 3000);
  let stored: any;
  await persistLeaderboardResult(room, game({ mapType: 'archipelago', winnerId: 0, players: reordered }),
    { updateOne: async (_filter: any, update: any) => { stored = update.$setOnInsert; } }, 9000);
  assert.equal(stored.identityVersion, 2);
  assert.deepEqual(stored.players.map((player: any) => player.userId), ['2', '1', '0', null]);
  assert.deepEqual(stored.players.map((player: any) => player.isOriginalBot), [false, false, false, true]);
  assert.equal(stored.players[2].autoplayMs, 6000);
  assert.deepEqual(stored.players.map((player: any) => player.rankAward), [
    { rank: 1, points: 3 }, { rank: 2, points: 2 }, { rank: 2, points: 0 }, { rank: 4, points: 0 },
  ]);
  const result = board([stored]);
  assert.deepEqual(result.entries.map(row => [row.userId, row.points]), [['2', 3], ['1', 2], ['0', 0]]);
  assert.deepEqual(stored.players.map((player: any) => storedResultRankPoints(stored.players, player, stored)),
    stored.players.map((player: any) => player.rankAward));
});

test('v17 seat permutation is repaired only when every registered name and linked account agree as a set', () => {
  const legacy = game({ identityVersion: 1, gameId: 'room-472304', roomId: '472304', mapType: 'archipelago',
    players: [
      { id: 0, name: 'C', score: 14, isBot: false, isOriginalBot: false, userId: '0', isGuest: false },
      { id: 1, name: 'B', score: 11, isBot: false, isOriginalBot: false, userId: '1', isGuest: false },
      { id: 2, name: 'A', score: 11, isBot: false, isOriginalBot: true, userId: null, isGuest: true },
      { id: 3, name: '领主 AI 3', score: 4, isBot: true, isOriginalBot: false, userId: '2', isGuest: false },
    ] });
  assert.deepEqual(eligibleLeaderboardGames([legacy], NOW)[0].players.map(player => player.userId), ['0', '1', null, '2']);
  const repaired = repairLegacySeatAttribution(legacy, users);
  assert.deepEqual(repaired.players.map((player: any) => player.userId), ['2', '1', '0', null]);
  assert.deepEqual(board([legacy]).entries.map(row => [row.userId, row.points]), [['2', 3], ['0', 2], ['1', 2]]);
  assert.deepEqual(repaired.players.map((player: any) => storedResultRankPoints(repaired.players, player, repaired).points), [3, 2, 2, 0]);
  const renamed = users.map(user => user._id === '2' ? { ...user, username: 'renamed' } : user);
  assert.equal(repairLegacySeatAttribution(legacy, renamed), legacy);
});

test('server accepts the first dice and blockade actions but rejects a second result in the same turn', () => {
  const players = [{ sessionId: 'human', isBot: false }, { isBot: true }];
  const base = { turn: 4, currentPlayerIndex: 1, phase: 'main', hasRolled: false, dice: [0, 0], robberHexId: 'old', pirateHexId: null, players };
  const first = { ...base, hasRolled: true, dice: [2, 3] };
  assert.equal(canAcceptCriticalGameTransition(base, first, 'controller', 'controller'), true);
  assert.equal(canAcceptCriticalGameTransition(first, { ...first, dice: [6, 1] }, 'controller', 'controller'), false);
  assert.equal(canAcceptCriticalGameTransition(base, first, 'other', 'controller'), false);
  const robber = { ...first, phase: 'robber' };
  const moved = { ...robber, phase: 'main', robberHexId: 'first' };
  assert.equal(canAcceptCriticalGameTransition(robber, moved, 'controller', 'controller'), true);
  assert.equal(canAcceptCriticalGameTransition(moved, { ...moved, robberHexId: 'second' }, 'controller', 'controller'), false);
  assert.equal(canAcceptCriticalGameTransition(robber, moved, 'other', 'controller'), false);
});

test('exactly half autoplay retains points; one millisecond more cancels points without erasing history', () => {
  const record = game({ identityVersion: 1, durationMs: 10000 });
  record.players = record.players.map((player: any) => ({ ...player, isOriginalBot: false, userId: String(player.id), autoplayMs: 5000 }));
  assert.equal(board([record]).entries.find(row => row.userId === '0')!.points, 4);
  record.players[0].autoplayMs = 5001;
  const response = buildMonthlyLeaderboard([record], users, '2026-09', 20, NOW, '0');
  assert.equal(response.entries.find(row => row.userId === '0')!.points, 0);
  assert.equal(response.myGames![0].points, 0);
  assert.equal(computeLeaderboardUserStats([record], users, NOW).get('0')!.wins, 1);
  delete record.durationMs;
  assert.equal(board([record]).entries.find(row => row.userId === '0')!.points, 4, 'legacy history cannot invent missing timing');
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
    assert.equal(result.entries[0].points, 5); // Two humans: wins 2 + 2, second place 1.
    assert.equal(result.entries[0].email, undefined);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    for (const query of ['month=2026-13', 'month=2026-1', 'month=2026-09&month=2026-08', 'month[$gt]=2026']) {
      assert.equal((await fetch(url + '/api/leaderboard?' + query, { headers: token('user') })).status, 400);
    }
    assert.equal((await fetch(url + '/api/leaderboard', { method: 'POST', headers: token('admin') })).status, 404);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
