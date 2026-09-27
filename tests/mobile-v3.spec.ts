import { test, expect, type Page } from '@playwright/test';
import { applySettingsPatch, getSetupSlots } from '../shared/roomSetup';
import { io } from 'socket.io-client';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });
async function open(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 15000 });
}
async function tab(page: Page, name: string) {
  await page.locator('.lobby-tab-bar').getByRole('button', { name, exact: true }).click();
}

test('capacity preserves sparse AI seats and cancels last AIs before last humans', ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'Shared pure logic');
  const room = { hostId: 'h', players: [{ id: 'h', name: 'Host' }], settings: { playerCount: 4, mapType: 'standard', botConfig: [false, false, false, true] } };
  const reduced = applySettingsPatch(room, { playerCount: 2 });
  expect(reduced.settings.botConfig[3]).toBe(true);
  expect(reduced.settings.botConfig[1]).toBe(false);
  expect(getSetupSlots(reduced).filter(slot => slot.isBot || slot.player).map(slot => slot.index)).toEqual([0, 3]);
  const full = { ...room, players: [...room.players, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], settings: { ...room.settings, playerCount: 6, botConfig: [false, false, false, true, true, true] } };
  const four = applySettingsPatch(full, { playerCount: 4 });
  expect(four.settings.botConfig).toEqual([false, false, false, true, false, false, false, false, false, false]);
  const two = applySettingsPatch(full, { playerCount: 2 });
  expect(two.players.map(p => p.id)).toEqual(['h', 'b']);
  expect((two as any).spectators.map((p: any) => p.id)).toEqual(['c']);
  expect(two.settings.botConfig.some(Boolean)).toBe(false);
});

test('all primary pages warn on first back and use a one-second exit window', async ({ page }) => {
  await page.route('**/exit-fixture', route => route.fulfill({ contentType: 'text/html', body: '<h1>Previous page</h1>' }));
  await page.goto('/exit-fixture');
  await open(page);
  for (const name of ['我的', '规则', '大厅', '约战']) {
    await tab(page, name);
    const current = await page.locator('[data-lobby-tabs]').getAttribute('data-lobby-tabs');
    await page.evaluate(() => history.back());
    await expect(page.locator('.exit-toast')).toBeVisible();
    expect(await page.evaluate(() => !!history.state?.catanApp)).toBe(false);
    if (name === '我的') {
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
      await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
      await page.evaluate(() => history.back());
      await expect(page.locator('.exit-toast')).toBeVisible();
    }
    await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', current!);
    await page.waitForTimeout(1100);
    await expect(page.locator('.exit-toast')).toHaveCount(0);
    expect(await page.evaluate(() => !!history.state?.catanApp)).toBe(true);
  }
  await page.evaluate(() => history.back());
  await expect(page.locator('.exit-toast')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/exit-fixture$/);
});

test('private cards display unread numbers and native back never skips the profile', async ({ page }) => {
  await open(page);
  await tab(page, '我的');
  await page.getByText('私信', { exact: true }).click();
  await expect(page.locator('[data-unread-count="1"]')).toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page.getByText('肖隐弦', { exact: true }).click();
    await expect(page.locator('.chat-screen')).toBeVisible();
    const back = await page.locator('.chat-screen').getByTitle('返回', { exact: true }).boundingBox();
    expect(back!.x).toBeGreaterThan(page.viewportSize()!.width * 0.75);
    await page.evaluate(() => history.back());
    await expect(page.locator('.chat-screen')).toHaveCount(0);
    await expect(page.locator('[data-unread-count]')).toHaveCount(0);
    await page.evaluate(() => history.back());
    await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
    await expect(page.locator('.exit-toast')).toHaveCount(0);
    if (i < 2) await page.getByText('私信', { exact: true }).click();
  }
});

test('admin player list is fullscreen and history returns through every parent', async ({ page }, info) => {
  const player = { id: 'player24', _id: 'player24', username: '玩家24', role: 'user', email: 'player@example.test' };
  await page.route('**/api/me', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, user: { ...data.user, role: 'admin' } } });
  });
  await page.route('**/api/admin/stats', route => route.fulfill({ json: { allUsers: [player], latestUsers: [player], settings: {} } }));
  await page.route('**/api/admin/feedbacks', route => route.fulfill({ json: { feedbacks: [] } }));
  await page.route('**/api/admin/user/*/info', route => route.fulfill({ json: { user: player } }));
  await page.route('**/api/admin/user/*/games', route => route.fulfill({ json: { games: [], stats: { totalGames: 0, wins: 0, winRate: 0 } } }));
  await open(page);
  await tab(page, '我的');
  await page.getByText('管理中心', { exact: true }).click();
  await page.getByRole('button', { name: /玩家名单/ }).click();
  const list = page.locator('[data-admin-section="users"]');
  await expect(list).toBeVisible();
  expect(await list.boundingBox()).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  await page.screenshot({ path: info.outputPath('admin-players.png') });
  await list.getByText('玩家24', { exact: true }).click();
  await page.getByText('历史战绩', { exact: true }).click();
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toHaveCount(0);
  await expect(list).toBeVisible();
  await expect(page.locator('.exit-toast')).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('button', { name: /玩家名单/ })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  await expect(page.locator('.lobby-tab-bar')).toBeVisible();
});

