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
  if (value.bandwidth !== void 0) {
    const b = value.bandwidth;
    if (typeof b?.enabled !== "boolean" || !Number.isFinite(b.quotaGB) || b.quotaGB <= 0 || b.quotaGB > 1e3 || !Number.isFinite(b.reserveGB) || b.reserveGB < 0.1 || b.reserveGB >= b.quotaGB) throw new Error("\u8BF7\u586B\u5199\u6709\u6548\u989D\u5EA6\u548C\u9884\u7559\u6D41\u91CF");
    config.bandwidth = { enabled: b.enabled, quotaGB: b.quotaGB, reserveGB: b.reserveGB };
    if (b.enabled && GATEWAY_SLOTS.some((slot) => !config.sites[slot])) throw new Error("\u8BF7\u5148\u586B\u5199\u4E09\u4E2A\u6E38\u620F\u7F51\u5740");
  }
  if ([config.fallback, ...Object.values(config.sites)].includes("https://skot-game.onrender.com")) throw new Error("\u6E38\u620F\u7F51\u5740\u4E0D\u80FD\u586B\u5199\u5165\u53E3 skot-game\uFF0C\u8BF7\u586B\u5199\u5E26\u7F16\u53F7\u7684\u6E38\u620F\u7AD9");
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

// gateway/bandwidth.ts
var RENDER_SITES = [
  { slot: "early", id: "srv-datsn27lk1mc73cr6er0", origin: "https://skot-game01.onrender.com", secret: "RENDER_API_KEY_01" },
  { slot: "middle", id: "srv-datt010jo6nc73ccabfg", origin: "https://skot-game02.onrender.com", secret: "RENDER_API_KEY_02" },
  { slot: "late", id: "srv-datsqhp7lnhs73ek8kng", origin: "https://skot-game03.onrender.com", secret: "RENDER_API_KEY_03" }
];
var HOUR = 36e5;
var monthKey = (now) => new Date(now).toISOString().slice(0, 7);
var snapshotKey = (now) => `bandwidth:snapshot:${monthKey(now)}`;
var ledgerKey = (id, now) => `bandwidth:ledger:${monthKey(now)}:${id}`;
async function read(kv, key) {
  const s = await kv.get(key);
  return s ? JSON.parse(s) : null;
}
function mergeSamples(points, series, resource, start, end) {
  if (!Array.isArray(series)) throw new Error("\u5E26\u5BBD\u63A5\u53E3\u683C\u5F0F\u4E0D\u6B63\u786E");
  let measuredAt = 0;
  for (const item of series) {
    const units = { GB: 1, MB: 1e-3, KB: 1e-6, B: 1e-9, bytes: 1e-9, GiB: 1.073741824, MiB: 1048576e-9 };
    const factor = units[item.unit];
    if (factor === void 0 || !Array.isArray(item.labels) || !Array.isArray(item.values)) throw new Error("\u65E0\u6CD5\u8BC6\u522B\u5E26\u5BBD\u5355\u4F4D\u6216\u6570\u636E\u683C\u5F0F");
    const labels = JSON.stringify([...item.labels].sort((a, b) => `${a.field}:${a.value}`.localeCompare(`${b.field}:${b.value}`)));
    for (const p of item.values) {
      const t = Date.parse(p.timestamp);
      if (!Number.isFinite(t) || !Number.isFinite(p.value) || p.value < 0) throw new Error("\u5E26\u5BBD\u6570\u636E\u65E0\u6548");
      if (t < start || t >= end) continue;
      points[`${resource}|${labels}|${t}`] = p.value * factor;
      measuredAt = Math.max(measuredAt, t);
    }
  }
  return measuredAt;
}
function chooseBandwidthTarget(config, snapshot, now = Date.now()) {
  const b = config.bandwidth;
  if (!b?.enabled) return null;
  if (!snapshot || snapshot.month !== monthKey(now) || now - snapshot.checkedAt > HOUR) return null;
  const eligible = snapshot.rows.filter((row) => row.complete && !row.error && row.healthy && row.checkedAt && now - row.checkedAt <= HOUR && row.measuredAt && now - row.measuredAt <= 3 * HOUR && row.usedGB < b.quotaGB - b.reserveGB && GATEWAY_SLOTS.some((slot) => config.sites[slot] === row.origin));
  const selected = eligible.find((row) => row.origin === snapshot.active) || eligible[0];
  if (!selected) return null;
  return { slot: GATEWAY_SLOTS.find((slot) => config.sites[slot] === selected.origin), origin: selected.origin };
}
async function readSnapshot(env, now = Date.now()) {
  return env.ROUTING ? read(env.ROUTING, snapshotKey(now)) : null;
}
async function collectBandwidth(env, config, now = Date.now(), fetcher = fetch) {
  const kv = env.ROUTING;
  if (!kv) return null;
  const old = await readSnapshot(env, now);
  if (old && now - old.checkedAt < 15 * 6e4) return old;
  const month = monthKey(now);
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const queryStart = Math.max(start, Math.floor((now - 6 * 24 * HOUR) / HOUR) * HOUR);
  const rows = [];
  for (const site of RENDER_SITES) {
    let row = { id: site.id, origin: site.origin, observedGB: 0, usedGB: 0, complete: false };
    try {
      const key = env[site.secret];
      if (!key) throw new Error(`\u5C1A\u672A\u914D\u7F6E ${site.secret}`);
      const api = async (path) => {
        const r = await fetcher(`https://api.render.com/v1${path}`, {
          headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
          redirect: "manual",
          signal: AbortSignal.timeout(1e4)
        });
        if (!r.ok) throw new Error(`Render \u67E5\u8BE2\u5931\u8D25\uFF08${r.status}\uFF09\uFF0C\u8BF7\u6838\u5BF9\u5BC6\u94A5\u6743\u9650`);
        return r.json();
      };
      const service = await api(`/services/${site.id}`);
      if (!service.ownerId || service.serviceDetails?.url?.replace(/\/$/, "") !== site.origin) throw new Error("\u670D\u52A1\u7F16\u53F7\u4E0E\u7F51\u5740\u4E0D\u5339\u914D");
      const list = await api(`/services?ownerId=${encodeURIComponent(service.ownerId)}&limit=100`);
      if (!Array.isArray(list) || !list.length || list.length > 8) throw new Error("\u5DE5\u4F5C\u533A\u670D\u52A1\u6570\u91CF\u8D85\u51FA\u5F53\u524D\u81EA\u52A8\u7EDF\u8BA1\u8303\u56F4");
      const services = list.map((item) => item.service);
      if (services.some((s) => !s?.id || s.ownerId !== service.ownerId)) throw new Error("\u5DE5\u4F5C\u533A\u670D\u52A1\u5217\u8868\u4E0D\u5B8C\u6574");
      const previous = await read(kv, ledgerKey(site.id, now));
      const ledger = previous?.ownerId === service.ownerId ? previous : {
        ownerId: service.ownerId,
        checkedAt: 0,
        complete: queryStart === start,
        offsetGB: 0,
        points: {}
      };
      if (ledger.checkedAt && ledger.checkedAt < queryStart) ledger.complete = false;
      let measuredAt = 0;
      for (const s of services) {
        const params = new URLSearchParams({ resource: s.id, startTime: new Date(queryStart).toISOString(), endTime: new Date(now).toISOString() });
        measuredAt = Math.max(measuredAt, mergeSamples(ledger.points, await api(`/metrics/bandwidth?${params}`), s.id, start, now));
      }
      const observedGB = Object.values(ledger.points).reduce((a, b) => a + b, 0);
      ledger.checkedAt = now;
      await kv.put(ledgerKey(site.id, now), JSON.stringify(ledger));
      row = {
        ...row,
        ownerId: service.ownerId,
        observedGB,
        usedGB: observedGB + ledger.offsetGB,
        complete: ledger.complete,
        checkedAt: now,
        measuredAt
      };
      try {
        const health = await fetcher(`${site.origin}/api/health`, { redirect: "manual", signal: AbortSignal.timeout(1e4) });
        row.healthy = health.ok && (await health.json()).status === "ok";
      } catch {
        row.healthy = false;
      }
    } catch (error) {
      row = { ...old?.rows.find((r) => r.id === site.id) || row, error: error instanceof Error ? error.message : "\u5E26\u5BBD\u67E5\u8BE2\u5931\u8D25" };
    }
    rows.push(row);
  }
  const snapshot = { month, checkedAt: now, rows, active: old?.active, previous: old?.previous, switchedAt: old?.switchedAt };
  const target = chooseBandwidthTarget(config, snapshot, now);
  if (target && target.origin !== snapshot.active) {
    snapshot.previous = snapshot.active;
    snapshot.active = target.origin;
    snapshot.switchedAt = now;
  }
  await kv.put(snapshotKey(now), JSON.stringify(snapshot));
  return snapshot;
}
async function calibrateBandwidth(env, id, usedGB, now = Date.now()) {
  if (!env.ROUTING || !RENDER_SITES.some((site) => site.id === id) || !Number.isFinite(usedGB) || usedGB < 0 || usedGB > 1e4) throw new Error("\u8865\u5F55\u6570\u636E\u65E0\u6548");
  const snapshot = await readSnapshot(env, now);
  const row = snapshot?.rows.find((r) => r.id === id);
  const ledger = await read(env.ROUTING, ledgerKey(id, now));
  if (!snapshot || !row || row.error || !ledger || now - ledger.checkedAt > HOUR) throw new Error("\u8BF7\u7B49\u5F85\u5E26\u5BBD\u67E5\u8BE2\u6210\u529F\u540E\u518D\u8865\u5F55");
  if (usedGB < row.observedGB) throw new Error("\u672C\u6708\u603B\u7528\u91CF\u4E0D\u80FD\u5C0F\u4E8E\u5DF2\u91C7\u96C6\u7528\u91CF");
  ledger.offsetGB = usedGB - row.observedGB;
  ledger.complete = true;
  await env.ROUTING.put(ledgerKey(id, now), JSON.stringify(ledger));
  row.usedGB = usedGB;
  row.complete = true;
  await env.ROUTING.put(snapshotKey(now), JSON.stringify(snapshot));
}

