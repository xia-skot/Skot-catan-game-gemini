import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { entryConfig, resolveTarget } from './server.js';
import { createServer } from './server.js';

const config = entryConfig({
  ROUTING_API_URL: 'https://skot.catan-game.workers.dev/api/route',
  FALLBACK_GAME_URL: 'https://skot-game01.onrender.com',
});

test('entry shares stable guest identity and only navigates an authenticated game frame to known nodes', async () => {
  const server = createServer({ config });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const script = await (await fetch(`http://127.0.0.1:${server.address().port}/launcher.js`)).text();
    const storage = new Map(), replies = [], handlers = {};
    const frame = { src: 'https://skot-game01.onrender.com/', contentWindow: { postMessage: (...args) => replies.push(args) } };
    runInNewContext(script, { URL, crypto: { randomUUID: () => 'a'.repeat(36) }, navigator: {}, document: { querySelector: () => frame },
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
      window: { addEventListener: (event, fn) => handlers[event] = fn } });
    const send = (data, origin = 'https://skot-game01.onrender.com', source = frame.contentWindow) => handlers.message({ data, origin, source });
    send({ type: 'catan:session-request', guestDeviceKey: 'b'.repeat(36) });
    assert.equal(replies[0][0].guestDeviceKey, 'b'.repeat(36));
    send({ type: 'catan:session-request', guestDeviceKey: 'c'.repeat(36) });
    assert.equal(replies[1][0].guestDeviceKey, 'b'.repeat(36));
    send({ type: 'catan:invitation-navigate', url: 'https://evil.onrender.com/' });
    assert.equal(frame.src, 'https://skot-game01.onrender.com/');
    send({ type: 'catan:invitation-navigate', url: 'https://skot-game02.onrender.com/?room=123456&invite=abc' }, 'https://attacker.example');
    assert.equal(frame.src, 'https://skot-game01.onrender.com/');
    send({ type: 'catan:invitation-navigate', url: 'https://skot-game02.onrender.com/?room=123456&invite=abc' });
    assert.equal(frame.src, 'https://skot-game02.onrender.com/?room=123456&invite=abc');
    send({ type: 'catan:session-request' }, 'https://skot-game02.onrender.com');
    assert.equal(replies.at(-1)[0].guestDeviceKey, 'b'.repeat(36));
    send({ type: 'catan:session-clear' }, 'https://skot-game02.onrender.com');
    assert.equal(storage.get('catan_shared_guest_device_key'), 'b'.repeat(36));
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('uses the game target returned by the routing API', async () => {
  const target = await resolveTarget('/?site=middle', 'skot-game.onrender.com', {
    config,
    fetcher: async (url) => {
      assert.equal(url.searchParams.get('site'), 'middle');
      return Response.json({ slot: 'middle', origin: 'https://game-middle.onrender.com' });
    },
  });
  assert.deepEqual(target, { origin: 'https://game-middle.onrender.com', slot: 'middle', source: 'routing-api' });
});

test('prevents a redirect loop and uses the fallback game', async () => {
  const target = await resolveTarget('/', 'skot-game.onrender.com', {
    config,
    fetcher: async () => Response.json({ slot: 'late', origin: 'https://skot-game.onrender.com' }),
  });
  assert.equal(target.origin, 'https://skot-game01.onrender.com');
  assert.equal(target.source, 'fallback');
});

test('uses the fallback when the routing API is unavailable', async () => {
  const target = await resolveTarget('/', 'skot-game.onrender.com', {
    config,
    fetcher: async () => { throw new Error('offline'); },
  });
  assert.equal(target.origin, 'https://skot-game01.onrender.com');
});

test('does not fall back to an exhausted site after a bandwidth rejection', async () => {
  await assert.rejects(resolveTarget('/', 'skot-game.onrender.com', {
    config, fetcher: async () => Response.json({ code: 'BANDWIDTH_UNAVAILABLE' }, { status: 503 }),
  }), /BANDWIDTH_UNAVAILABLE/);
});

test('entry health wakes the selected game service', async () => {
  const visited = [];
  const server = createServer({
    config,
    fetcher: async () => Response.json({ slot: 'early', origin: 'https://game-early.onrender.com' }),
    healthFetcher: async (url) => {
      visited.push(String(url));
      return Response.json({ status: 'ok' });
    },
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(visited, ['https://game-early.onrender.com/api/health']);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('launcher keeps the entry URL and embeds the selected game', async () => {
  const server = createServer({
    config,
    fetcher: async () => Response.json({ slot: 'late', origin: 'https://game-late.onrender.com' }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/?room=123456`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
    assert.match(html, /iframe src="https:\/\/game-late\.onrender\.com\/\?room=123456"/);
    const manifest = await (await fetch(`http://127.0.0.1:${address.port}/manifest.json`)).json();
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.icons.length, 1);
    assert.equal(manifest.icons[0].sizes, '512x512');
    assert.equal(manifest.icons[0].src, '/catan-home-v37-512.png');
    assert.match(html, /rel="apple-touch-icon" sizes="512x512" href="\/catan-home-v37-512.png"/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('high resolution entry icon is served locally even with game and routing services offline', async () => {
  const server = createServer({ config, fetcher: async () => { throw new Error('offline'); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/catan-home-v37-512.png`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.deepEqual(bytes, readFileSync(new URL('./catan-icon-v18-512.png', import.meta.url)));
    assert.deepEqual(Buffer.from(await (await fetch(`${base}/catan-icon-v19-512.png`)).arrayBuffer()), readFileSync(new URL('./catan-icon-v19-512.png', import.meta.url)));
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.equal(bytes.readUInt32BE(16), 512);
    assert.equal(bytes.readUInt32BE(20), 512);
    const head = await fetch(`${base}/catan-home-v37-512.png`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    assert.equal(head.headers.get('content-length'), String(bytes.length));
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
