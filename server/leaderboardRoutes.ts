import type { Express, RequestHandler } from 'express';
import { buildMonthlyLeaderboard } from './leaderboard';
import { DEFAULT_LEADERBOARD_TOP_COUNT, isLeaderboardTopCount, monthBounds, shanghaiMonth } from '../shared/leaderboard';

export interface LeaderboardStore {
  readRecords(): Promise<{ games: Record<string, any>[]; users: Record<string, any>[] }>;
  readTopCount(): Promise<unknown>;
  writeTopCount(topCount: number): Promise<void>;
}

export function mongoLeaderboardStore(getCollections: () => { games: any; users: any; settings: any }): LeaderboardStore {
  function collections() {
    const value = getCollections();
    if (!value.games || !value.users || !value.settings) throw new Error('Leaderboard database unavailable');
    return value;
  }
  return {
    async readRecords() {
      const { games, users } = collections();
      const [gameRecords, userRecords] = await Promise.all([
        games.find({}).project({ gameId: 1, identityVersion: 1, roomId: 1, players: 1, winnerId: 1, turnCount: 1, mapType: 1, completedAt: 1, phase: 1 }).toArray(),
        users.find({}).project({ _id: 1, username: 1, isGuest: 1, role: 1, createdAt: 1 }).toArray(),
      ]);
      return { games: gameRecords, users: userRecords };
    },
    async readTopCount() {
      const setting = await collections().settings.findOne({ _id: 'monthly-leaderboard' });
      return setting?.topCount;
    },
    async writeTopCount(topCount) {
      await collections().settings.updateOne({ _id: 'monthly-leaderboard' },
        { $set: { topCount, updatedAt: new Date() } }, { upsert: true });
    },
  };
}

export function registerLeaderboardRoutes(app: Express, authenticate: RequestHandler,
  requireAdmin: RequestHandler, store: LeaderboardStore, now = () => Date.now()) {
  const topCount = async () => {
    const stored = await store.readTopCount();
    return isLeaderboardTopCount(stored) ? stored : DEFAULT_LEADERBOARD_TOP_COUNT;
  };
  app.get('/api/leaderboard', authenticate, async (req, res) => {
    const month = req.query.month === undefined ? shanghaiMonth(new Date(now())) : req.query.month;
    if (typeof month !== 'string') return res.status(400).json({ error: '月份格式应为 YYYY-MM' });
    try { monthBounds(month); } catch { return res.status(400).json({ error: '月份格式应为 YYYY-MM，年份不早于 2000' }); }
    try {
      const [{ games, users }, count] = await Promise.all([store.readRecords(), topCount()]);
      res.setHeader('Cache-Control', 'no-store');
      res.json(buildMonthlyLeaderboard(games, users, month, count, now(), String((req as any).user.userId || '')));
    } catch (error) {
      console.error('Read monthly leaderboard failed', error);
      res.status(503).json({ error: '排行榜暂时不可用，请稍后重试' });
    }
  });
  app.get('/api/admin/leaderboard/settings', authenticate, requireAdmin, async (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({ topCount: await topCount() });
    } catch (error) {
      console.error('Read leaderboard settings failed', error);
      res.status(503).json({ error: '排行榜设置暂时不可用' });
    }
  });
  app.put('/api/admin/leaderboard/settings', authenticate, requireAdmin, async (req, res) => {
    const count = req.body?.topCount;
    if (!isLeaderboardTopCount(count)) return res.status(400).json({ error: '显示人数须为 1 至 100 的整数' });
    try {
      await store.writeTopCount(count);
      res.json({ success: true, topCount: count });
    } catch (error) {
      console.error('Save leaderboard settings failed', error);
      res.status(503).json({ error: '排行榜设置保存失败' });
    }
  });
}