// gateway/worker.ts
var headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
var json = (value, status = 200) => Response.json(value, { status, headers });
async function readConfig(env) {
  if (!env.ROUTING) return structuredClone(DEFAULT_GATEWAY_CONFIG);
  const stored = await env.ROUTING.get("routing");
  if (!stored) return structuredClone(DEFAULT_GATEWAY_CONFIG);
  const config = JSON.parse(stored);
  if (config.fallback === "https://skot-game.onrender.com") config.fallback = DEFAULT_GATEWAY_CONFIG.fallback;
  return validateGatewayConfig(config);
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
      if (url.pathname === "/api/admin/bandwidth") {
        if (!await authenticated(request, env.GATEWAY_ADMIN_TOKEN)) return json({ error: "\u672A\u6388\u6743\u8BBF\u95EE" }, 401);
        if (!env.ROUTING) return json({ error: "\u5C1A\u672A\u7ED1\u5B9A ROUTING" }, 503);
        if (request.method === "GET") return json({ snapshot: await readSnapshot(env), target: chooseBandwidthTarget(await readConfig(env), await readSnapshot(env)) });
        if (request.method !== "PUT") return json({ error: "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C" }, 405);
        try {
          const body = await request.text();
          if (body.length > 1024) return json({ error: "\u6570\u636E\u8FC7\u5927" }, 413);
          const data = JSON.parse(body);
          await calibrateBandwidth(env, data.id, data.usedGB);
          return json({ success: true });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "\u8865\u5F55\u5931\u8D25" }, 400);
        }
      }
      if (url.pathname === "/api/admin/config") {
        if (!await authenticated(request, env.GATEWAY_ADMIN_TOKEN)) return json({ error: "\u672A\u6388\u6743\u8BBF\u95EE" }, 401);
        if (!env.ROUTING) return json({ error: "\u5165\u53E3\u5C1A\u672A\u7ED1\u5B9A ROUTING KV \u547D\u540D\u7A7A\u95F4" }, 503);
        if (request.method === "GET") return json(await readConfig(env));
        if (request.method !== "PUT") return json({ error: "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C" }, 405);
        const body = await request.text();
        if (body.length > 8192) return json({ error: "\u914D\u7F6E\u8FC7\u5927" }, 413);
        let config2;
        try {
          config2 = validateGatewayConfig(JSON.parse(body));
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "\u914D\u7F6E\u9519\u8BEF" }, 400);
        }
        await env.ROUTING.put("routing", JSON.stringify(config2));
        return json({ success: true, config: config2 });
      }
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "\u4E0D\u652F\u6301\u6B64\u64CD\u4F5C" }, 405);
      const config = await readConfig(env);
      const requestedSite = url.searchParams.get("site");
      const target = config.bandwidth?.enabled && !["early", "middle", "late"].includes(requestedSite || "") ? chooseBandwidthTarget(config, await readSnapshot(env)) : gatewayTarget(config, /* @__PURE__ */ new Date(), requestedSite);
      if (!target) return json({ error: "\u5F53\u524D\u6CA1\u6709\u989D\u5EA6\u4E0E\u72B6\u6001\u5747\u7B26\u5408\u8981\u6C42\u7684\u6E38\u620F\u7AD9\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458", code: "BANDWIDTH_UNAVAILABLE" }, 503);
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
    const config = await readConfig(env);
    const snapshot = await collectBandwidth(env, config);
    if (env.KEEP_ALIVE !== "true") return;
    const now = /* @__PURE__ */ new Date();
    const origins = /* @__PURE__ */ new Set();
    if (config.bandwidth?.enabled) {
      const target = chooseBandwidthTarget(config, snapshot);
      if (target) origins.add(target.origin);
      if (snapshot?.previous && snapshot.switchedAt && now.getTime() - snapshot.switchedAt < 6 * 36e5) origins.add(snapshot.previous);
    } else {
      origins.add(gatewayTarget(config, now).origin);
      origins.add(gatewayTarget(config, new Date(now.getTime() - 6 * 36e5)).origin);
    }
    if (env.ENTRY_ORIGIN) origins.add(renderOrigin(env.ENTRY_ORIGIN));
    const failures = [];
    for (const origin of origins) {
      try {
        const response = await fetch(`${origin}/api/health`, { redirect: "follow", signal: AbortSignal.timeout(45e3) });
        if (!response.ok || (await response.json()).status !== "ok") throw new Error(`Health check failed: ${origin}`);
        console.info(JSON.stringify({ event: "keep-alive", origin, status: response.status }));
      } catch {
        failures.push(origin);
      }
    }
    if (failures.length) throw new Error(`Health check failed: ${failures.join(", ")}`);
  }
};
export {
  worker_default as default
};
