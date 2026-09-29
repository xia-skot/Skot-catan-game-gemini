import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId } from 'mongodb';
import type { AddressInfo } from 'node:net';
import { registerAnnouncementEditingRoutes } from '../server/announcementRoutes';

test('announcement republication preserves its ID, refreshes date, and rejects stale edits and private messages', async () => {
  const id = '333333333333333333333333';
  let document: any = { _id: new ObjectId(id), type: 'system', title: '旧标题', content: '旧正文', createdAt: 1 };
  const collection = {
    findOne: async () => document,
    updateOne: async (filter: any, update: any) => {
      if (filter.createdAt !== document.createdAt) return { matchedCount: 0 };
      Object.assign(document, update.$set); return { matchedCount: 1 };
    }
  };
  const app = express(); app.use(express.json());
  registerAnnouncementEditingRoutes(app, (req: any, _res, next) => { req.user = { username: '管理员' }; next(); },
    (_req, _res, next) => next(), () => collection);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/messages/${id}`;
  const edit = (revision: number, title = ' 新标题 ') => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content: '新正文', revision }) });
  try {
    const result = await edit(1); assert.equal(result.status, 200);
    const { message } = await result.json();
    assert.equal(message.id, id); assert.equal(message.title, '新标题'); assert.equal(message.revision, 2);
    assert.ok(message.createdAt > 1); assert.match(message.date, /^\d{4}-\d{2}-\d{2} /);
    assert.equal((await edit(1)).status, 409);
    assert.equal((await edit(2, ' ')).status, 400);
    document.type = 'private'; assert.equal((await edit(2)).status, 409);
    document = null; assert.equal((await edit(2)).status, 404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
