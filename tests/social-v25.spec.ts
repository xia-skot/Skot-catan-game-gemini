import { test, expect, type Page } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

async function open(page: Page, admin = false) {
  await page.goto(admin ? '/?demoRole=admin' : '/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
}
async function settings(page: Page, patch: any) {
  await page.evaluate(async patch => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    service.updateSettings(service.authoritativeRoom.roomId, patch);
  }, patch);
}
test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

test('online admin list, real ten-second invitation and joining the matching room', async ({ browser, page, baseURL }, info) => {
  const context = await browser.newContext({ baseURL }), host = await context.newPage();
  try {
    await open(host, true); await open(page);
    await host.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
    await host.getByRole('heading', { name: '管理中心', exact: true }).click();
    await host.getByRole('heading', { name: '在线玩家', exact: true }).click();
    const online = host.locator('[data-admin-section="online"]');
    await expect(online.getByText('体验玩家', { exact: true })).toBeVisible();
    await expect(online.getByText('演示管理员', { exact: true })).toBeVisible();
    await host.screenshot({ path: info.outputPath('online-players.png') });
    await host.goto('/?demoRole=admin');
    await expect(host.locator('[data-lobby-tabs]')).toBeVisible();
    await host.getByRole('button', { name: '进入海域', exact: true }).click();
    await settings(host, { playerCount: 2, botConfig: [false, false] });
    await expect(host.getByRole('button', { name: '邀请在线玩家', exact: true })).toBeEnabled();
    await host.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      const original = service.socialRequest.bind(service);
      service.socialRequest = async (...args: any[]) => {
        if (args[0] === 'invite_online') await new Promise(resolve => setTimeout(resolve, 800));
        return original(...args);
      };
    });
    await host.getByRole('button', { name: '邀请在线玩家', exact: true }).click();
    const sending = host.getByRole('button', { name: '正在邀请中…', exact: true });
    await expect(sending).toBeDisabled();
    await expect(sending).toHaveAttribute('aria-busy', 'true');
    await expect(sending.locator('.animate-spin')).toBeVisible();
    await host.screenshot({ path: info.outputPath('inviting.png') });
    const banner = page.getByRole('dialog', { name: '房间邀请', exact: true });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('演示管理员');
    await page.screenshot({ path: info.outputPath('invitation.png') });
    const box = await banner.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await banner.getByRole('button', { name: '加入', exact: true }).click();
    await expect(page.getByRole('button', { name: '准备游戏', exact: true })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await expect(host.getByRole('button', { name: /本轮已邀请/ })).toBeDisabled();
  } finally { await context.close(); }
});

