import { test, expect } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';
import { applyStatePatch } from '../shared/stateSync';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

test('unified directories, seven days, guest messaging and recipient ID search', async ({ page }, info) => {
  await page.goto('/?demoRole=admin');
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '管理中心', exact: true }).click();
  await expect(page.getByRole('heading', { name: '玩家私信', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '玩家名单', exact: true })).toHaveCount(0);
  await page.getByRole('heading', { name: '数据中心', exact: true }).click();
  const analytics = page.locator('[data-admin-section="analytics"]');
  await expect(analytics.locator('tbody tr')).toHaveCount(7);
  const columns = await analytics.locator('dl').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(3);
  await page.screenshot({ path: info.outputPath('analytics.png') });
  await analytics.getByRole('button', { name: '玩家名单', exact: true }).click();
  const users = page.locator('[data-admin-section="users"]');
  await expect(users.locator('[data-admin-user-count]')).toHaveText('3');
  await expect(users.locator('[data-admin-guest-count]')).toHaveText('1');
  await users.getByLabel('搜索玩家').fill('111111111111111111111111');
  await expect(users.locator('[data-admin-player]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath('players.png') });
  await users.getByTitle('返回二级菜单', { exact: true }).click();
  await analytics.getByRole('button', { name: '游客名单', exact: true }).click();
  const guests = page.locator('[data-admin-section="guests"]');
  await expect(guests.locator('[data-admin-user-count]')).toHaveText('3');
  await expect(guests.locator('[data-admin-game-count]')).toHaveText('3');
  expect(await guests.locator(':scope > div').evaluate(el => el.scrollTop)).toBe(0);
  await guests.getByLabel('搜索游客').fill('666666666666666666666666');
  await expect(guests.locator('[data-guest-id]')).toHaveCount(1);
  const guestRow = guests.locator('[data-guest-id]');
  expect((await guestRow.boundingBox())!.height).toBeLessThan(220);
  await expect(guestRow.getByText('体验游客', { exact: true })).toBeVisible();
  await guests.getByLabel('玩家排序字段').selectOption('totalGames');
  await page.screenshot({ path: info.outputPath('guests.png') });
  await guests.getByTitle('与该玩家发私信').click();
  await expect(page.locator('[data-admin-section]')).toHaveCount(0);
  await expect(page.getByText('体验游客', { exact: true }).first()).toBeVisible();
  // Return to the private-message list through the application's existing back handler.
  await page.evaluate(async () => { (await import('/src/' + 'navigation.ts')).requestAppBack(); });
  await page.getByRole('button', { name: '选择私信对象', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择私信对象', exact: true });
  await picker.getByLabel('搜索私信对象').fill('666666666666666666666666');
  await expect(picker.locator('[data-recipient-id]')).toHaveCount(1);
  await picker.getByRole('radio').check();
  await picker.getByRole('button', { name: '确认', exact: true }).click();
  await page.getByLabel('私信内容').fill('游客私信验证');
  const sent = page.waitForRequest(req => req.url().endsWith('/api/admin/messages') && req.method() === 'POST');
  await page.locator('.chat-screen').getByRole('button', { name: '发送', exact: true }).click();
  expect((await sent).postDataJSON().targetUserId).toBe('666666666666666666666666');
  await expect(page.locator('.chat-screen').getByText('游客私信验证', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('guest-chat.png') });
});

test('manual map view survives remote state and resize but explicit double tap resets it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(300);
  const read = async () => page.evaluate(async () => {
    const Konva = (await import('/node_modules/.vite/deps/' + 'konva.js')).default;
    const stage = Konva.stages.find((s: any) => s.findOne('.board-terrain'));
    return { scale: stage.scaleX(), x: stage.x(), y: stage.y() };
  });
  await page.evaluate(async () => {
    const Konva = (await import('/node_modules/.vite/deps/' + 'konva.js')).default;
    const stage = Konva.stages.find((s: any) => s.findOne('.board-terrain'));
    stage.scale({ x: 1.7, y: 1.7 }); stage.position({ x: 123, y: 86 }); stage.fire('dragstart'); stage.fire('dragend');
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const state = await new Promise<any>(resolve => {
      service.socket.once('game_state_updated', resolve);
      service.requestSync(service.authoritativeRoom.roomId);
    });
    service.socket.onevent({ data: ['game_state_updated', state, { roomId: service.authoritativeRoom.roomId }] });
  });
  await page.waitForTimeout(400);
  expect(await read()).toEqual({ scale: 1.7, x: 123, y: 86 });
  const recovered = await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const full = new Promise<any>(resolve => service.socket.once('game_state_updated', resolve));
    service.socket.onevent({ data: ['game_state_patch', { base: -100, revision: -99, changed: { phase: 'invalid' }, removed: [] }, { roomId: service.authoritativeRoom.roomId }] });
    return (await full).phase;
  });
  expect(recovered).not.toBe('invalid');
  expect(await read()).toEqual({ scale: 1.7, x: 123, y: 86 });
  await page.setViewportSize({ width: 900, height: 420 });
  await page.waitForTimeout(250);
  expect(await read()).toEqual({ scale: 1.7, x: 123, y: 86 });
  for (const event of ['dblclick', 'dbltap']) {
    await page.evaluate(async event => {
      const Konva = (await import('/node_modules/.vite/deps/' + 'konva.js')).default;
      const stage = Konva.stages.find((s: any) => s.findOne('.board-terrain'));
      stage.scale({ x: 1.7, y: 1.7 }); stage.position({ x: 123, y: 86 });
      stage.fire(event);
    }, event);
    await expect.poll(read).not.toEqual({ scale: 1.7, x: 123, y: 86 });
  }
  await page.reload();
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 20000 });
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 20000 });
  await expect.poll(read).not.toEqual({ scale: 1.7, x: 123, y: 86 });
});

