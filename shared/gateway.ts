export const GATEWAY_SLOTS = ['early', 'middle', 'late'] as const;
export type GatewaySlot = typeof GATEWAY_SLOTS[number];
export interface GatewayConfig {
  enabled: boolean;
  fallback: string;
  sites: Record<GatewaySlot, string>;
  bandwidth?: { enabled: boolean; quotaGB: number; reserveGB: number };
}
export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  enabled: false, fallback: 'https://skot-game01.onrender.com',
  sites: { early: '', middle: '', late: '' },
};

export function renderOrigin(value: unknown, optional = false): string {
  if (optional && value === '') return '';
  if (typeof value !== 'string') throw new Error('请填写 Render 网站的 HTTPS 地址');
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('网址格式不正确'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.onrender\.com$/.test(url.hostname) ||
      url.port || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('网址须为 https://名称.onrender.com，不包含路径、参数或密码');
  }
  return url.origin;
}

export function validateGatewayConfig(value: any): GatewayConfig {
  if (!value || typeof value.enabled !== 'boolean') throw new Error('请选择是否启用按旬切换');
  const config: GatewayConfig = { enabled: value.enabled, fallback: renderOrigin(value.fallback), sites: { early: '', middle: '', late: '' } };
  for (const slot of GATEWAY_SLOTS) config.sites[slot] = renderOrigin(value.sites?.[slot], !config.enabled);
  if (value.bandwidth !== undefined) {
    const b = value.bandwidth;
    if (typeof b?.enabled !== 'boolean' || !Number.isFinite(b.quotaGB) || b.quotaGB <= 0 || b.quotaGB > 1000 ||
        !Number.isFinite(b.reserveGB) || b.reserveGB < 0.1 || b.reserveGB >= b.quotaGB) throw new Error('请填写有效额度和预留流量');
    config.bandwidth = { enabled: b.enabled, quotaGB: b.quotaGB, reserveGB: b.reserveGB };
    if (b.enabled && GATEWAY_SLOTS.some(slot => !config.sites[slot])) throw new Error('请先填写三个游戏网址');
  }
  if ([config.fallback, ...Object.values(config.sites)].includes('https://skot-game.onrender.com')) throw new Error('游戏网址不能填写入口 skot-game，请填写带编号的游戏站');
  return config;
}

export function gatewaySlot(now = new Date()): GatewaySlot {
  const day = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', day: 'numeric' }).format(now));
  return day <= 10 ? 'early' : day <= 20 ? 'middle' : 'late';
}

export function gatewayTarget(config: GatewayConfig, now = new Date(), requestedSlot?: string | null) {
  const slot = GATEWAY_SLOTS.includes(requestedSlot as GatewaySlot) ? requestedSlot as GatewaySlot : gatewaySlot(now);
  return { slot, origin: (requestedSlot || config.enabled) && config.sites[slot] ? config.sites[slot] : config.fallback };
}
