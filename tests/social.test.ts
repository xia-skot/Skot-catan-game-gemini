import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { ObjectId } from 'mongodb';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import { loginDeviceGuest, renameGuest } from '../server/guestIdentity';
import { spectatorGameState } from '../shared/spectatorView';
import { applySettingsPatch } from '../shared/roomSetup';
import { freeSeats, groupOnline } from '../shared/social';
import { SocialStore } from '../server/socialStore';
import { createSocialService } from '../server/social';

const secret = 'social-test-secret';
function guests() {
  const records: any[] = [];
  const matches = (doc: any, filter: any): boolean => Object.entries(filter).every(([key, value]: any) => key === '$or' ? value.some((part: any) => matches(doc, part)) : value && typeof value === 'object' && '$exists' in value ? (doc[key] !== undefined) === value.$exists : String(doc[key]) === String(value));
  return { records, findOne: async (filter: any) => records.find(record => matches(record, filter)), updateOne: async (filter: any, update: any) => {
    let doc = records.find(record => matches(record, filter));
    if (!doc) {
      if (records.some(record => String(record._id) === String(filter._id) || record.guestDeviceHash === update.$set.guestDeviceHash)) throw Object.assign(new Error('duplicate'), { code: 11000 });
      doc = { _id: filter._id, ...update.$setOnInsert }; records.push(doc);
    }
    Object.assign(doc, update.$set);
  } };
}
test('one device guest keeps its ID across repeated login, rename and concurrent requests', async () => {
  const users = guests(), key = randomUUID();
  const first = await loginDeviceGuest(users, secret, key, '游客甲');
  const second = await loginDeviceGuest(users, secret, key, '改了昵称');
  assert.equal(first.id, second.id); assert.equal(second.username, '改了昵称');
  const concurrent = await Promise.all(Array.from({ length: 10 }, () => loginDeviceGuest(users, secret, key, '同一个游客')));
  assert.ok(concurrent.every(user => user.id === first.id)); assert.equal(users.records.length, 1);
  const renamed = await renameGuest(users, first.id, '资料页改名');
  assert.equal(renamed.id, first.id);
  assert.equal(users.records[0].username, '资料页改名');
  assert.equal(users.records[0].isGuest, true);
  const other = await loginDeviceGuest(users, secret, randomUUID(), '另一个设备');
  assert.notEqual(other.id, first.id);
});
test('legacy guests require signed proof and registered identities cannot be adopted', async () => {
  const users = guests(), id = new ObjectId();
  users.records.push({ _id: id, isGuest: true, username: '旧游客' });
  const token = jwt.sign({ userId: String(id), isGuest: true }, secret, { expiresIn: -1 });
  const adopted = await loginDeviceGuest(users, secret, randomUUID(), '新昵称', token);
  assert.equal(adopted.id, String(id));
  const forged = await loginDeviceGuest(users, secret, randomUUID(), '不能冒领', String(id));
  assert.notEqual(forged.id, String(id));
  const registered = new ObjectId(); users.records.push({ _id: registered, isGuest: false });
  const result = await loginDeviceGuest(users, secret, randomUUID(), '游客', jwt.sign({ userId: String(registered), isGuest: false }, secret));
  assert.notEqual(result.id, String(registered));
  await assert.rejects(loginDeviceGuest(users, secret, 'short', '游客'), /INVALID_DEVICE/);
  await assert.rejects(loginDeviceGuest(null, secret, randomUUID(), '游客'), /DATABASE_UNAVAILABLE/);
});
test('spectator views hide hands by default, preserve counts, never disclose deck order or mutate authority', () => {
  const state = { players: [{ resources: { wool: 4, ore: 2 }, devCards: ['knight'], devCardsBoughtThisTurn: ['victoryPoint'], playedDevCards: ['knight'], vpCardsCount: 1 }], bankDevCards: ['monopoly', 'knight'] };
  const view = spectatorGameState(state, false);
  assert.equal(view.handsHidden, true); assert.deepEqual(view.players[0].resources, { wool: 0, ore: 0 });
  assert.deepEqual(view.players[0].devCards, []); assert.equal(view.players[0].publicResourceCount, 6);
  assert.equal(view.players[0].publicDevCardCount, 3); assert.equal(view.publicBankDevCardCount, 2);
  assert.deepEqual(view.bankDevCards, []); assert.equal(state.players[0].resources.wool, 4);
  const opened = spectatorGameState(state, true);
  assert.deepEqual(opened.players[0].resources, state.players[0].resources); assert.deepEqual(opened.bankDevCards, []);
  const room = { hostId: 'a', players: [{ id: 'a', name: 'a' }], settings: { spectatorHands: undefined as boolean | undefined, playerCount: 2, mapType: 'standard', botConfig: [false, true] } };
  assert.equal(applySettingsPatch(room, { spectatorHands: 'true' as any }).settings.spectatorHands, undefined);
  assert.equal(applySettingsPatch(room, { spectatorHands: true }).settings.spectatorHands, true);
});
test('online accounts deduplicate tabs, busy status wins and bots consume seats', () => {
  const users = groupOnline([{ accountId: 'a', status: 'idle' }, { accountId: 'a', status: 'playing' }, { accountId: 'b', status: 'spectating' }]);
  assert.equal(users.length, 2); assert.equal(users[0].status, 'playing');
  assert.equal(freeSeats({ players: [{}], settings: { playerCount: 4, botConfig: [false, true, true] } }), 1);
  assert.equal(freeSeats({ gameState: {}, players: [] }), 0);
});
test('invitation acceptance is atomic, expired invites fail and accepted invites have travel grace', async () => {
  const store = new SocialStore();
  const invite = { id: 'inv', recipientId: 'a', roomId: 'r', origin: 'http://localhost', hostName: 'h', expiresAt: Date.now() + 500 };
  assert.equal(await store.claim(invite), true); assert.equal(await store.claim({ ...invite, id: 'other' }), false);
  assert.deepEqual(await Promise.all([store.respond('a', 'inv', 'accepted'), store.respond('a', 'inv', 'declined')]), [true, false]);
  assert.ok((await store.forUsers(['a']))[0].expiresAt > Date.now() + 50000);
  await store.claim({ ...invite, recipientId: 'b', expiresAt: Date.now() - 1 });
  assert.equal(await store.respond('b', 'inv', 'accepted'), false);
});

