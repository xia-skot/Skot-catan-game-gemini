import { test, expect } from '@playwright/test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { registerMessageDeletionRoutes } from '../server/messageRoutes';

test('deletion routes reject invalid IDs and unauthorized messages, preserve admin access', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'Server route test is browser independent');
  const app = express();
  app.use(express.json());
  const owned = new ObjectId(), foreign = new ObjectId(), system = new ObjectId();
  const messages = [
    { _id: owned, type: 'private', targetUserId: 'self' },
    { _id: foreign, type: 'private', targetUserId: 'someone-else', targetUserName: 'player' },
    { _id: system, type: 'system' },
  ];
  const deleted: any[] = [];
  registerMessageDeletionRoutes(app, (req: any, _res, next) => {
    req.user = { userId: 'self', username: 'player', role: req.headers['x-test-role'] || 'user' }; next();
  }, () => ({
    findOne: async (filter: any) => messages.find(msg => String(msg._id) === String(filter._id)),
    deleteOne: async (filter: any) => { deleted.push(filter); },
    deleteMany: async (filter: any) => { deleted.push(filter); },
  }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/messages/`;
  try {
    expect((await request.delete(url + 'not-an-id')).status()).toBe(400);
    expect((await request.delete(url + new ObjectId())).status()).toBe(404);
    expect((await request.delete(url + foreign)).status()).toBe(403);
    expect((await request.delete(url + system)).status()).toBe(403);
    expect((await request.delete(url + owned)).status()).toBe(200);
    expect((await request.delete(url + foreign, { headers: { 'x-test-role': 'admin' } })).status()).toBe(200);
    expect((await request.delete(url + 'conversation', { data: { partner: 'someone-else' } })).status()).toBe(200);
    expect(deleted[2]).toEqual({ type: 'private', $or: [
      { senderId: 'self' }, { targetUserId: 'self' }, { senderId: 'player' }, { targetUserId: 'player' },
      { senderId: { $in: [null, ''] }, senderName: 'player' }, { targetUserId: { $in: [null, ''] }, targetUserName: 'player' },
    ] });
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
