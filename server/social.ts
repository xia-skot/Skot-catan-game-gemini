import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Server, Socket } from 'socket.io';
import { EMOTES, GIFTS, freeSeats, groupOnline, type RoomInvitation } from '../shared/social';
import { SocialStore } from './socialStore';
import { conflictingRoom } from './roomOccupancy';

export function createSocialService(io: Server, rooms: Map<string, any>, secret: string, store: SocialStore, origin: string) {
  const nodeId = randomUUID();
  const campaigns = new Map<string, { hostId: string; sent: Map<string, string>; started: number; lastWave: number }>();
  const roomCooldowns = new WeakMap<object, number>();
  let busy = false;
  const waveLocks = new Set<string>();
  function statusFor(id: string) {
    const occupied = conflictingRoom(rooms.values(), id, '');
    if (occupied) return { status: occupied.gameState ? 'playing' : 'waiting', roomId: occupied.roomId };
    for (const room of rooms.values()) {
      if (room.players.some((p: any) => p.id === id && !p.disconnected)) return { status: room.gameState ? 'playing' : 'waiting', roomId: room.roomId };
      if (room.spectators?.some((p: any) => p.id === id)) return { status: 'spectating', roomId: room.roomId };
    }
    return { status: 'idle', roomId: null };
  }
  async function publish(socket: Socket) {
    const account = socket.data.socialAccount;
    if (!account || !socket.connected) return;
    if (account.exp * 1000 <= Date.now()) { delete socket.data.socialAccount; await store.removeSession(`${nodeId}:${socket.id}`); return; }
    await store.putSession({ _id: `${nodeId}:${socket.id}`, accountId: account.userId, username: account.username,
      isGuest: account.isGuest, origin, ...statusFor(account.userId), expiresAt: new Date(Date.now() + 45000) });
  }
  async function nextWave(roomId: string) {
    if (waveLocks.has(roomId)) return;
    waveLocks.add(roomId);
    try {
    const campaign = campaigns.get(roomId), room = rooms.get(roomId);
    if (!campaign) return;
    if (!room || !freeSeats(room) || room.hostId !== campaign.hostId || Date.now() - campaign.started > 60000 ||
        !room.players.some((p: any) => p.id === campaign.hostId && !p.disconnected)) {
      campaigns.delete(roomId);
      for (const [account, id] of campaign.sent) await store.respond(account, id, 'cancelled');
      return;
    }
    const existing = await store.forUsers([...campaign.sent.keys()]);
    const outstanding = existing.filter(item => campaign.sent.get(item.recipientId) === item.id &&
      item.expiresAt > Date.now() && ['pending', 'accepted'].includes(item.status) && !room.players.some((p: any) => p.id === item.recipientId)).length;
    const remaining = Math.min(3 - outstanding, freeSeats(room) - outstanding, 10 - campaign.sent.size);
    if (remaining <= 0 || Date.now() - campaign.lastWave < 1500) return;
    const online = groupOnline(await store.online()).filter(user => user.status === 'idle' && statusFor(user.accountId).status === 'idle' && user.accountId !== campaign.hostId && !campaign.sent.has(user.accountId));
    // Rotate candidates so frequent invitations don't always target the same names.
    const offset = online.length ? Math.floor(Math.random() * online.length) : 0;
    const candidates = [...online.slice(offset), ...online.slice(0, offset)];
    let sent = 0;
    for (const user of candidates) {
      if (sent >= remaining) break;
      const invitation: RoomInvitation = { id: randomUUID(), roomId, origin, hostName: room.players.find((p: any) => p.id === room.hostId)?.name || '房主', recipientId: user.accountId, expiresAt: Date.now() + 10000 };
      if (await store.claim(invitation)) { campaign.sent.set(user.accountId, invitation.id); sent++; }
    }
    campaign.lastWave = Date.now();
    io.to(roomId).emit('invitation_progress', { roomId, sent: campaign.sent.size, active: true });
    } finally { waveLocks.delete(roomId); }
  }
  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const sockets = [...io.sockets.sockets.values()].filter(socket => socket.data.socialAccount);
      const incoming = await store.forUsers([...new Set(sockets.map(socket => socket.data.socialAccount.userId))]);
      for (const socket of sockets) {
        const accountId = socket.data.socialAccount.userId;
        const item = incoming.find(item => item.recipientId === accountId);
        if (item?.status === 'pending' && item.expiresAt > Date.now() && statusFor(accountId).status === 'idle') {
          if (socket.data.lastInvitation !== item.id) { socket.data.lastInvitation = item.id; socket.emit('room_invitation', item); }
        } else if (socket.data.lastInvitation) {
          socket.emit('invitation_closed', socket.data.lastInvitation); socket.data.lastInvitation = null;
        }
      }
      for (const id of campaigns.keys()) await nextWave(id);
    } catch { /* A failed poll must never crash a running game. */ }
    finally { busy = false; }
  }
  const timer = setInterval(tick, 1000); timer.unref();
  const heartbeat = setInterval(() => { for (const socket of io.sockets.sockets.values()) void publish(socket).catch(() => {}); }, 15000); heartbeat.unref();
  return {
    online: async () => groupOnline(await store.online()).map(({ accountId, username, isGuest, status, roomId, origin }) => ({ accountId, username, isGuest, status, roomId, origin })),
    async resetDemoData() {
      campaigns.clear(); store.resetMemory();
      for (const socket of io.sockets.sockets.values()) { socket.data.lastInvitation = null; await publish(socket); }
    },
    async validateInvitation(accountId: string, id: string, roomId: string) {
      if (conflictingRoom(rooms.values(), accountId, roomId)) return false;
      const item = (await store.forUsers([accountId]))[0];
      return item?.id === id && item.roomId === roomId && item.origin === origin && item.status === 'accepted' && item.expiresAt > Date.now();
    },
    close() { clearInterval(timer); clearInterval(heartbeat); },
    attach(socket: Socket) {
      socket.on('social_auth', async (token: unknown, ack?: (data: any) => void) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          const account = jwt.verify(String(token || ''), secret) as jwt.JwtPayload;
          if (typeof account.userId !== 'string' || typeof account.username !== 'string' || typeof account.isGuest !== 'boolean' || !account.exp) throw new Error('Invalid account');
          if (socket.data.socialAccount && socket.data.socialAccount.userId !== account.userId) {
            reply({ error: '请重新连接后切换账号' }); return;
          }
          socket.data.socialAccount = account; await publish(socket); reply({ success: true });
        } catch { reply({ error: '登录已失效，请重新登录' }); }
      });
      socket.onAny(event => {
        if (['join_room', 'leave_room', 'start_game', 'return_to_lobby', 'reset_game'].includes(event)) setTimeout(() => void publish(socket).catch(() => {}), 100);
      });
      socket.on('invite_online', async (roomId: string, ack?: (data: any) => void) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const room = rooms.get(roomId), account = socket.data.socialAccount;
        if (!account || !room || room.hostId !== account.userId || !room.players.some((p: any) => p.id === room.hostId && p.socketId === socket.id) || !freeSeats(room)) {
          reply({ error: '仅有空位的待开始房间房主可以邀请' }); return;
        }
        if (campaigns.has(roomId) || Date.now() - (roomCooldowns.get(room) || 0) < 60000) { reply({ error: '本轮邀请进行中，请稍后再试' }); return; }
        roomCooldowns.set(room, Date.now());
        campaigns.set(roomId, { hostId: account.userId, sent: new Map(), started: Date.now(), lastWave: 0 });
        try { await nextWave(roomId); reply({ success: true, sent: campaigns.get(roomId)?.sent.size || 0 }); }
        catch { campaigns.delete(roomId); reply({ error: '邀请暂不可用，请稍后重试' }); }
      });
      socket.on('invitation_reply', async (id: string, accept: boolean, ack?: (data: any) => void) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        const account = socket.data.socialAccount;
        if (!account || typeof id !== 'string') { reply({ error: '请先登录' }); return; }
        try {
          const item = (await store.forUsers([account.userId]))[0];
          const globalUser = groupOnline(await store.online()).find(user => user.accountId === account.userId);
          if (!item || item.id !== id || statusFor(account.userId).status !== 'idle' || (globalUser && globalUser.status !== 'idle')) { reply({ error: '邀请已失效或你已在房间中' }); return; }
          if (!await store.respond(account.userId, id, accept ? 'accepted' : 'declined')) { reply({ error: '邀请已过期' }); return; }
          reply({ success: true, invitation: accept ? item : undefined });
          for (const other of io.sockets.sockets.values()) if (other.data.socialAccount?.userId === account.userId) other.emit('invitation_closed', id);
        } catch { reply({ error: '邀请回应失败，请重试' }); }
      });
      socket.on('room_reaction', (roomId: string, targetId: string, kind: string) => {
        const room = rooms.get(roomId);
        const actor = [...(room?.players || []), ...(room?.spectators || [])].find((p: any) => p.socketId === socket.id && !p.disconnected);
        if (!room?.gameState || !actor || !socket.rooms.has(roomId) || Date.now() - (socket.data.lastReaction || 0) < 1800) return;
        const targets = [...room.gameState.players.map((p: any) => String(p.sessionId || `bot:${p.id}`)), ...(room.spectators || []).map((p: any) => p.id)];
        const own = targetId === actor.id;
        if (!targets.includes(targetId) || !(own ? EMOTES : GIFTS).includes(kind as never)) return;
        socket.data.lastReaction = Date.now();
        io.to(roomId).emit('room_reaction', { id: randomUUID(), roomId, actorId: actor.id, actorName: actor.name, targetId, kind, createdAt: Date.now() });
      });
      socket.on('disconnect', () => { void store.removeSession(`${nodeId}:${socket.id}`).catch(() => {}); });
    },
  };
}
