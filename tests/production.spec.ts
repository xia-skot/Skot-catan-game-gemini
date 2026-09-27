import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import manifest from '../src/assetManifest.json' with { type: 'json' };

test('production serves local assets and cannot enable demo through a URL or flag', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'Server check is browser independent');
  const portProbe = createServer().listen(0, '127.0.0.1');
  await new Promise<void>(resolve => portProbe.once('listening', resolve));
  const port = (portProbe.address() as { port: number }).port;
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  const env = { ...process.env, NODE_ENV: 'production', PORT: String(port), MONGODB_URI: '', JWT_SECRET: 'local-production-smoke-test-only' };
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], { env, stdio: 'pipe', windowsHide: true });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await expect.poll(async () => {
      try { return (await request.get(base + '/api/health')).status(); } catch { return 0; }
    }, { timeout: 15000, message: 'Production server must boot without a database for this isolated smoke check' }).toBe(200);
    const image = await request.get(base + Object.values(manifest.images)[0]);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toContain('image/');
    expect(image.headers()['cache-control']).toContain('immutable');
    const demo = await request.get(base + '/api/demo/session?demo=1');
    expect(demo.headers()['content-type']).not.toContain('application/json');
    expect(await demo.text()).not.toContain('demo@example.test');
    expect((await request.get(base + '/api/proxy-image?url=http://127.0.0.1/private')).status()).toBe(400);
    const login = await request.get(base + '/api/me');
    expect(login.status()).toBe(401);
  } finally {
    const stopped = new Promise<void>(resolve => child.once('exit', () => resolve()));
    child.kill();
    await stopped;
  }
  const forbidden = spawn(process.execPath, ['--import', 'tsx', 'server.ts', '--demo'], { env, stdio: 'pipe', windowsHide: true });
  let error = '';
  forbidden.stderr.on('data', data => { error += data; });
  const exitCode = await new Promise<number | null>(resolve => forbidden.once('exit', resolve));
  expect(exitCode).not.toBe(0);
  expect(error).toContain('Demo is disabled in production');
});
