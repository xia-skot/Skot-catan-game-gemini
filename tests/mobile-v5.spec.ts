import { test, expect, type Page } from '@playwright/test';
import { getSetupSlots, applySettingsPatch, getRoomController } from '../shared/roomSetup';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });
async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 25000 });
}
async function start(page: Page) {
  await open(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('canvas').first()).toBeVisible();
}

test('slow application download shows resource loading instead of a stalled sailing caption', async ({ page }, info) => {
  await page.route('**/src/App.tsx', async route => { await new Promise(r => setTimeout(r, 3500)); await route.continue(); });
  await page.goto('/');
  await expect(page.locator('[data-startup="loading"]')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '资源加载' })).toBeVisible();
  await expect(page.locator('[data-sailing-boat]')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('resource-loading-v5.png') });
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 25000 });
});

test('joining waits for a populated room and reduced capacity hides only empty seats', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const original = service.socket.onevent.bind(service.socket);
    service.socket.onevent = (packet: any) => setTimeout(() => original(packet), 500);
  });
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await expect(page.getByRole('button', { name: '进入海域', exact: true })).toBeDisabled();
  await expect(page.locator('[data-room-connecting]')).toHaveCount(0);
  await expect(page.getByText('在线匹配', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-ai-slot="3"]')).toBeVisible();
  await page.locator('[data-ai-slot="1"] button').click();
  await page.locator('[data-ai-slot="2"] button').click();
  await page.getByRole('combobox').selectOption('2');
  await expect(page.locator('[data-ai-slot]')).toHaveCount(1);
  await expect(page.locator('[data-ai-slot="3"]')).toHaveAttribute('data-configured', 'true');
  await page.waitForTimeout(800);
  await expect(page.locator('[data-ai-slot]')).toHaveCount(1);
  const reduced = applySettingsPatch({ hostId: 'h', players: [{ id: 'h', name: 'H' }], settings: { playerCount: 4, mapType: 'standard', botConfig: [false, false, false, true] } }, { playerCount: 2 });
  expect(getSetupSlots(reduced).map(s => s.index)).toEqual([0, 3]);
});

test('rejoin immediately sails and does not mount a matching screen', async ({ page }) => {
  await start(page);
  await page.getByTitle('离开房间', { exact: true }).click();
  await page.getByRole('button', { name: '中途离开', exact: true }).click();
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const original = service.socket.onevent.bind(service.socket);
    service.socket.onevent = (packet: any) => setTimeout(() => original(packet), 500);
    (window as any).matchingFrames = 0;
    new MutationObserver(() => {
      if (document.body.textContent?.includes('在线匹配')) (window as any).matchingFrames++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toContainText('重新驶入海域');
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
  expect(await page.evaluate(() => (window as any).matchingFrames)).toBe(0);
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('rapid private back sequence stays inside the app without a click between backs', async ({ page }) => {
  await page.route('**/exit-fixture', route => route.fulfill({ contentType: 'text/html', body: 'Previous' }));
  await page.goto('/exit-fixture'); await open(page);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  for (let i = 0; i < 5; i++) {
    await page.getByText('私信', { exact: true }).click();
    await page.getByText('肖隐弦', { exact: true }).click();
    await page.evaluate(() => { history.back(); setTimeout(() => history.back(), 80); });
    await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
    await expect(page.locator('.chat-screen')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
    await page.evaluate(() => history.back());
    await expect(page.locator('.exit-toast')).toBeVisible();
    await page.waitForTimeout(1300);
    await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
  }
});

test('resource chooser leaves sidebar scrollable and multi-touch cancels native zoom', async ({ page }, info) => {
  await start(page);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
    const state = structuredClone(room.gameState);
    state.phase = 'monopoly'; state.playingDevCard = 'monopoly'; state.currentPlayerIndex = 0;
    state.players[0].devCards = ['knight', 'monopoly', 'yearOfPlenty', 'roadBuilding', 'victoryPoint'];
    service.socket.onevent({ data: ['game_state_updated', state] });
  });
  const overlay = page.locator('[data-resource-choice-overlay]');
  await expect(overlay).toBeVisible();
  await expect(overlay).toHaveCSS('pointer-events', 'none');
  const result = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-rotated-scroll]') as HTMLElement;
    const pinch = new Event('touchmove', { bubbles: true, cancelable: true });
    Object.defineProperty(pinch, 'touches', { value: [{}, {}] });
    document.body.dispatchEvent(pinch);
    if (!sidebar) return { pinch: pinch.defaultPrevented, scroll: true };
    const rect = sidebar.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    const fire = (type: string, x: number, touches: boolean) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches ? [{ clientX: x, clientY: rect.y + 30 }] : [] }, changedTouches: { value: [] } });
      sidebar.dispatchEvent(event);
    };
    sidebar.scrollTop = 0;
    fire('touchstart', rect.x + 8, true); fire('touchmove', rect.x + 68, true); fire('touchend', rect.x + 68, false);
    return { pinch: pinch.defaultPrevented, scroll: sidebar.scrollTop > 0 && !!hit && sidebar.contains(hit) };
  });
  expect(result).toEqual({ pinch: true, scroll: true });
  await page.screenshot({ path: info.outputPath('monopoly-sidebar-v5.png') });
});

