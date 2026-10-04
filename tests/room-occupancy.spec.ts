import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

test('server blocks a disconnected active participant from joining another room', async ({ baseURL }) => {
  const sockets: Socket[] = [];
  const next = (s: Socket, event: string) => new Promise<any>(resolve => s.once(event, resolve));
  try {
    const s = io(baseURL!, { transports: ['websocket'], forceNew: true }); sockets.push(s);
    await next(s, 'connect');
    let pending = next(s, 'room_state'); s.emit('join_room', 'occupancy-original', 'seat-owner', 'owner'); await pending;
    pending = next(s, 'join_error'); s.emit('join_room', 'occupancy-second', 'seat-owner', 'owner');
    expect(await pending).toContain('occupancy-original');
    const state = { board: [], players: [{ id: 0, sessionId: 'seat-owner', isBot: false, resources: {}, devCards: [] }, ...[1, 2, 3].map(id => ({ id, isBot: true, resources: {}, devCards: [] }))], currentPlayerIndex: 0, phase: 'main', hasRolled: true, dice: [2, 3], winnerId: null, turn: 1, bankDevCards: [] };
    pending = next(s, 'game_init'); s.emit('start_game', 'occupancy-original', state); await pending;
    s.emit('leave_room', 'occupancy-original', 'seat-owner');
    pending = next(s, 'join_error'); s.emit('join_room', 'occupancy-second', 'seat-owner', 'owner');
    expect(await pending).toContain('occupancy-original');
    pending = next(s, 'game_init'); s.emit('join_room', 'occupancy-original', 'seat-owner', 'owner');
    expect((await pending).winnerId).toBeNull();
  } finally { sockets.forEach(s => s.disconnect()); }
});