test('spectator privacy, illustrated gifts/emotes and exit above a rules modal', async ({ browser, page, baseURL }, info) => {
  const context = await browser.newContext({ baseURL }), host = await context.newPage();
  const errors: string[] = []; page.on('pageerror', e => {
    // Concurrent local Vite servers can lose HMR; keep game errors actionable.
    if (e.message === 'WebSocket closed without opened.' && e.stack?.includes('/@vite/client')) return;
    errors.push(e.message);
  });
  try {
    await open(host, true); await host.getByRole('button', { name: '进入海域', exact: true }).click();
    const checkbox = host.getByLabel('允许观众看到所有玩家手牌');
    await expect(checkbox).not.toBeChecked(); await checkbox.check(); await expect(checkbox).toBeChecked(); await checkbox.uncheck();
    await host.getByRole('button', { name: '就绪', exact: true }).click(); await host.getByRole('button', { name: '开启游戏', exact: true }).click();
    await expect(host.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 20000 });
    await open(page); await page.locator('.lobby-tab-bar').getByRole('button', { name: '大厅', exact: true }).click();
    await page.getByRole('button', { name: '观战', exact: true }).click();
    await expect(page.locator('[data-game-sailing]')).toBeVisible();
    await expect(page.getByRole('button', { name: '离开观战房间', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 20000 });
    const exit = page.getByRole('button', { name: '离开观战房间', exact: true });
    await expect(exit).toBeVisible();
    await expect(exit).toHaveCount(1);
    await page.addInitScript(() => {
      (window as any).exitDuringStartup = false;
      const observe = () => {
        if (document.querySelector('[data-startup]') && document.querySelector('[aria-label="离开观战房间"]')) (window as any).exitDuringStartup = true;
        requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    const watchedRoom = await host.evaluate(async () => (await import('/src/' + 'socketService.ts')).socketService.authoritativeRoom.roomId);
    await page.goto('/');
    await page.evaluate(async roomId => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      await new Promise(resolve => setTimeout(resolve, 500));
      service.joinRoom(roomId, '体验玩家', true);
    }, watchedRoom);
    await expect(page.locator('[data-startup]')).toHaveCount(0, { timeout: 30000 });
    await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 30000 });
    await expect(exit).toBeVisible();
    expect(await page.evaluate(() => (window as any).exitDuringStartup)).toBe(false);
    await expect(page.getByRole('button', { name: '立即退出观战', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '我的观战表情', exact: true })).toHaveCount(0);
    const assertExitOnTop = async () => {
      await expect.poll(async () => exit.evaluate(el => {
        const a = document.querySelector('[data-spectator-exit-anchor]')!.getBoundingClientRect();
        const b = el.getBoundingClientRect();
        return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 &&
          el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
      })).toBe(true);
    };
    await assertExitOnTop();
    const state = await page.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      return service.authoritativeRoom.gameState;
    });
    expect(state.handsHidden).toBe(true); expect(state.bankDevCards).toEqual([]);
    await page.locator('[data-social-avatar="555555555555555555555555"]').click();
    const menu = page.getByRole('dialog', { name: '头像互动' });
    await expect(menu.getByRole('button', { name: '鲜花', exact: true })).toBeVisible();
    await assertExitOnTop();
    const viewport = page.viewportSize()!;
    await expect(page.locator('[data-social-rotated]')).toHaveAttribute('data-social-rotated', String(viewport.height > viewport.width));
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.height > viewport.width) expect(bounds!.height).toBeGreaterThan(bounds!.width);
    await page.screenshot({ path: info.outputPath('gift-menu.png') });
    await menu.getByRole('button', { name: '鲜花', exact: true }).click();
    await expect(page.locator('[data-reaction-kind="flower"]')).toBeVisible();
    const arc = await page.locator('[data-reaction-kind="flower"]').evaluate(el => {
      const frames = (el.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
      const start = new DOMMatrix(String(frames[0].transform));
      const middle = new DOMMatrix(String(frames[1].transform));
      return middle.m42 - start.m42 / 2;
    });
    expect(arc).toBeCloseTo(55);
    await expect(host.locator('[data-reaction-kind="flower"]')).toBeVisible();
    await page.waitForTimeout(950); await page.screenshot({ path: info.outputPath('flower-arrival.png') });
    await page.waitForTimeout(950);
    for (const [label, kind] of [['咖啡', 'coffee'], ['鸡蛋', 'egg'], ['平底锅', 'pan']]) {
      await page.locator('[data-social-avatar="555555555555555555555555"]').click();
      await menu.getByRole('button', { name: label, exact: true }).click();
      await expect(page.locator(`[data-reaction-kind="${kind}"]`)).toBeVisible();
      await page.waitForTimeout(950);
      await expect(page.locator(`[data-reaction-kind="${kind}"]`)).toHaveClass(/has-landed/);
      await page.screenshot({ path: info.outputPath(`${kind}-arrival.png`) });
      await page.waitForTimeout(950);
    }
    await host.locator('[data-social-avatar="555555555555555555555555"]').click();
    const hostMenu = host.getByRole('dialog', { name: '头像互动' });
    await expect(hostMenu.locator('img.captain-emote')).toHaveCount(8);
    await expect.poll(() => hostMenu.locator('img.captain-emote').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await hostMenu.getByRole('button', { name: '捂嘴笑', exact: true }).click();
    await expect(page.locator('[data-reaction-kind="giggle"]')).toBeVisible();
    expect(await page.locator('[data-reaction-kind="giggle"]').evaluate(el => getComputedStyle(el).width)).toBe('48px');
    await page.getByTitle('游戏规则', { exact: true }).click();
    await assertExitOnTop();
    await page.screenshot({ path: info.outputPath('spectator-original-orientation-exit.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('[data-social-rotated]')).toHaveAttribute('data-social-rotated', 'false');
    await expect(menu).toHaveCount(0);
    await assertExitOnTop();
    await page.evaluate(async () => { (await import('/src/' + 'navigation.ts')).requestAppBack(); });
    await page.getByTitle('声音设置', { exact: true }).click();
    await assertExitOnTop();
    await page.screenshot({ path: info.outputPath('spectator-modal-exit.png') });
    await exit.click();
    await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
    await expect(page.locator('[data-game-sailing]')).toHaveCount(0);
    await expect(page.locator('[data-social-menu]')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('invitations disappear after ten seconds or manual refusal', async ({ browser, page, baseURL }) => {
  const context = await browser.newContext({ baseURL }), host = await context.newPage();
  try {
    await open(host, true); await open(page);
    await host.getByRole('button', { name: '进入海域', exact: true }).click();
    await settings(host, { playerCount: 2, botConfig: [false, false] });
    await host.getByRole('button', { name: '邀请在线玩家', exact: true }).click();
    const banner = page.getByRole('dialog', { name: '房间邀请' });
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCount(0, { timeout: 12000 });
    await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
    // Replay a fresh UI event to check dismiss controls without bypassing production cooldowns.
    await page.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      service.socket.onevent({ data: ['room_invitation', { id: 'dismiss-fixture', roomId: '123456', recipientId: service.playerId, hostName: '测试邀请', origin: location.origin, expiresAt: Date.now() + 10000 }] });
    });
    await expect(banner).toBeVisible(); await banner.getByRole('button', { name: '拒绝', exact: true }).click();
    await expect(banner.getByRole('button', { name: '加入', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});

test('guest profile can rename without password fields or ID changes', async ({ page }, info) => {
  const guest = { id: '111111111111111111111111', username: '稳定游客', isGuest: true, role: 'guest' };
  await page.route('**/api/me', route => route.fulfill({ json: { user: guest } }));
  let received: any;
  await page.route('**/api/user/profile', async route => {
    received = route.request().postDataJSON();
    const token = await page.evaluate(() => localStorage.getItem('catan_auth_token'));
    await route.fulfill({ json: { user: { ...guest, username: received.username }, token } });
  });
  await open(page);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '修改资料', exact: true }).click();
  await expect(page.getByText(`游客 ID：${guest.id}`, { exact: true })).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByPlaceholder('修改昵称').fill('改名后还是我');
  await page.screenshot({ path: info.outputPath('guest-profile.png') });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.locator('[data-page-header]').filter({ hasText: '改名后还是我' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('catan_player_id'))).toBe(guest.id);
  expect(received).toEqual({ username: '改名后还是我', oldPassword: '', password: '' });
});

test('server redacts spectator snapshots, enforces host hand permission and denies outsiders', async ({ request, baseURL }, info) => {
  test.skip(info.project.name !== 'desktop');
  const sockets: Socket[] = [];
  async function client() { const s = io(baseURL!, { transports: ['websocket'], forceNew: true }); sockets.push(s); await new Promise<void>(resolve => s.once('connect', resolve)); return s; }
  const event = (s: Socket, name: string) => new Promise<any>(resolve => s.once(name, resolve));
  try {
    const host = await client(), spec = await client(), outsider = await client();
    let ready = event(host, 'room_state'); host.emit('join_room', 'privacy', 'host', 'Host'); await ready;
    ready = event(spec, 'room_state'); spec.emit('join_room', 'privacy', 'spec', 'Observer', true); await ready;
    spec.emit('update_settings', 'privacy', 'host', { spectatorHands: true });
    const initial = { players: [{ id: 0, sessionId: 'host', name: 'Host', isBot: false, resources: { ore: 7 }, devCards: ['monopoly'], playedDevCards: [] }, ...[1,2,3].map(id => ({ id, name: `AI ${id}`, isBot: true, resources: {}, devCards: [], playedDevCards: [] }))], bankDevCards: ['knight'], phase: 'setup', winnerId: null, turn: 1 };
    ready = event(spec, 'game_init'); host.emit('start_game', 'privacy', initial);
    const hidden = await ready; expect(hidden.handsHidden).toBe(true); expect(hidden.players[0].resources.ore).toBe(0);
    ready = event(spec, 'game_state_updated'); spec.emit('request_sync', 'privacy'); expect((await ready).players[0].devCards).toEqual([]);
    const rooms = await outsider.timeout(2000).emitWithAck('get_active_rooms', false); expect(rooms.find((r: any) => r.roomId === 'privacy').gameState).toBeUndefined();
    let leaked = false; outsider.on('game_state_updated', () => leaked = true); outsider.emit('request_sync', 'privacy'); await new Promise(r => setTimeout(r, 100)); expect(leaked).toBe(false);
    ready = event(host, 'game_reset'); host.emit('reset_game', 'privacy', 'host'); await ready;
    ready = event(host, 'room_state'); host.emit('join_room', 'visible', 'host', 'Host'); await ready;
    ready = event(host, 'room_state'); host.emit('update_settings', 'visible', 'host', { spectatorHands: true }); await ready;
    ready = event(spec, 'room_state'); spec.emit('join_room', 'visible', 'spec', 'Observer', true); await ready;
    ready = event(spec, 'game_init'); host.emit('start_game', 'visible', initial);
    const visible = await ready; expect(visible.players[0].resources.ore).toBe(7); expect(visible.players[0].devCards).toEqual(['monopoly']); expect(visible.bankDevCards).toEqual([]);
    const unauth = await request.get('/api/admin/online'); expect(unauth.status()).toBe(401);
    const session = await (await request.get('/api/demo/session')).json();
    expect((await request.get('/api/admin/online', { headers: { Authorization: `Bearer ${session.token}` } })).status()).toBe(403);
  } finally { sockets.forEach(s => s.disconnect()); }
});