for (const departure of ['disconnect', 'leave'] as const) {
test(`remaining human takes over an entrusted host after ${departure}`, async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'Two independent clients exercise the shared handoff');
  test.setTimeout(90000);
  await open(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.locator('[data-ai-slot="1"] button').click();
  const roomId = await page.evaluate(() => localStorage.getItem('catan_active_room')!);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const peer = await context.newPage();
  const user = { id: '555555555555555555555555', username: '第二位玩家', role: 'user', email: 'peer@example.test' };
  await peer.route('**/api/demo/session', async route => {
    const response = await route.fetch(); const data = await response.json();
    await route.fulfill({ json: { ...data, user } });
  });
  await peer.route('**/api/me', route => route.fulfill({ json: { user } }));
  try {
    await peer.goto(`http://127.0.0.1:5174/?room=${roomId}`);
    await expect(peer.getByRole('button', { name: '准备游戏', exact: true })).toBeVisible({ timeout: 20000 });
    await peer.getByRole('button', { name: '准备游戏', exact: true }).click();
    await page.getByRole('button', { name: '就绪', exact: true }).click();
    await page.getByRole('button', { name: '开启游戏', exact: true }).click();
    await expect(peer.locator('[data-game-sailing]')).toBeVisible();
    await expect(peer.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
    await expect(peer.locator('canvas').first()).toBeVisible();
    await page.evaluate(async departure => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
      const state = structuredClone(room.gameState);
      state.phase = 'main'; state.currentPlayerIndex = 0; state.hasRolled = true;
      state.dice = [3, 3]; state.diceRollPending = true; state.players[0].isBot = true;
      service.sendGameState(room.roomId, state);
      service.socket.onevent({ data: ['game_state_updated', state] });
      if (departure === 'disconnect') service.socket.disconnect();
    }, departure);
    if (departure === 'leave') {
      await page.getByTitle('离开房间', { exact: true }).click();
      await page.getByRole('button', { name: '中途离开', exact: true }).click();
      await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
    }
    await expect.poll(() => peer.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      const room: any = await new Promise(resolve => service.getMyActiveRoom('第二位玩家', resolve));
      return { host: room.hostId, active: room.gameState.currentPlayerIndex, pending: room.gameState.diceRollPending, entrusted: room.gameState.players[0].isBot };
    }), { timeout: 25000 }).toEqual({ host: user.id, active: 1, pending: false, entrusted: true });
  } finally { await context.close(); }
});
}

test('reload during the exit window restores the existing guard', async ({ page }) => {
  await open(page);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.evaluate(() => history.back());
  await expect.poll(() => page.evaluate(() => !!history.state?.catanBase)).toBe(true);
  await page.reload();
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
  await page.evaluate(() => history.back());
  await expect(page.locator('.exit-toast')).toBeVisible();
});

test('heartbeat bounds silent disconnect detection without granting spectators host rights', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'Server and shared policy check');
  const response = await request.get('/socket.io/?EIO=4&transport=polling');
  const handshake = JSON.parse((await response.text()).slice(1));
  expect(handshake.pingInterval + handshake.pingTimeout).toBe(20000);
  const room = { hostId: 'h', players: [{ id: 'h', name: 'H', socketId: 'old', disconnected: true }], spectators: [{ id: 's', name: 'S', socketId: 'live' }], settings: { playerCount: 2, mapType: 'standard', botConfig: [] } };
  expect(getRoomController(room, false)).toBe(null);
  expect(getRoomController(room)).toBe('s');
});
