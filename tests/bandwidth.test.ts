import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateBandwidth, chooseBandwidthTarget, collectBandwidth, mergeSamples, readSnapshot, RENDER_SITES, type Snapshot } from '../gateway/bandwidth';
import { validateGatewayConfig } from '../shared/gateway';
import worker from '../gateway/worker';
const now = Date.parse('2026-09-30T08:00:00Z');
const hour = 3600000;
const config = validateGatewayConfig({ enabled: false, fallback: RENDER_SITES[0].origin,
  sites: Object.fromEntries(RENDER_SITES.map(s => [s.slot, s.origin])), bandwidth: { enabled: true, quotaGB: 5, reserveGB: 0.7 } });
function environment() {
  const storage = new Map<string, string>();
  return { ROUTING: { get: async (k: string) => storage.get(k) ?? null, put: async (k: string, v: string) => { storage.set(k, v); } },
    RENDER_API_KEY_01: 'secret1', RENDER_API_KEY_02: 'secret2', RENDER_API_KEY_03: 'secret3',
    GATEWAY_ADMIN_TOKEN: 'test-private-admin-key-at-least-32-characters' };
}
function snapshot(): Snapshot {
  return { month: '2026-09', checkedAt: now, active: RENDER_SITES[0].origin,
    rows: RENDER_SITES.map(s => ({ id: s.id, origin: s.origin, observedGB: 1, usedGB: 1, complete: true, healthy: true, checkedAt: now, measuredAt: now - hour })) };
}
test('threshold rotation, sticky destination, stale, incomplete and exhausted data', () => {
  const s = snapshot();
  assert.equal(chooseBandwidthTarget(config, s, now)?.origin, RENDER_SITES[0].origin);
  s.rows[0].usedGB = 4.3;
  assert.equal(chooseBandwidthTarget(config, s, now)?.origin, RENDER_SITES[1].origin);
  s.active = RENDER_SITES[1].origin;
  s.rows[0].usedGB = 1;
  assert.equal(chooseBandwidthTarget(config, s, now)?.origin, s.active);
  assert.equal(chooseBandwidthTarget(config, s, now + 2 * hour), null);
  for (const row of s.rows) row.complete = false;
  assert.equal(chooseBandwidthTarget(config, s, now), null);
  for (const row of s.rows) { row.complete = true; row.usedGB = 5; }
  assert.equal(chooseBandwidthTarget(config, s, now), null);
  s.month = '2026-08';
  assert.equal(chooseBandwidthTarget(config, s, now), null);
});
test('hourly samples deduplicate, update corrections, and convert units', () => {
  const points = {};
  const series = [{ unit: 'MB', labels: [{ field: 'service', value: 'srv-test' }], values: [{ timestamp: new Date(now - hour).toISOString(), value: 1500 }] }];
  mergeSamples(points, series, 'srv-test', now - 2 * hour, now);
  mergeSamples(points, series, 'srv-test', now - 2 * hour, now);
  assert.equal(Object.values(points).reduce((a: number, b: number) => a + b, 0), 1.5);
  series[0].values[0].value = 1600;
  mergeSamples(points, series, 'srv-test', now - 2 * hour, now);
  assert.deepEqual(Object.values(points), [1.6]);
  assert.throws(() => mergeSamples({}, [{ ...series[0], unit: 'unknown' }], 'x', 0, now));
});
test('collector matches IDs, aggregates workspace services, requires first-month calibration and never exposes keys', async () => {
  const env = environment();
  let calls = 0;
  const fetcher = (async (url: any, options: any) => {
    calls++;
    const u = new URL(String(url));
    if (u.pathname === '/api/health') return Response.json({ status: 'ok' });
    const i = Number(options.headers.Authorization.slice(-1)) - 1;
    const site = RENDER_SITES[i];
    const service = { id: site.id, ownerId: `owner${i}`, serviceDetails: { url: site.origin } };
    if (u.pathname === `/v1/services/${site.id}`) return Response.json(service);
    if (u.pathname === '/v1/services') return Response.json([{ service }, { service: { id: `other${i}`, ownerId: `owner${i}` } }]);
    assert.equal(u.pathname, '/v1/metrics/bandwidth');
    return Response.json([{ unit: 'GB', labels: [{ field: 'service', value: u.searchParams.get('resource') }],
      values: [{ timestamp: new Date(now - hour).toISOString(), value: 0.5 }] }]);
  }) as typeof fetch;
  const result = await collectBandwidth(env, config, now, fetcher);
  assert.equal(result!.rows[0].usedGB, 1);
  assert.equal(result!.rows[0].complete, false);
  assert.equal(chooseBandwidthTarget(config, result, now), null);
  assert.equal(JSON.stringify(result).includes('secret1'), false);
  const before = calls;
  await collectBandwidth(env, config, now + 1000, fetcher);
  assert.equal(calls, before);
  await calibrateBandwidth(env, RENDER_SITES[0].id, 3.5, now);
  const calibrated = await readSnapshot(env, now);
  assert.equal(calibrated!.rows[0].usedGB, 3.5);
  assert.equal(chooseBandwidthTarget(config, calibrated, now)?.origin, RENDER_SITES[0].origin);
  await collectBandwidth(env, config, now + 20 * 60000, fetcher);
  assert.equal((await readSnapshot(env, now))!.rows[0].usedGB, 3.5);
  await assert.rejects(calibrateBandwidth(env, RENDER_SITES[0].id, 0, now));
});
test('admin metrics require authentication and public routing does not silently bypass missing usage', async () => {
  const env = environment();
  await env.ROUTING.put('routing', JSON.stringify(config));
  assert.equal((await worker.fetch(new Request('https://entry.test/api/admin/bandwidth'), env)).status, 401);
  const response = await worker.fetch(new Request('https://entry.test/api/route'), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json() as any).code, 'BANDWIDTH_UNAVAILABLE');
  const pinned = await worker.fetch(new Request('https://entry.test/api/route?site=early'), env);
  assert.equal((await pinned.json() as any).origin, RENDER_SITES[0].origin);
});
