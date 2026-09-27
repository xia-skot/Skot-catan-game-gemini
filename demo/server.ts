import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';

const user = { id: '111111111111111111111111', username: '体验玩家', email: 'demo@example.test', role: 'user', isGuest: false };
function matches(document: any, filter: any): boolean {
  return Object.entries(filter).every(([key, value]: [string, any]) => {
    if (key === '$or') return value.some((part: any) => matches(document, part));
    if (value && '$in' in Object(value)) return value.$in.some((item: any) => String(item) === String(document[key]));
    return String(document[key]) === String(value);
  });
}

export function attachDemoApi(app: Express, secret: string, resetRooms: () => void) {
  let messages: any[] = [];
  const seed = () => {
    messages = [{ _id: new ObjectId('222222222222222222222222'), type: 'private', title: '欢迎', content: '这是一条演示私信。打开对话后，未读提示会消失。', senderId: 'admin', senderName: '肖隐弦', targetUserId: user.id, targetUserName: user.username, createdAt: Date.now() },
      { _id: new ObjectId('333333333333333333333333'), type: 'system', title: '海域公告', content: '祝你在岛屿上有一段愉快的旅程。', createdAt: Date.now() }];
  };
  seed();
  const session = () => ({ user, token: jwt.sign({ userId: user.id, username: user.username, role: user.role, isGuest: false }, secret, { expiresIn: '1d' }) });
  app.get('/api/demo/session', (_req, res) => res.json(session()));
  app.post('/api/demo/reset', (_req, res) => { seed(); resetRooms(); res.json({ success: true }); });
  app.get('/api/me', (_req, res) => res.json({ user }));
  app.post('/api/login', (_req, res) => res.json(session()));
  app.get('/api/about', (_req, res) => res.json({ content: '卡坦岛 · 本地演示', updatedAt: new Date().toISOString() }));
  app.get('/api/user/games', (_req, res) => res.json({ games: [], stats: { totalGames: 0, wins: 0, winRate: 0 } }));
  app.get('/api/maps', (_req, res) => res.json({ maps: [] }));
  app.get('/api/feedback/prompt', (_req, res) => res.json({ prompt: '演示反馈' }));
  app.post('/api/feedback', (_req, res) => res.json({ success: true }));
  app.use('/api', (req, res, next) => {
    const allowed = ['/messages', '/sound-settings', '/health', '/db-status'];
    if (allowed.some(prefix => req.path === prefix || req.path.startsWith(prefix + '/'))) return next();
    res.status(403).json({ error: '此操作不在本地演示范围内' });
  });
  return {
    find: () => ({ sort: () => ({ toArray: async () => [...messages].sort((a, b) => b.createdAt - a.createdAt) }) }),
    findOne: async (filter: any) => messages.find(item => matches(item, filter)) || null,
    insertOne: async (document: any) => { const _id = new ObjectId(); messages.push({ ...document, _id }); return { insertedId: _id }; },
    deleteOne: async (filter: any) => { const index = messages.findIndex(item => matches(item, filter)); if (index >= 0) messages.splice(index, 1); return { deletedCount: index >= 0 ? 1 : 0 }; },
    deleteMany: async (filter: any) => { const before = messages.length; messages = messages.filter(item => !matches(item, filter)); return { deletedCount: before - messages.length }; },
  };
}
