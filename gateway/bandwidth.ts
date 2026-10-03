import { GATEWAY_SLOTS, type GatewayConfig } from '../shared/gateway';

export const RENDER_SITES = [
  { slot: 'early', id: 'srv-datsn27lk1mc73cr6er0', origin: 'https://skot-game01.onrender.com', secret: 'RENDER_API_KEY_01' },
  { slot: 'middle', id: 'srv-datt010jo6nc73ccabfg', origin: 'https://skot-game02.onrender.com', secret: 'RENDER_API_KEY_02' },
  { slot: 'late', id: 'srv-datsqhp7lnhs73ek8kng', origin: 'https://skot-game03.onrender.com', secret: 'RENDER_API_KEY_03' },
] as const;
type KV = { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };
export type BandwidthEnv = { ROUTING?: KV; RENDER_API_KEY_01?: string; RENDER_API_KEY_02?: string; RENDER_API_KEY_03?: string };
type Row = { id: string; origin: string; ownerId?: string; observedGB: number; usedGB: number; complete: boolean;
  checkedAt?: number; measuredAt?: number; error?: string; healthy?: boolean };
export type Snapshot = { month: string; checkedAt: number; rows: Row[]; active?: string; previous?: string; switchedAt?: number };
type Ledger = { ownerId: string; checkedAt: number; complete: boolean; offsetGB: number; points: Record<string, number> };
const HOUR = 3600000;
export const monthKey = (now: number) => new Date(now).toISOString().slice(0, 7);
export const snapshotKey = (now: number) => `bandwidth:snapshot:${monthKey(now)}`;
const ledgerKey = (id: string, now: number) => `bandwidth:ledger:${monthKey(now)}:${id}`;
async function read<T>(kv: KV, key: string): Promise<T | null> { const s = await kv.get(key); return s ? JSON.parse(s) : null; }

function bandwidthFactor(unit: unknown): number {
  // Render's bandwidth endpoint also emits "mb" for megabytes. Keep this
  // endpoint-specific alias explicit; do not lowercase arbitrary bit/rate units.
  const units: Record<string, number> = { B: 1e-9, kB: 1e-6, KB: 1e-6, MB: 0.001, GB: 1,
    mb: 0.001,
    TB: 1000, KiB: 1024 / 1e9, MiB: 1048576 / 1e9, GiB: 1073741824 / 1e9,
    byte: 1e-9, bytes: 1e-9, kilobyte: 1e-6, kilobytes: 1e-6,
    megabyte: 0.001, megabytes: 0.001, gigabyte: 1, gigabytes: 1,
    kibibyte: 1024 / 1e9, kibibytes: 1024 / 1e9,
    mebibyte: 1048576 / 1e9, mebibytes: 1048576 / 1e9,
    gibibyte: 1073741824 / 1e9, gibibytes: 1073741824 / 1e9 };
  const name = typeof unit === 'string' ? unit.trim() : '';
  const key = /^[a-z]+$/i.test(name) && name.length > 3 ? name.toLowerCase() : name;
  if (!Object.hasOwn(units, key)) {
    // Only expose the unit field, never the response body or request credentials.
    const display = typeof unit === 'string' ? JSON.stringify(unit.slice(0, 40)) : typeof unit;
    throw new Error(`无法识别带宽单位：${display}，请提供此错误文字`);
  }
  return units[key];
}

// Hourly samples are upserted by series and timestamp, never added again on polling.
export function mergeSamples(points: Record<string, number>, series: any, resource: string, start: number, end: number) {
  if (!Array.isArray(series)) throw new Error('带宽接口格式不正确');
  let measuredAt = 0;
  for (const item of series) {
    if (!item || !Array.isArray(item.labels) || !Array.isArray(item.values)) {
      const kind = (value: unknown) => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      throw new Error(`带宽结构不匹配：labels=${kind(item?.labels)}，values=${kind(item?.values)}`);
    }
    if (item.labels.some((label: any) => !label || typeof label.field !== 'string' || typeof label.value !== 'string')) throw new Error('带宽 labels 字段格式不正确');
    const labels = JSON.stringify([...item.labels].sort((a, b) => `${a.field}:${a.value}`.localeCompare(`${b.field}:${b.value}`)));
    for (const p of item.values) {
      if (!p || typeof p.timestamp !== 'string') throw new Error('带宽时间字段格式不正确');
      const factor = bandwidthFactor(p.unit ?? item.unit);
      if (p.unit != null && item.unit != null && factor !== bandwidthFactor(item.unit)) throw new Error('带宽样本单位与序列单位不一致');
      const t = Date.parse(p.timestamp);
      if (!Number.isFinite(t) || !Number.isFinite(p.value) || p.value < 0) throw new Error('带宽数据无效');
      if (t < start || t >= end) continue;
      points[`${resource}|${labels}|${t}`] = p.value * factor;
      measuredAt = Math.max(measuredAt, t);
    }
  }
  return measuredAt;
}

export function chooseBandwidthTarget(config: GatewayConfig, snapshot: Snapshot | null, now = Date.now()) {
  const b = config.bandwidth;
  if (!b?.enabled) return null;
  if (!snapshot || snapshot.month !== monthKey(now) || now - snapshot.checkedAt > HOUR) return null;
  const eligible = snapshot.rows.filter(row => row.complete && !row.error && row.healthy && row.checkedAt &&
    now - row.checkedAt <= HOUR && row.measuredAt && now - row.measuredAt <= 3 * HOUR && row.usedGB < b.quotaGB - b.reserveGB &&
    GATEWAY_SLOTS.some(slot => config.sites[slot] === row.origin));
  const selected = eligible.find(row => row.origin === snapshot.active) || eligible[0];
  if (!selected) return null;
  return { slot: GATEWAY_SLOTS.find(slot => config.sites[slot] === selected.origin)!, origin: selected.origin };
}

