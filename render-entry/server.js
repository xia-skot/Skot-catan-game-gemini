import http from 'node:http';
import { pathToFileURL } from 'node:url';

const DEFAULT_ROUTING_API = 'https://skot.catan-game.workers.dev/api/route';
const DEFAULT_FALLBACK = 'https://skot-game01.onrender.com';
const REQUEST_TIMEOUT_MS = 15_000;

function renderOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.onrender\.com$/.test(url.hostname) ||
      url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Render target must be an HTTPS onrender.com origin');
  }
  return url.origin;
}

function routingApi(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error('Invalid routing API URL');
  return url;
}

export function entryConfig(env = process.env) {
  return {
    routingApiUrl: routingApi(env.ROUTING_API_URL || DEFAULT_ROUTING_API),
    fallbackOrigin: renderOrigin(env.FALLBACK_GAME_URL || DEFAULT_FALLBACK),
  };
}

export async function resolveTarget(requestUrl, host, options = {}) {
  const config = options.config || entryConfig();
  const fetcher = options.fetcher || fetch;
  const request = new URL(requestUrl, `https://${host}`);
  const api = new URL(config.routingApiUrl);
  const site = request.searchParams.get('site');
  if (site && ['early', 'middle', 'late'].includes(site)) api.searchParams.set('site', site);

  try {
    const response = await fetcher(api, { redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`routing API returned ${response.status}`);
    const data = await response.json();
    const origin = renderOrigin(data.origin);
    if (new URL(origin).host === host) throw new Error('routing target points back to the entry service');
    return { origin, slot: data.slot || null, source: 'routing-api' };
  } catch (error) {
    console.warn(JSON.stringify({ event: 'routing-fallback', reason: error instanceof Error ? error.message : String(error) }));
    return { origin: config.fallbackOrigin, slot: null, source: 'fallback' };
  }
}

function destinationUrl(origin, requestUrl, host) {
  const request = new URL(requestUrl, `https://${host}`);
  const destination = new URL(origin);
  const room = request.searchParams.get('room');
  if (room && /^[a-zA-Z0-9-]{1,32}$/.test(room)) destination.searchParams.set('room', room);
  return destination;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(value));
}

export function createServer(options = {}) {
  return http.createServer(async (request, response) => {
    const host = request.headers.host || 'localhost';
    const url = new URL(request.url || '/', `https://${host}`);
    if (request.method !== 'GET' && request.method !== 'HEAD') return sendJson(response, 405, { error: 'Method not allowed' });

    if (url.pathname === '/api/health') {
      const target = await resolveTarget(request.url || '/', host, options);
      try {
        const healthFetcher = options.healthFetcher || fetch;
        const health = await healthFetcher(`${target.origin}/api/health`, {
          redirect: 'follow', signal: AbortSignal.timeout(35_000),
        });
        if (!health.ok) throw new Error(`game health returned ${health.status}`);
        const data = await health.json();
        if (data.status !== 'ok') throw new Error('game health response is not ok');
        console.info(JSON.stringify({ event: 'entry-health', target: target.origin, status: health.status, source: target.source }));
        return sendJson(response, 200, { status: 'ok', service: 'render-entry', target: target.origin });
      } catch (error) {
        console.error(JSON.stringify({ event: 'entry-health-failed', target: target.origin,
          reason: error instanceof Error ? error.message : String(error) }));
        return sendJson(response, 502, { status: 'error', service: 'render-entry', target: target.origin });
      }
    }

    if (url.pathname === '/api/route') {
      const target = await resolveTarget(request.url || '/', host, options);
      return sendJson(response, 200, target);
    }

    if (url.pathname !== '/' && url.pathname !== '/index.html') return sendJson(response, 404, { error: 'Not found' });
    const target = await resolveTarget(request.url || '/', host, options);
    const destination = destinationUrl(target.origin, request.url || '/', host);
    response.writeHead(302, {
      'Cache-Control': 'no-store',
      'Location': destination.href,
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end();
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 10000);
  createServer().listen(port, '0.0.0.0', () => console.info(`Render entry listening on ${port}`));
}
