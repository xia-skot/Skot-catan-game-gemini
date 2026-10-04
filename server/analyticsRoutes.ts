import type { Express, RequestHandler } from 'express';
import { buildAnalytics, parseAnalyticsQuery } from './analytics';

interface Options {
  readRecords: () => Promise<{ users: any[]; games: any[] }>;
  readCapacity: () => Promise<number | null>;
  writeCapacity: (bytes: number | null) => Promise<void>;
  readStorage: () => Promise<{ usedBytes: number; scope: 'cluster' | 'database'; dataBytes: number | null; indexBytes: number | null }>;
}

export function registerAnalyticsRoutes(app: Express, authenticate: RequestHandler, admin: RequestHandler, options: Options) {
  let cached: { records: Awaited<ReturnType<Options['readRecords']>>; expires: number } | null = null;
  let pending: ReturnType<Options['readRecords']> | null = null;
  async function records(refresh: boolean) {
    if (!refresh && cached && cached.expires > Date.now()) return cached.records;
    if (!pending) {
      pending = options.readRecords().then(value => {
        cached = { records: value, expires: Date.now() + 15000 };
        return value;
      }).finally(() => { pending = null; });
    }
    return pending;
  }
  app.get('/api/admin/analytics', authenticate, admin, async (req, res) => {
    let query: ReturnType<typeof parseAnalyticsQuery>;
    try { query = parseAnalyticsQuery(req.query); }
    catch (error) { res.status(400).json({ error: (error as Error).message }); return; }
    try {
      const { users, games } = await records(req.query.refresh === '1');
      res.setHeader('Cache-Control', 'no-store');
      res.json(buildAnalytics(users, games, query.period, query.time));
    } catch { res.status(503).json({ error: '无法读取统计数据，请稍后重试' }); }
  });
  app.get('/api/admin/guests', authenticate, admin, async (_req, res) => {
    try {
      const { users } = await options.readRecords();
      const guests = users.filter(user => user.isGuest === true || user.role === 'guest')
        .map(user => ({ id: String(user._id), username: user.username || '未命名游客', createdAt: user.createdAt || null }))
        .sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
      res.setHeader('Cache-Control', 'no-store');
      res.json({ guests });
    } catch { res.status(503).json({ error: '无法读取游客名单，请稍后重试' }); }
  });
  app.get('/api/admin/database-storage', authenticate, admin, async (_req, res) => {
    try {
      const capacityBytes = await options.readCapacity();
      let storage: Awaited<ReturnType<Options['readStorage']>>;
      try { storage = await options.readStorage(); }
      catch { res.status(503).json({ error: '空间查询失败：数据库未连接、权限不足或当前套餐不支持查询', capacityBytes }); return; }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ...storage, capacityBytes, remainingBytes: storage.scope === 'cluster' && capacityBytes !== null
        ? Math.max(0, capacityBytes - storage.usedBytes) : null, checkedAt: new Date().toISOString() });
    } catch { res.status(503).json({ error: '数据库未连接，无法读取容量设置' }); }
  });
  app.put('/api/admin/database-storage', authenticate, admin, async (req, res) => {
    const value = req.body?.capacityMiB;
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 104857600)) {
      res.status(400).json({ error: '容量必须是大于 0 的有效数字' }); return;
    }
    try { await options.writeCapacity(value === null ? null : value * 1024 * 1024); res.json({ success: true }); }
    catch { res.status(503).json({ error: '容量设置保存失败' }); }
  });
}
