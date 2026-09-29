import type { Express, RequestHandler } from 'express';
import { DEFAULT_GATEWAY_CONFIG, validateGatewayConfig } from '../shared/gateway';

export function registerGatewayRoutes(app: Express, authenticate: RequestHandler, requireAdmin: RequestHandler,
  options: { demo?: boolean; url?: string; token?: string; fetcher?: typeof fetch } = {}) {
  let demoConfig = structuredClone(DEFAULT_GATEWAY_CONFIG);
  const configured = !!options.url && !!options.token && options.token.length >= 32;
  const bandwidthHandler: RequestHandler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!configured) return res.status(503).json({ error: '请先配置入口管理接口' });
    try {
      const base = new URL(options.url!);
      if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('invalid URL');
      const response = await (options.fetcher || fetch)(new URL('/api/admin/bandwidth', base), {
        method: req.method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
        ...(req.method === 'PUT' ? { body: JSON.stringify({ id: req.body.id, usedGB: req.body.usedGB }) } : {}),
      });
      res.status(response.status).json(await response.json());
    } catch { res.status(503).json({ error: '无法读取带宽信息，请确认 Worker 已更新' }); }
  };
  app.get('/api/admin/gateway/bandwidth', authenticate, requireAdmin, bandwidthHandler);
  app.put('/api/admin/gateway/bandwidth', authenticate, requireAdmin, bandwidthHandler);
  const requestConfig = async (method: string, config?: unknown) => {
    const base = new URL(options.url!);
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('入口网址配置不正确');
    const response = await (options.fetcher || fetch)(new URL('/api/admin/config', base), {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
      ...(method === 'PUT' ? { body: JSON.stringify(config) } : {}),
    });
    if (!response.ok) throw new Error('入口配置服务返回错误，请检查 Worker 绑定及管理密钥');
    const data = await response.json();
    return validateGatewayConfig(method === 'PUT' ? data.config : data);
  };
  app.get('/api/admin/gateway', authenticate, requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      res.json({ configured: options.demo || configured, demo: !!options.demo, gatewayUrl: options.url || '',
        config: options.demo ? demoConfig : configured ? await requestConfig('GET') : DEFAULT_GATEWAY_CONFIG });
    } catch { res.status(503).json({ error: '无法读取入口配置，请检查 GATEWAY_URL、管理密钥和 Worker 绑定' }); }
  });
  app.put('/api/admin/gateway', authenticate, requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!configured && !options.demo) return res.status(503).json({ error: '请先配置 GATEWAY_URL 和 GATEWAY_ADMIN_TOKEN' });
    let config;
    try { config = validateGatewayConfig(req.body); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : '配置错误' }); }
    try {
      if (options.demo) demoConfig = config;
      else config = await requestConfig('PUT', config);
      res.json({ success: true, config });
    } catch { res.status(503).json({ error: '保存入口配置失败，请检查 Worker 绑定和管理密钥' }); }
  });
}