test('rapid AI edits survive delayed replies and keep the configured later AI', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await expect(page.locator('[data-ai-slot="3"]')).toHaveAttribute('data-configured', 'true');
  await page.evaluate(async () => {
    const { socketService: service } = await import('/src/' + 'socketService.ts');
    const socket = service.socket;
    const original = socket.onevent.bind(socket);
    // Delay the transport without reordering room and game events. Socket.IO
    // guarantees ordering; delaying only room_state would invent stale packets.
    socket.onevent = (packet: any) => { setTimeout(() => original(packet), 180); };
    // Three distinct clicks before React has committed a render.
    for (const index of [1, 2, 3]) (document.querySelector(`[data-ai-slot="${index}"] button`) as HTMLButtonElement).click();
  });
  for (const index of [1, 2, 3]) await expect(page.locator(`[data-ai-slot="${index}"]`)).toHaveAttribute('data-configured', 'false');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    for (let i = 0; i < 31; i++) (document.querySelector('[data-ai-slot="3"] button') as HTMLButtonElement).click();
    (window as any).aiRegressions = [];
    const row = document.querySelector('[data-ai-slot="3"]')!;
    new MutationObserver(() => { if (row.getAttribute('data-configured') === 'false') (window as any).aiRegressions.push(false); }).observe(row, { attributes: true, attributeFilter: ['data-configured'] });
  });
  await expect(page.locator('[data-ai-slot="3"]')).toHaveAttribute('data-configured', 'true');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => (window as any).aiRegressions)).toEqual([]);
  await expect(page.locator('[data-ai-slot="3"]')).toHaveAttribute('data-configured', 'true');
  await expect(page.locator('[data-ai-slot="2"]')).toHaveAttribute('data-configured', 'false');
  await page.getByRole('combobox').selectOption('2');
  await page.waitForTimeout(450);
  await expect(page.locator('[data-ai-slot="3"]')).toHaveAttribute('data-configured', 'true');
  await expect(page.locator('[data-ai-slot="1"]')).toHaveAttribute('data-configured', 'false');
  await page.evaluate(async () => {
    const { socketService: service } = await import('/src/' + 'socketService.ts');
    service.updateSettings(service.authoritativeRoom.roomId, { customMapName: 'Custom fixture', customMapId: 'fixture', customBoard: [{ q: 0, r: 0, type: 'forest' }] });
  });
  await expect.poll(() => page.evaluate(async () => (await import('/src/' + 'socketService.ts')).socketService.authoritativeRoom.settings.customMapId)).toBe('fixture');
  await page.getByRole('button', { name: /标准大陆/ }).click();
  await expect.poll(() => page.evaluate(async () => {
    const settings = (await import('/src/' + 'socketService.ts')).socketService.authoritativeRoom.settings;
    return { mapType: settings.mapType, custom: !!(settings.customBoard || settings.customMapName || settings.customMapId) };
  })).toEqual({ mapType: 'standard', custom: false });
  await page.getByRole('button', { name: /地图收藏册/ }).click();
  const albumBack = page.getByTitle('返回房间', { exact: true });
  await expect(albumBack).toBeVisible();
  expect((await albumBack.boundingBox())!.x).toBeGreaterThan(page.viewportSize()!.width * 0.75);
  await albumBack.click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toContainText('正在驶入海域');
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 10000 });
  await page.getByTitle('离开房间', { exact: true }).click();
  await page.getByRole('button', { name: '中途离开', exact: true }).click();
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toContainText('重新驶入海域');
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 10000 });
  expect(await page.evaluate(async () => {
    const { socketService } = await import('/src/' + 'socketService.ts');
    return new Promise(resolve => socketService.getMyActiveRoom('体验玩家', (room: any) => resolve(room.gameState.players.map((p: any) => ({ name: p.name, bot: p.isBot })))));
  })).toEqual([{ name: '体验玩家', bot: false }, { name: '领主 AI 4', bot: true }]);
});

test('boat follows the wave and plays again with rejoin wording', async ({ page }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-startup]')).toHaveAttribute('data-startup', 'sailing');
  const sample = () => page.locator('[data-sailing-boat]').evaluate(el => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform);
    return { x: matrix.m41, y: matrix.m42, angle: matrix.m12 };
  });
  const first = await sample();
  await page.waitForTimeout(420);
  const second = await sample();
  expect(second.x).toBeGreaterThan(first.x);
  expect(Math.abs(second.y - first.y)).toBeGreaterThan(0.1);
  expect(Math.abs(second.angle - first.angle)).toBeGreaterThan(0.0001);
  await page.waitForTimeout(650);
  await page.screenshot({ path: info.outputPath('sailing-wave.png') });
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toContainText('正在驶入海域');
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 10000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-game-sailing]')).toContainText('重新驶入海域', { timeout: 30000 });
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.waitForTimeout(800);
  const zoom = await page.evaluate(() => {
    const stage = (window as any).Konva.stages.find((item: any) => item.container().closest('[data-portrait-rotated]'));
    const target = stage.content;
    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    const fire = (type: string, distance: number) => {
      const touches = distance ? [-distance, distance].map((dx, index) => ({ identifier: index + 1, target, clientX: x + dx, clientY: y })) : [];
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: touches } });
      target.dispatchEvent(event);
    };
    const before = stage.scaleX();
    fire('touchstart', 35); fire('touchmove', 40); fire('touchmove', 70); fire('touchend', 0);
    return { before, after: stage.scaleX(), browserScale: window.visualViewport?.scale };
  });
  expect(zoom.after).toBeGreaterThan(zoom.before);
  expect(zoom.browserScale).toBe(1);
});

