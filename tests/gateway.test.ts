import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import worker from '../gateway/worker';
import { DEFAULT_GATEWAY_CONFIG, gatewayTarget, validateGatewayConfig } from '../shared/gateway';
import { registerGatewayRoutes } from '../server/gatewayRoutes';

const config = { enabled: true, fallback: 'https://skot-game01.onrender.com',
  sites: { early: 'https://one.onrender.com', middle: 'https://two.onrender.com', late: 'https://three.onrender.com' } };
function environment() {
  const stored = new Map<string, string>();
  return { ROUTING: { get: async (key: string) => stored.get(key) ?? null, put: async (key: string, value: string) => { stored.set(key, value); } },
    GATEWAY_ADMIN_TOKEN: 'test-secret-for-gateway-at-least-32-characters' };
}

test('calendar routing changes exactly at Shanghai midnight, including month ends and leap days', () => {
  for (const [date, slot] of [
    ['2026-09-10T15:59:59Z', 'early'], ['2026-09-10T16:00:00Z', 'middle'],
    ['2026-09-20T15:59:59Z', 'middle'], ['2026-09-20T16:00:00Z', 'late'],
    ['2026-09-30T16:00:00Z', 'early'], ['2024-02-29T15:59:59Z', 'late'],
  ]) assert.equal(gatewayTarget(config, new Date(date)).slot, slot);
  assert.equal(gatewayTarget(config, new Date(), 'early').origin, config.sites.early);
  assert.equal(gatewayTarget({ ...config, enabled: false }).origin, config.fallback);
  assert.equal(gatewayTarget(DEFAULT_GATEWAY_CONFIG).origin, DEFAULT_GATEWAY_CONFIG.fallback);
});

test('configuration rejects incomplete enabled routes, credentials, arbitrary redirects and non-HTTPS origins', () => {
  assert.deepEqual(validateGatewayConfig(config), config);
  assert.deepEqual(validateGatewayConfig(DEFAULT_GATEWAY_CONFIG), DEFAULT_GATEWAY_CONFIG);
  assert.throws(() => validateGatewayConfig({ ...DEFAULT_GATEWAY_CONFIG, enabled: true }));
  for (const bad of ['http://one.onrender.com', 'https://evil.test', 'https://one.onrender.com.evil.test',
    'https://u:p@one.onrender.com', 'https://one.onrender.com/path', 'https://one.onrender.com/?url=evil',
    'https://one.onrender.com:8443', 'javascript:alert(1)', 'https://127.0.0.1']) {
    assert.throws(() => validateGatewayConfig({ ...config, fallback: bad }));
  }
});

test('Worker protects config writes, persists outside Render and exposes only public route information', async () => {
  const env = environment();
  const url = 'https://entry.example/api/admin/config';
  const auth = { Authorization: `Bearer ${env.GATEWAY_ADMIN_TOKEN}` };
  assert.equal((await worker.fetch(new Request(url), env)).status, 401);
  assert.equal((await worker.fetch(new Request(url, { method: 'PUT', body: JSON.stringify(config) }), env)).status, 401);
  const saved = await worker.fetch(new Request(url, { method: 'PUT', headers: auth, body: JSON.stringify(config) }), env);
  assert.equal(saved.status, 200);
  assert.deepEqual(await (await worker.fetch(new Request(url, { headers: auth }), env)).json(), config);
  const route = await worker.fetch(new Request('https://entry.example/api/route?site=early'), env);
  assert.deepEqual(await route.json(), { slot: 'early', origin: config.sites.early, healthUrl: `${config.sites.early}/api/health` });
  const page = await worker.fetch(new Request('https://entry.example/?site=early&room=123456&token=private&redirect=https://evil.test'), env);
  const html = await page.text();
  assert.match(html, /location\.replace\("https:\/\/one.onrender.com\/\?room=123456"\)/);
  assert.doesNotMatch(html, /private|evil\.test|test-secret/);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  assert.ok(page.headers.get('Content-Security-Policy')?.includes('frame-ancestors'));
  assert.equal((await worker.fetch(new Request('https://entry.example/missing'), env)).status, 404);
});

test('public entry falls back to the default game site when KV is not bound', async () => {
  const response = await worker.fetch(new Request('https://entry.example/'), { GATEWAY_ADMIN_TOKEN: '' });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /skot-game01\.onrender\.com/);
});

