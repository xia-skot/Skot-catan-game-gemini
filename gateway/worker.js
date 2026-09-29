// shared/gateway.ts
var GATEWAY_SLOTS = ["early", "middle", "late"];
var DEFAULT_GATEWAY_CONFIG = {
  enabled: false,
  fallback: "https://skot-game01.onrender.com",
  sites: { early: "", middle: "", late: "" }
};
function renderOrigin(value, optional = false) {
  if (optional && value === "") return "";
  if (typeof value !== "string") throw new Error("\u8BF7\u586B\u5199 Render \u7F51\u7AD9\u7684 HTTPS \u5730\u5740");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("\u7F51\u5740\u683C\u5F0F\u4E0D\u6B63\u786E");
  }
  if (url.protocol !== "https:" || !/^[a-z0-9][a-z0-9-]*\.onrender\.com$/.test(url.hostname) || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("\u7F51\u5740\u987B\u4E3A https://\u540D\u79F0.onrender.com\uFF0C\u4E0D\u5305\u542B\u8DEF\u5F84\u3001\u53C2\u6570\u6216\u5BC6\u7801");
  }
  return url.origin;
}
function validateGatewayConfig(value) {
  if (!value || typeof value.enabled !== "boolean") throw new Error("\u8BF7\u9009\u62E9\u662F\u5426\u542F\u7528\u6309\u65EC\u5207\u6362");
  const config = { enabled: value.enabled, fallback: renderOrigin(value.fallback), sites: { early: "", middle: "", late: "" } };
  for (const slot of GATEWAY_SLOTS) config.sites[slot] = renderOrigin(value.sites?.[slot], !config.enabled);
  return config;
}
function gatewaySlot(now = /* @__PURE__ */ new Date()) {
  const day = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", day: "numeric" }).format(now));
  return day <= 10 ? "early" : day <= 20 ? "middle" : "late";
}
function gatewayTarget(config, now = /* @__PURE__ */ new Date(), requestedSlot) {
  const slot = GATEWAY_SLOTS.includes(requestedSlot) ? requestedSlot : gatewaySlot(now);
  return { slot, origin: (requestedSlot || config.enabled) && config.sites[slot] ? config.sites[slot] : config.fallback };
}

// gateway/worker.ts
var headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
var json = (value, status = 200) => Response.json(value, { status, headers });
async function readConfig(env) {
  if (!env.ROUTING) return structuredClone(DEFAULT_GATEWAY_CONFIG);
  const stored = await env.ROUTING.get("routing");
  return stored ? validateGatewayConfig(JSON.parse(stored)) : structuredClone(DEFAULT_GATEWAY_CONFIG);
}
async function authenticated(request, secret) {
  if (!secret || secret.length < 32) return false;
  const supplied = request.headers.get("Authorization") || "";
  const encoder = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`Bearer ${secret}`)));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/admin/config") {
        if (!await authenticated(request, env.GATEWAY_ADMIN_TOKEN)) return json({ error: "\u672A\u6388\u6743\u8BBF\u95EE" }, 401);
        if (!env.ROUTING) return json({ error: "\u5165\u53E3\u5C1A\u672A\u7ED1\u5B9A ROUTING KV \u547D\u540D\u7A7A\u95F4" }, 503);
        if (request.method === "GET") return json(await readConfig(env));
        if (request.method !== "PUT") return json({ error: "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C" }, 405);
        const body = await request.text();
        if (body.length > 8192) return json({ error: "\u914D\u7F6E\u8FC7\u5927" }, 413);
        let config;
        try {
          config = validateGatewayConfig(JSON.parse(body));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "\u914D\u7F6E\u9519\u8BEF" }, 400);
        }
        await env.ROUTING.put("routing", JSON.stringify(config));
        return json({ success: true, config });
      }
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C" }, 405);
      const target = gatewayTarget(await readConfig(env), /* @__PURE__ */ new Date(), url.searchParams.get("site"));
      if (url.pathname === "/api/route") return json({ ...target, healthUrl: `${target.origin}/api/health` });
      if (url.pathname !== "/" && url.pathname !== "/index.html") return new Response("Not found", { status: 404, headers });
      const destination = new URL(target.origin);
      const room = url.searchParams.get("room");
      if (room && /^[a-zA-Z0-9-]{1,32}$/.test(room)) destination.searchParams.set("room", room);
      const literal = JSON.stringify(destination.href).replace(/</g, "\\u003c");
      const nonce = crypto.randomUUID().replaceAll("-", "");
      const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>\u5361\u5766\u5C9B</title><style nonce="${nonce}">html,body{margin:0;background:#e3f0f9;height:100%;font-family:system-ui}a{color:#18394e}noscript{display:block;padding:24px}</style><noscript><a href="${destination.href.replaceAll("&", "&amp;")}">\u8FDB\u5165\u6D77\u57DF</a></noscript><script nonce="${nonce}">location.replace(${literal});<\/script></html>`;
      return new Response(request.method === "HEAD" ? null : html, { headers: {
        ...headers,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`
      } });
    } catch {
      return new Response("\u5165\u53E3\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", { status: 503, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
    }
  },
  async scheduled(_event, env) {
    if (env.KEEP_ALIVE !== "true") return;
    const config = await readConfig(env);
    const now = /* @__PURE__ */ new Date();
    const origins = /* @__PURE__ */ new Set([
      gatewayTarget(config, now).origin,
      gatewayTarget(config, new Date(now.getTime() - 6 * 36e5)).origin
    ]);
    if (env.ENTRY_ORIGIN) origins.add(renderOrigin(env.ENTRY_ORIGIN));
    for (const origin of origins) {
      const response = await fetch(`${origin}/api/health`, { redirect: "follow", signal: AbortSignal.timeout(45e3) });
      if (!response.ok || (await response.json()).status !== "ok") throw new Error(`Health check failed: ${origin}`);
      console.info(JSON.stringify({ event: "keep-alive", origin, status: response.status }));
    }
  }
};
export {
  worker_default as default
};
