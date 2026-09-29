import assert from 'node:assert/strict';
import test from 'node:test';
import { entryConfig, resolveTarget } from './server.js';
import { createServer } from './server.js';

const config = entryConfig({
  ROUTING_API_URL: 'https://skot.catan-game.workers.dev/api/route',
  FALLBACK_GAME_URL: 'https://skot-game01.onrender.com',
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