test('automatic routing cannot replace a working config without an eligible site; fixed recovery remains available', async () => {
  const env = environment(), now = Date.now(), month = new Date(now).toISOString().slice(0, 7);
  const automatic = { ...config, enabled: false, bandwidth: { enabled: true, quotaGB: 5, reserveGB: 0.7 } };
  await env.ROUTING.put('routing', JSON.stringify(config));
  const save = (value: unknown) => worker.fetch(new Request('https://entry.example/api/admin/config', {
    method: 'PUT', headers: { Authorization: `Bearer ${env.GATEWAY_ADMIN_TOKEN}` }, body: JSON.stringify(value),
  }), env);
  const row = { id: 'test', origin: config.sites.early, usedGB: 1, observedGB: 1, complete: true, healthy: true, checkedAt: now, measuredAt: now };
  for (const invalid of [null, { ...row, complete: false }, { ...row, healthy: false }, { ...row, error: 'API failure' },
    { ...row, checkedAt: now - 7200000 }, { ...row, measuredAt: now - 14400000 }, { ...row, usedGB: 4.3 }, { ...row, origin: 'https://other.onrender.com' }]) {
    await env.ROUTING.put(`bandwidth:snapshot:${month}`, JSON.stringify(invalid ? { month, checkedAt: now, rows: [invalid] } : null));
    const response = await save(automatic);
    assert.equal(response.status, 409);
    assert.equal((await response.json() as any).code, 'BANDWIDTH_NOT_READY');
    assert.deepEqual(JSON.parse((await env.ROUTING.get('routing'))!), config);
    assert.equal((await worker.fetch(new Request('https://entry.example/api/route'), env)).status, 200);
  }
  await env.ROUTING.put(`bandwidth:snapshot:${month}`, JSON.stringify({ month, checkedAt: now, rows: [row] }));
  assert.equal((await save(automatic)).status, 200);
  await env.ROUTING.put(`bandwidth:snapshot:${month}`, 'null');
  assert.equal((await worker.fetch(new Request('https://entry.example/api/route'), env)).status, 503);
  assert.equal((await save({ ...automatic, bandwidth: { ...automatic.bandwidth, enabled: false } })).status, 200);
  assert.equal((await worker.fetch(new Request('https://entry.example/api/route'), env)).status, 200);
});

test('game API preserves the actionable automatic-routing rejection', async () => {
  const app = express(); app.use(express.json());
  registerGatewayRoutes(app, (_req, _res, next) => next(), (_req, _res, next) => next(), {
    url: 'https://entry.example', token: 'test-private-token-at-least-32-characters',
    fetcher: (async () => Response.json({ code: 'BANDWIDTH_NOT_READY' }, { status: 409 })) as typeof fetch,
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/gateway`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config),
    });
    assert.equal(response.status, 409);
    assert.match((await response.json() as any).error, /原入口配置保持不变/);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Worker reports configuration storage failures without redirecting to a guessed destination', async () => {
  const env = environment();
  env.ROUTING.get = async () => { throw new Error('unavailable'); };
  assert.equal((await worker.fetch(new Request('https://entry.example/'), env)).status, 503);
});

test('game API requires an administrator, keeps secrets server-side, and validates upstream acknowledgments', async () => {
  const app = express(); app.use(express.json());
  const secret = 'test-server-private-token-32-characters';
  let fetched = 0;
  registerGatewayRoutes(app,
    (req: any, res, next) => req.headers.authorization ? next() : res.sendStatus(401),
    (req, res, next) => req.headers.authorization === 'admin' ? next() : res.sendStatus(403),
    { url: 'https://entry.example', token: secret, fetcher: (async (url, init) => {
      fetched++;
      assert.equal(String(url), 'https://entry.example/api/admin/config');
      assert.equal((init!.headers as any).Authorization, `Bearer ${secret}`);
      assert.equal(init!.redirect, 'error');
      return Response.json(init!.method === 'PUT' ? { success: true, config } : config);
    }) as typeof fetch });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/gateway`;
  try {
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: { Authorization: 'player' } })).status, 403);
    const read = await (await fetch(url, { headers: { Authorization: 'admin' } })).text();
    assert.equal(JSON.parse(read).configured, true);
    assert.equal(read.includes(secret), false);
    const put = (body: unknown) => fetch(url, { method: 'PUT', headers: { Authorization: 'admin', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await put({ ...config, fallback: 'https://localhost' })).status, 400);
    assert.equal((await put(config)).status, 200);
    assert.equal(fetched, 2);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('scheduled health checks are optional and do not download the game or static assets', async () => {
  const env = environment();
  await env.ROUTING.put('routing', JSON.stringify(config));
  const originalFetch = globalThis.fetch;
  const visited: string[] = [];
  globalThis.fetch = (async url => { visited.push(String(url)); return Response.json({ status: 'ok' }); }) as typeof fetch;
  try {
    await worker.scheduled({}, env);
    assert.equal(visited.length, 0);
    await worker.scheduled({}, { ...env, KEEP_ALIVE: 'true' });
    assert.ok(visited.length >= 1 && visited.length <= 2);
    assert.ok(visited.every(url => /^https:\/\/(one|two|three)\.onrender\.com\/api\/health$/.test(url)));
    visited.length = 0;
    await worker.scheduled({}, { ...env, KEEP_ALIVE: 'true', ENTRY_ORIGIN: 'https://skot-game.onrender.com' });
    assert.ok(visited.includes('https://skot-game.onrender.com/api/health'));
  } finally { globalThis.fetch = originalFetch; }
});