export async function readSnapshot(env: BandwidthEnv, now = Date.now()) {
  return env.ROUTING ? read<Snapshot>(env.ROUTING, snapshotKey(now)) : null;
}

export async function collectBandwidth(env: BandwidthEnv, config: GatewayConfig, now = Date.now(), fetcher: typeof fetch = fetch) {
  const kv = env.ROUTING;
  if (!kv) return null;
  const old = await readSnapshot(env, now);
  if (old && now - old.checkedAt < 15 * 60000) return old;
  const month = monthKey(now);
  const start = Date.parse(`${month}-01T00:00:00Z`);
  const queryStart = Math.max(start, Math.floor((now - 6 * 24 * HOUR) / HOUR) * HOUR);
  const rows: Row[] = [];
  for (const site of RENDER_SITES) {
    let row: Row = { id: site.id, origin: site.origin, observedGB: 0, usedGB: 0, complete: false };
    try {
      const key = env[site.secret];
      if (!key) throw new Error(`尚未配置 ${site.secret}`);
      const api = async (path: string) => {
        const r = await fetcher(`https://api.render.com/v1${path}`, {
          headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
          redirect: 'manual', signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error(`Render 查询失败（${r.status}），请核对密钥权限`);
        return r.json();
      };
      const service = await api(`/services/${site.id}`);
      if (!service.ownerId || service.serviceDetails?.url?.replace(/\/$/, '') !== site.origin) throw new Error('服务编号与网址不匹配');
      const list = await api(`/services?ownerId=${encodeURIComponent(service.ownerId)}&limit=100`);
      if (!Array.isArray(list) || !list.length || list.length > 8) throw new Error('工作区服务数量超出当前自动统计范围');
      const services = list.map(item => item.service);
      if (services.some(s => !s?.id || s.ownerId !== service.ownerId)) throw new Error('工作区服务列表不完整');
      const previous = await read<Ledger>(kv, ledgerKey(site.id, now));
      const ledger: Ledger = previous?.ownerId === service.ownerId ? previous : {
        ownerId: service.ownerId, checkedAt: 0, complete: false, offsetGB: 0, points: {},
      };
      if (ledger.checkedAt && ledger.checkedAt < queryStart) ledger.complete = false;
      let measuredAt = 0;
      let everyServiceHasSamples = true;
      for (const s of services) {
        const params = new URLSearchParams({ resource: s.id, startTime: new Date(queryStart).toISOString(), endTime: new Date(now).toISOString() });
        const serviceMeasuredAt = mergeSamples(ledger.points, await api(`/metrics/bandwidth?${params}`), s.id, start, now);
        everyServiceHasSamples &&= serviceMeasuredAt > 0;
        measuredAt = Math.max(measuredAt, serviceMeasuredAt);
      }
      // Re-evaluate a stale incomplete flag only after a successful full-month
      // backfill for every listed service. Never erase a manual billing offset.
      if (queryStart === start && everyServiceHasSamples) ledger.complete = true;
      const observedGB = Object.values(ledger.points).reduce((a, b) => a + b, 0);
      ledger.checkedAt = now;
      await kv.put(ledgerKey(site.id, now), JSON.stringify(ledger));
      row = { ...row, ownerId: service.ownerId, observedGB, usedGB: observedGB + ledger.offsetGB,
        complete: ledger.complete, checkedAt: now, measuredAt };
    } catch (error) {
      row = { ...(old?.rows.find(r => r.id === site.id) || row), error: error instanceof Error ? error.message : '带宽查询失败' };
    }
    // Parsing and availability are independent; a metrics error does not mean the game is down.
    if (env[site.secret]) {
      try {
        const health = await fetcher(`${site.origin}/api/health`, { redirect: 'manual', signal: AbortSignal.timeout(10000) });
        row.healthy = health.ok && (await health.json() as any).status === 'ok';
      } catch { row.healthy = false; }
    }
    rows.push(row);
  }
  const snapshot: Snapshot = { month, checkedAt: now, rows, active: old?.active, previous: old?.previous, switchedAt: old?.switchedAt };
  const target = chooseBandwidthTarget(config, snapshot, now);
  if (target && target.origin !== snapshot.active) {
    snapshot.previous = snapshot.active;
    snapshot.active = target.origin;
    snapshot.switchedAt = now;
  }
  await kv.put(snapshotKey(now), JSON.stringify(snapshot));
  return snapshot;
}

export async function calibrateBandwidth(env: BandwidthEnv, id: string, usedGB: number, now = Date.now()) {
  if (!env.ROUTING || !RENDER_SITES.some(site => site.id === id) || !Number.isFinite(usedGB) || usedGB < 0 || usedGB > 10000) throw new Error('补录数据无效');
  const snapshot = await readSnapshot(env, now);
  const row = snapshot?.rows.find(r => r.id === id);
  const ledger = await read<Ledger>(env.ROUTING, ledgerKey(id, now));
  if (!snapshot || !row || row.error || !ledger || now - ledger.checkedAt > HOUR) throw new Error('请等待带宽查询成功后再补录');
  if (usedGB < row.observedGB) throw new Error('本月总用量不能小于已采集用量');
  ledger.offsetGB = usedGB - row.observedGB;
  ledger.complete = true;
  await env.ROUTING.put(ledgerKey(id, now), JSON.stringify(ledger));
  row.usedGB = usedGB;
  row.complete = true;
  await env.ROUTING.put(snapshotKey(now), JSON.stringify(snapshot));
}