test('rules use real development images and browser zoom prevention keeps clicks', async ({ page }) => {
  await open(page);
  await tab(page, '规则');
  await page.getByRole('button', { name: '发展卡详情', exact: true }).click();
  const images = page.locator('h4 img');
  await expect(images).toHaveCount(5);
  await expect.poll(() => images.evaluateAll(items => items.every((item: HTMLImageElement) => item.complete && item.naturalWidth > 0 && item.src.startsWith('blob:')))).toBe(true);
  const zoom = await page.evaluate(() => {
    const target = document.createElement('button');
    document.body.appendChild(target);
    let clicks = 0;
    target.onclick = () => clicks++;
    target.click(); target.click();
    const double = new MouseEvent('dblclick', { bubbles: true, cancelable: true });
    target.dispatchEvent(double);
    const gesture = new Event('gesturestart', { bubbles: true, cancelable: true });
    target.dispatchEvent(gesture);
    target.remove();
    return { clicks, double: double.defaultPrevented, gesture: gesture.defaultPrevented, touchAction: getComputedStyle(document.documentElement).touchAction };
  });
  expect(zoom).toEqual({ clicks: 2, double: true, gesture: true, touchAction: 'pan-x pan-y' });
});

test('server merges settings patches and demotes excess humans without removing the host', async ({}, info) => {
  test.skip(info.project.name !== 'desktop', 'Shared Socket.IO server');
  const sockets = Array.from({ length: 3 }, () => io('http://127.0.0.1:5174', { transports: ['websocket'], forceNew: true }));
  const roomId = 'v3-seat-test';
  const stateAfter = (socket: any, action: () => void, condition: (state: any) => boolean) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('room_state', listener); reject(new Error('room state timeout')); }, 5000);
    const listener = (state: any) => { if (condition(state)) { clearTimeout(timer); socket.off('room_state', listener); resolve(state); } };
    socket.on('room_state', listener); action();
  });
  try {
    await Promise.all(sockets.map(socket => new Promise<void>(resolve => socket.on('connect', () => resolve()))));
    await stateAfter(sockets[0], () => sockets[0].emit('join_room', roomId, 'h', 'Host', false), state => state.players.length === 1);
    await stateAfter(sockets[0], () => sockets[0].emit('update_settings', roomId, 'h', { playerCount: 6, botConfig: [] }), state => state.settings.playerCount === 6);
    await stateAfter(sockets[0], () => sockets[1].emit('join_room', roomId, 'b', 'B', false), state => state.players.length === 2);
    await stateAfter(sockets[0], () => sockets[2].emit('join_room', roomId, 'c', 'C', false), state => state.players.length === 3);
    const state = await stateAfter(sockets[0], () => {
      sockets[0].emit('update_settings', roomId, 'h', { customMapName: 'keep-map-name' });
      sockets[0].emit('update_settings', roomId, 'h', { playerCount: 2 });
    }, state => state.settings.playerCount === 2);
    expect(state.settings.customMapName).toBe('keep-map-name');
    expect(state.players.map((p: any) => p.id)).toEqual(['h', 'b']);
    expect(state.spectators.map((p: any) => p.id)).toContain('c');
  } finally { sockets.forEach(socket => socket.disconnect()); }
});

test('admin private cards have separate unread totals and only opened chats are read', async ({ page }) => {
  await page.route('**/api/me', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { user: { ...data.user, role: 'admin' } } });
  });
  await page.route('**/api/messages', route => route.fulfill({ json: {
    allPlayers: ['玩家甲', '玩家乙'],
    messages: Array.from({ length: 5 }, (_, i) => ({ id: `private-${i}`, type: 'private', senderId: i < 3 ? 'a' : 'b', senderName: i < 3 ? '玩家甲' : '玩家乙', targetUserId: '111111111111111111111111', targetUserName: '体验玩家', content: `消息 ${i}`, createdAt: Date.now() - i * 1000 })),
  } }));
  await open(page);
  await tab(page, '我的');
  await page.getByText('私信', { exact: true }).click();
  await expect(page.locator('[data-unread-count="3"]')).toBeVisible();
  await expect(page.locator('[data-unread-count="2"]')).toBeVisible();
  await page.getByText('玩家甲', { exact: true }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('[data-unread-count="3"]')).toHaveCount(0);
  await expect(page.locator('[data-unread-count="2"]')).toBeVisible();
});