test('different game nodes deliver invitations through the shared store and validate travel at the host', async () => {
  const store = new SocialStore(), hostRooms = new Map<string, any>();
  const servers = [createServer(), createServer()], ios = servers.map(server => new Server(server));
  const services = [createSocialService(ios[0], hostRooms, secret, store, 'https://skot-game01.onrender.com'), createSocialService(ios[1], new Map(), secret, store, 'https://skot-game03.onrender.com')];
  ios.forEach((io, index) => io.on('connection', socket => services[index].attach(socket)));
  const sockets: Socket[] = [];
  try {
    for (const server of servers) await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    for (let i = 0; i < 2; i++) {
      const socket = connect(`http://127.0.0.1:${(servers[i].address() as any).port}`, { transports: ['websocket'] }); sockets.push(socket);
      await new Promise<void>(resolve => socket.once('connect', resolve));
      await socket.timeout(2000).emitWithAck('social_auth', jwt.sign({ userId: i ? 'guest' : 'host', username: i ? '游客' : '房主', isGuest: !!i }, secret, { expiresIn: '1h' }));
    }
    hostRooms.set('travel', { roomId: 'travel', hostId: 'host', players: [{ id: 'host', socketId: sockets[0].id, name: '房主' }], settings: { playerCount: 2, botConfig: [] } });
    const received = new Promise<any>(resolve => sockets[1].once('room_invitation', resolve));
    assert.equal((await sockets[0].timeout(2000).emitWithAck('invite_online', 'travel')).sent, 1);
    const invitation = await received; assert.equal(invitation.origin, 'https://skot-game01.onrender.com');
    assert.equal((await sockets[1].timeout(2000).emitWithAck('invitation_reply', invitation.id, true)).success, true);
    assert.equal(await services[0].validateInvitation('guest', invitation.id, 'travel'), true);
    assert.equal(await services[1].validateInvitation('guest', invitation.id, 'travel'), false);
    assert.equal(await services[0].validateInvitation('other', invitation.id, 'travel'), false);
    // Leaving an unfinished game does not make a participant eligible for invitations.
    hostRooms.set('unfinished', { roomId: 'unfinished', players: [{ id: 'guest', disconnected: true }], gameState: { winnerId: null } });
    assert.equal(await services[0].validateInvitation('guest', invitation.id, 'travel'), false);
  } finally {
    services.forEach(service => service.close()); sockets.forEach(socket => socket.disconnect());
    for (const io of ios) await new Promise<void>(resolve => io.close(() => resolve()));
    servers.forEach(server => server.close());
  }
});

