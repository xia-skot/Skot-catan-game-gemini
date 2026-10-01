import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

test('only the host starts and only joined non-spectators update a room', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'Server policy does not depend on browser engine');
  await request.post('/api/demo/reset');
  const clients: Socket[] = [];
  async function client() {
    const socket = io('http://127.0.0.1:5174', { transports: ['websocket'], forceNew: true });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    return socket;
  }
  async function snapshot(socket: Socket): Promise<any> {
    const rooms: any[] = await socket.timeout(3000).emitWithAck('get_active_rooms', false);
    return rooms.find(room => room.roomId === 'authority-test');
  }
  try {
    const host = await client(), outsider = await client(), spectator = await client();
    host.emit('join_room', 'authority-test', 'test-host', 'Host');
    await expect.poll(async () => (await snapshot(host))?.players.length).toBe(1);
    spectator.emit('join_room', 'authority-test', 'test-spectator', 'Spectator', true);
    await expect.poll(async () => (await snapshot(spectator))?.spectators.length).toBe(1);
    const initial = { players: [
      { id: 0, sessionId: 'test-host', name: 'Host', isBot: false },
      ...[1, 2, 3].map(id => ({ id, name: `AI ${id}`, isBot: true })),
    ], phase: 'setup', winnerId: null, turn: 1, robberHexId: 'old', pirateHexId: null };
    outsider.emit('start_game', 'authority-test', initial);
    expect((await snapshot(outsider)).gameState).toBeUndefined();
    spectator.emit('start_game', 'authority-test', initial);
    expect((await snapshot(spectator)).gameState).toBeUndefined();
    host.emit('start_game', 'authority-test', initial);
    expect((await snapshot(host)).gameState).toMatchObject(initial);
    host.emit('start_game', 'authority-test', { ...initial, turn: 999 });
    expect((await snapshot(host)).gameState.turn).toBe(1);
    outsider.emit('update_game_state', 'authority-test', { ...initial, turn: 999 });
    expect((await snapshot(outsider)).gameState.turn).toBe(1);
    spectator.emit('update_game_state', 'authority-test', { ...initial, turn: 999 });
    expect((await snapshot(spectator)).gameState.turn).toBe(1);
    host.emit('update_game_state', 'authority-test', { ...initial, turn: 2 });
    expect((await snapshot(host)).gameState.turn).toBe(2);
    const base = { ...(await snapshot(host)).gameState, turn: 3, phase: 'main', currentPlayerIndex: 1,
      hasRolled: false, dice: [0, 0], robberHexId: 'old', pirateHexId: null };
    host.emit('update_game_state', 'authority-test', base);
    await expect.poll(async () => (await snapshot(host)).gameState.turn).toBe(3);
    host.emit('update_game_state', 'authority-test', { ...base, hasRolled: true, dice: [2, 3] });
    await expect.poll(async () => (await snapshot(host)).gameState.dice).toEqual([2, 3]);
    host.emit('update_game_state', 'authority-test', { ...base, hasRolled: true, dice: [6, 6] });
    await expect.poll(async () => (await snapshot(host)).gameState.dice).toEqual([2, 3]);
    const robber = { ...(await snapshot(host)).gameState, phase: 'robber' };
    host.emit('update_game_state', 'authority-test', robber);
    await expect.poll(async () => (await snapshot(host)).gameState.phase).toBe('robber');
    host.emit('update_game_state', 'authority-test', { ...robber, phase: 'main', robberHexId: 'first' });
    await expect.poll(async () => (await snapshot(host)).gameState.robberHexId).toBe('first');
    host.emit('update_game_state', 'authority-test', { ...robber, phase: 'main', robberHexId: 'second' });
    await expect.poll(async () => (await snapshot(host)).gameState.robberHexId).toBe('first');
    // A stale player entry must not override a socket's explicit spectator membership.
    host.emit('join_room', 'authority-test', 'host-as-spectator', 'Observer', true);
    expect((await snapshot(host)).spectators).toHaveLength(2);
    host.emit('update_game_state', 'authority-test', { ...initial, turn: 999 });
    expect((await snapshot(host)).gameState.turn).toBe(3);
  } finally { clients.forEach(socket => socket.disconnect()); }
});
