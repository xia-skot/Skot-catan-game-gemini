import { DEFAULT_GATEWAY_CONFIG, gatewayTarget, renderOrigin, validateGatewayConfig, type GatewayConfig } from '../shared/gateway';

interface Environment {
  ROUTING?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };
  GATEWAY_ADMIN_TOKEN: string;
  KEEP_ALIVE?: string;
  ENTRY_ORIGIN?: string;
}
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
async function readConfig(env: Environment): Promise<GatewayConfig> {
  // Public entry remains usable before KV is bound; admin configuration reports the missing binding.
  if (!env.ROUTING) return structuredClone(DEFAULT_GATEWAY_CONFIG);
  const stored = await env.ROUTING.get('routing');
  return stored ? validateGatewayConfig(JSON.parse(stored)) : structuredClone(DEFAULT_GATEWAY_CONFIG);
}
async function authenticated(request: Request, secret: string): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get('Authorization') || '';
  const encoder = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${secret}`)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Environment): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/admin/config') {
        if (!await authenticated(request, env.GATEWAY_ADMIN_TOKEN)) return json({ error: '未授权访问' }, 401);
        if (!env.ROUTING) return json({ error: '入口尚未绑定 ROUTING KV 命名空间' }, 503);
        if (request.method === 'GET') return json(await readConfig(env));
        if (request.method !== 'PUT') return json({ error: '不支持此操作' }, 405);
        const body = await request.text();
        if (body.length > 8192) return json({ error: '配置过大' }, 413);
        let config: GatewayConfig;
        try { config = validateGatewayConfig(JSON.parse(body)); }
        catch (error) { return json({ error: error instanceof Error ? error.message : '配置错误' }, 400); }
        await env.ROUTING.put('routing', JSON.stringify(config));
        return json({ success: true, config });
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: '不支持此操作' }, 405);
      const target = gatewayTarget(await readConfig(env), new Date(), url.searchParams.get('site'));
      if (url.pathname === '/api/route') return json({ ...target, healthUrl: `${target.origin}/api/health` });
      if (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not found', { status: 404, headers });
      // Only forward room parameters. Credentials never travel through the gateway URL.
      const destination = new URL(target.origin);
      const room = url.searchParams.get('room');
      if (room && /^[a-zA-Z0-9-]{1,32}$/.test(room)) destination.searchParams.set('room', room);
      const literal = JSON.stringify(destination.href).replace(/</g, '\\u003c');
      const nonce = crypto.randomUUID().replaceAll('-', '');
      const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>卡坦岛</title><style nonce="${nonce}">html,body{margin:0;background:#e3f0f9;height:100%;font-family:system-ui}a{color:#18394e}noscript{display:block;padding:24px}</style><noscript><a href="${destination.href.replaceAll('&', '&amp;')}">进入海域</a></noscript><script nonce="${nonce}">location.replace(${literal});</script></html>`;
      return new Response(request.method === 'HEAD' ? null : html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'` } });
    } catch {
      return new Response('入口暂时不可用，请稍后重试。', { status: 503, headers: { ...headers, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  },
  async scheduled(_event: unknown, env: Environment): Promise<void> {
    if (env.KEEP_ALIVE !== 'true') return;
    const config = await readConfig(env);
    const now = new Date();
    // Around a calendar switch, retain the previous destination for the five-hour room retention window.
    const origins = new Set([gatewayTarget(config, now).origin,
      gatewayTarget(config, new Date(now.getTime() - 6 * 3600000)).origin]);
    if (env.ENTRY_ORIGIN) origins.add(renderOrigin(env.ENTRY_ORIGIN));
    for (const origin of origins) {
      const response = await fetch(`${origin}/api/health`, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (!response.ok || (await response.json() as any).status !== 'ok') throw new Error(`Health check failed: ${origin}`);
      console.info(JSON.stringify({ event: 'keep-alive', origin, status: response.status }));
    }
  },
};
