import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ICON_PATH = '/catan-icon-v19-512.png';
const ICON = readFileSync(new URL(`.${ICON_PATH}`, import.meta.url));

const DEFAULT_ROUTING_API = 'https://skot.catan-game.workers.dev/api/route';
const DEFAULT_FALLBACK = 'https://skot-game01.onrender.com';
const REQUEST_TIMEOUT_MS = 15_000;
const LAUNCHER_SCRIPT = `
const frame = document.querySelector('iframe');
const gameOrigin = new URL(frame.src).origin;
const tokenKey = 'catan_shared_auth_token';
const nameKey = 'catan_shared_player_name';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.origin !== gameOrigin) return;
  const data = event.data || {};
  if (data.type === 'catan:session-request') {
    frame.contentWindow.postMessage({ type: 'catan:session-response', token: localStorage.getItem(tokenKey), username: localStorage.getItem(nameKey) }, gameOrigin);
  } else if (data.type === 'catan:session-update' && typeof data.token === 'string' && data.token.length > 20 && data.token.length < 8192) {
    localStorage.setItem(tokenKey, data.token);
    if (typeof data.username === 'string' && data.username.length <= 80) localStorage.setItem(nameKey, data.username);
  } else if (data.type === 'catan:session-clear') {
    localStorage.removeItem(tokenKey);
    localStorage.removeItem(nameKey);
  }
});`;

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
    if (response.status === 503) {
      const body = await response.clone().json().catch(() => null);
      if (body?.code === 'BANDWIDTH_UNAVAILABLE') throw new Error('BANDWIDTH_UNAVAILABLE');
    }
    if (!response.ok) throw new Error(`routing API returned ${response.status}`);
    const data = await response.json();
    const origin = renderOrigin(data.origin);
    if (new URL(origin).host === host) throw new Error('routing target points back to the entry service');
    return { origin, slot: data.slot || null, source: 'routing-api' };
  } catch (error) {
    if (error?.message === 'BANDWIDTH_UNAVAILABLE') throw error;
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

function sendText(response, status, contentType, value, extraHeaders = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  response.end(value);
}

function launcherHtml(destination) {
  const source = destination.href.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#e3f0f9">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" type="image/png" sizes="512x512" href="${ICON_PATH}">
  <link rel="apple-touch-icon" sizes="512x512" href="${ICON_PATH}">
  <title>卡坦岛</title>
  <style>html,body,iframe{width:100%;height:100%;margin:0;border:0}html,body{overflow:hidden;background:#e3f0f9}iframe{display:block}</style>
</head>
<body>
  <iframe src="${source}" title="卡坦岛" allow="autoplay; fullscreen" allowfullscreen></iframe>
  <script src="/launcher.js"></script>
</body>
</html>`;
}

export function createServer(options = {}) {
  return http.createServer(async (request, response) => {
    try {
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

    if (url.pathname === ICON_PATH) {
      return sendText(response, 200, 'image/png', ICON, {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': String(ICON.length),
      });
    }

    if (url.pathname === '/manifest.json') {
      return sendJson(response, 200, {
        name: 'CATAN · 卡坦岛', short_name: '卡坦岛', start_url: '/', scope: '/',
        display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'any',
        background_color: '#e3f0f9', theme_color: '#e3f0f9',
        icons: [
          { src: ICON_PATH, sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      });
    }

    if (url.pathname === '/launcher.js') {
      return sendText(response, 200, 'text/javascript; charset=utf-8', LAUNCHER_SCRIPT);
    }

    if (url.pathname === '/sw.js') {
      return sendText(response, 200, 'text/javascript; charset=utf-8',
        "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));",
        { 'Service-Worker-Allowed': '/' });
    }

    if (url.pathname !== '/' && url.pathname !== '/index.html') return sendJson(response, 404, { error: 'Not found' });
    const target = await resolveTarget(request.url || '/', host, options);
    const destination = destinationUrl(target.origin, request.url || '/', host);
    return sendText(response, 200, 'text/html; charset=utf-8', launcherHtml(destination), {
      'Content-Security-Policy': "default-src 'none'; frame-src https://*.onrender.com; script-src 'self'; style-src 'unsafe-inline'; manifest-src 'self'; img-src 'self' https://*.onrender.com; frame-ancestors 'none'; base-uri 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Referrer-Policy': 'no-referrer',
    });
    } catch {
      return sendText(response, 503, 'text/plain; charset=utf-8', '游戏站暂时不可用，请稍后重试或联系管理员。');
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT || 10000);
  createServer().listen(port, '0.0.0.0', () => console.info(`Render entry listening on ${port}`));
}
