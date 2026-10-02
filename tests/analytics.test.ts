import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { buildAnalytics, completedGames, parseAnalyticsQuery } from '../server/analytics';
import { registerAnalyticsRoutes } from '../server/analyticsRoutes';

const now = Date.parse('2026-10-05T04:00:00Z'); // Monday noon in Beijing.
const users = [{ _id: '1', isGuest: false, createdAt: new Date('2026-10-04T16:00:00Z') },
  { _id: '2', isGuest: true, username: '游客', password: 'must-not-leak', createdAt: new Date('2026-09-30T16:00:00Z') }];
const games = [
  { _id: 'a', roomId: 'same', completedAt: new Date('2026-09-30T15:59:59Z') },
  { _id: 'b', roomId: 'same', completedAt: new Date('2026-09-30T16:00:00Z') },
  { _id: 'c', gameId: 'unique', completedAt: new Date('2026-10-04T15:59:59Z') },
  { _id: 'd', gameId: 'unique', completedAt: new Date('2026-10-04T15:59:59Z') },
  { _id: 'e', completedAt: new Date('2026-10-04T16:00:00Z') },
  { _id: 'f', phase: 'playing', completedAt: new Date('2026-10-05T03:00:00Z') },
  { _id: 'g', completedAt: 'broken' },
  { _id: 'h', completedAt: new Date(now + 1) },
];
test('counts whole completed games, keeps reused room codes, deduplicates game IDs', () => {
  assert.equal(completedGames(games, now).length, 4);
  const data = buildAnalytics(users, games, 'day', now, now);
  assert.deepEqual(data.totals, { registered: 1, guests: 1, games: 4, today: 1, week: 1, month: 3 });
  assert.deepEqual(data.rows[0], { start: '2026-10-05', end: '2026-10-05', games: 1, registered: 1, guests: 0 });
  assert.equal(data.rows.length, 14);
});
test('weeks start Monday and months cross year/leap boundaries without timezone drift', () => {
  const weekly = buildAnalytics(users, games, 'week', now, now);
  assert.equal(weekly.rows[0].start, '2026-10-05');
  assert.equal(weekly.rows[1].start, '2026-09-28');
  assert.equal(weekly.rows[1].games, 3);
  const leap = buildAnalytics([], [], 'month', Date.parse('2024-03-15T00:00:00Z'), now);
  assert.equal(leap.rows[1].end, '2024-02-29');
  assert.equal(leap.rows[3].start, '2023-12-01');
  for (const date of ['2026-02-30', '2027-01-01', 'bad', ['2026-10-05']]) assert.throws(() => parseAnalyticsQuery({ date }, now));
  assert.throws(() => parseAnalyticsQuery({ period: ['day'] }, now));
  assert.equal(parseAnalyticsQuery({}, now).period, 'day');
});
test('admin-only endpoints, guest allowlist, quota validation, unknown quota and partial storage', async () => {
  const app = express(); app.use(express.json());
  let capacity: number | null = null, scope: 'cluster' | 'database' = 'cluster', fail = false;
  const gate: any = (req: any, res: any, next: any) => req.headers.authorization === 'admin' ? next() : res.sendStatus(403);
  registerAnalyticsRoutes(app, gate, gate, { readRecords: async () => ({ users, games }), readCapacity: async () => capacity,
    writeCapacity: async bytes => { capacity = bytes; }, readStorage: async () => {
      if (fail) throw new Error('secret-uri');
      return { usedBytes: 128, scope, dataBytes: 100, indexBytes: 28 };
    } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as any).port;
  const request = (path: string, options: RequestInit = {}) => fetch(`http://127.0.0.1:${port}/api/admin/${path}`, { headers: { authorization: 'admin', 'content-type': 'application/json' }, ...options });
  try {
    for (const path of ['analytics', 'guests', 'database-storage']) assert.equal((await request(path, { headers: {} })).status, 403);
    assert.equal((await request('database-storage', { method: 'PUT', headers: {}, body: '{}' })).status, 403);
    assert.equal((await request('analytics?date=2026-02-30')).status, 400);
    const guests = await (await request('guests')).json();
    assert.equal(guests.guests.length, 1); assert.equal(guests.guests[0].password, undefined);
    assert.equal((await (await request('database-storage')).json()).remainingBytes, null);
    assert.equal((await request('database-storage', { method: 'PUT', body: '{"capacityMiB":0}' })).status, 400);
    await request('database-storage', { method: 'PUT', body: '{"capacityMiB":512}' });
    assert.equal((await (await request('database-storage')).json()).remainingBytes, 512 * 1024 * 1024 - 128);
    scope = 'database'; assert.equal((await (await request('database-storage')).json()).remainingBytes, null);
    fail = true; const failed = await request('database-storage'); assert.equal(failed.status, 503);
    assert.ok(!(await failed.text()).includes('secret-uri'));
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