test('wire patches, legacy full snapshots, resync and message summaries', async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop');
  const sockets: Socket[] = [];
  const connect = async (patches: boolean) => { const s = io(baseURL!, { transports: ['websocket'], auth: { statePatches: patches ? 1 : 0 }, forceNew: true }); sockets.push(s); await new Promise<void>(r => s.once('connect', r)); return s; };
  const next = (s: Socket, event: string) => new Promise<any[]>(resolve => s.once(event, (...args) => resolve(args)));
  try {
    const host = await connect(false), peer = await connect(true), legacy = await connect(false);
    for (const [socket, id] of [[host, 'host'], [peer, 'peer'], [legacy, 'legacy']] as const) { const pending = next(socket, 'room_state'); socket.emit('join_room', 'sync-test', id, id, id !== 'host'); await pending; }
    let ready = next(host, 'room_state'); host.emit('update_settings', 'sync-test', 'host', { spectatorHands: true }); await ready;
    let state: any = { board: Array.from({ length: 80 }, (_, id) => ({ id, q: id, r: 0, type: 'forest' })), players: [{ id: 0, sessionId: 'host', isBot: false, resources: {}, devCards: [] }, ...[1, 2, 3].map(id => ({ id, isBot: true, resources: {}, devCards: [] }))], currentPlayerIndex: 0, phase: 'main', hasRolled: true, dice: [2, 3], winnerId: null, turn: 1, bankDevCards: [] };
    let pending = next(peer, 'game_init'); host.emit('start_game', 'sync-test', state); await pending;
    pending = next(peer, 'game_state_updated'); const firstLegacy = next(legacy, 'game_state_updated'); host.emit('update_game_state', 'sync-test', { ...state, activeBuildMode: 'road' });
    const [full, context] = await pending;
    await firstLegacy;
    const patchPending = next(peer, 'game_state_patch'), legacyPending = next(legacy, 'game_state_updated');
    state = { ...full, activeBuildMode: 'city' }; host.emit('update_game_state', 'sync-test', state);
    const [patch] = await patchPending, [legacyFull] = await legacyPending;
    expect(applyStatePatch(full, context.syncRevision, patch)).toEqual(state); expect(legacyFull).toEqual(state);
    expect(JSON.stringify(patch).length).toBeLessThan(JSON.stringify(full).length / 4);
    pending = next(peer, 'game_state_updated'); peer.emit('request_sync', 'sync-test'); expect((await pending)[0]).toEqual(state);
    const session = await (await request.get('/api/demo/session')).json();
    const summary = await (await request.get('/api/messages?summary=1', { headers: { Authorization: `Bearer ${session.token}` } })).json();
    expect(summary.messages.length).toBeGreaterThan(0);
    expect(summary.messages.every((m: any) => !('content' in m) && !('title' in m))).toBe(true);
    expect(summary.allPlayers).toBeUndefined();
  } finally { sockets.forEach(s => s.disconnect()); }
});