test('real sockets authenticate online presence, stage at most ten invites and enforce avatar membership', async () => {
  class TrackingStore extends SocialStore {
    claimed: any[] = [];
    async claim(invitation: any) { const ok = await super.claim(invitation); if (ok) { this.claimed.push(invitation); await this.respond(invitation.recipientId, invitation.id, 'declined'); } return ok; }
  }
  const server = createServer(), io = new Server(server), rooms = new Map<string, any>(), store = new TrackingStore();
  const social = createSocialService(io, rooms, secret, store, 'http://localhost'); io.on('connection', socket => social.attach(socket));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port, sockets: Socket[] = [];
  async function client(id: string) {
    const socket = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true }); sockets.push(socket);
    await new Promise<void>(resolve => socket.once('connect', resolve));
    const result = await socket.timeout(2000).emitWithAck('social_auth', jwt.sign({ userId: id, username: id, isGuest: false }, secret, { expiresIn: '1h' }));
    assert.equal(result.success, true); return socket;
  }
  try {
    const host = await client('host'), outsider = await client('outsider');
    const room = { roomId: 'r', hostId: 'host', players: [{ id: 'host', socketId: host.id, name: '房主' }], spectators: [], settings: { playerCount: 6, botConfig: [] } }; rooms.set('r', room);
    io.sockets.sockets.get(host.id!)!.join('r');
    for (let i = 0; i < 12; i++) await store.putSession({ _id: `candidate${i}`, accountId: `candidate${i}`, username: `玩家${i}`, status: 'idle', expiresAt: new Date(Date.now() + 45000) });
    await store.putSession({ _id: 'busy', accountId: 'busy', status: 'playing', expiresAt: new Date(Date.now() + 45000) });
    rooms.set('autoplay', { roomId: 'autoplay', players: [{ id: 'autoplay-user', disconnected: true }], gameState: { winnerId: null } });
    const autoplay = await client('autoplay-user');
    assert.equal((await social.online()).find(user => user.accountId === 'autoplay-user')?.status, 'playing');
    // Even a stale idle presence record must be filtered before sending.
    await store.putSession({ _id: 'stale', accountId: 'stale-user', status: 'idle', expiresAt: new Date(Date.now() + 45000) });
    rooms.set('stale-room', { roomId: 'stale-room', players: [{ id: 'stale-user', disconnected: true }], gameState: { winnerId: null } });
    await SocialStore.prototype.claim.call(store, { id: 'late-invite', roomId: 'r', origin: 'http://localhost', hostName: 'host', recipientId: 'autoplay-user', expiresAt: Date.now() + 10000 });
    assert.ok((await autoplay.timeout(2000).emitWithAck('invitation_reply', 'late-invite', true)).error);
    store.claimed.length = 0;
    assert.ok((await outsider.timeout(2000).emitWithAck('invite_online', 'r')).error);
    const sent = await host.timeout(2000).emitWithAck('invite_online', 'r');
    assert.equal(sent.sent, 3);
    await new Promise(resolve => setTimeout(resolve, 8000));
    assert.equal(store.claimed.length, 10); assert.equal(new Set(store.claimed.map(item => item.recipientId)).size, 10);
    assert.ok(store.claimed.every(item => !['host', 'busy', 'autoplay-user', 'stale-user'].includes(item.recipientId)));
    assert.ok((await host.timeout(2000).emitWithAck('invite_online', 'r')).error);
    assert.ok((await social.online()).some(user => user.accountId === 'host'));
    (room as any).gameState = { players: [{ id: 0, sessionId: 'host' }, { id: 1, isBot: true }] };
    let reactions = 0; host.on('room_reaction', () => reactions++);
    outsider.emit('room_reaction', 'r', 'host', 'pan'); host.emit('room_reaction', 'r', 'host', 'pan');
    await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(reactions, 0);
    host.emit('room_reaction', 'r', 'bot:1', 'flower'); host.emit('room_reaction', 'r', 'bot:1', 'egg');
    await new Promise(resolve => setTimeout(resolve, 80)); assert.equal(reactions, 1);
  } finally { social.close(); sockets.forEach(socket => socket.disconnect()); await new Promise<void>(resolve => io.close(() => resolve())); server.close(); }
});
