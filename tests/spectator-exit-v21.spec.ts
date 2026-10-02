import { test, expect, type Page } from '@playwright/test';

async function spectate(page: Page) {
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '大厅', exact: true }).click();
  await page.getByRole('button', { name: '观战', exact: true }).click();
  await expect(page.getByTitle('退出观战', { exact: true })).toBeVisible();
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
}

test('spectator exit ignores delayed room/game messages, keeps the host game, and allows another visit', async ({ browser, page, request, baseURL }, info) => {
  await request.post('/api/demo/reset');
  const hostContext = await browser.newContext({ baseURL });
  const host = await hostContext.newPage();
  try {
    await host.goto('/?demoRole=admin');
    await expect(host.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
    await host.getByRole('button', { name: '进入海域', exact: true }).click();
    await host.getByRole('button', { name: '就绪', exact: true }).click();
    await host.getByRole('button', { name: '开启游戏', exact: true }).click();
    await expect(host.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
    await page.goto('/');
    await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
    await spectate(page);
    await page.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      const room = structuredClone(service.authoritativeRoom);
      (window as any).lateRoom = room;
      (window as any).deliverLate = () => {
        service.socket.onevent({ data: ['room_state', room] });
        service.socket.onevent({ data: ['game_init', room.gameState, { entry: 'resume', roomId: room.roomId }] });
        service.socket.onevent({ data: ['game_state_updated', room.gameState, { roomId: room.roomId }] });
      };
    });
    await page.getByTitle('退出观战', { exact: true }).click();
    await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
    await page.evaluate(() => (window as any).deliverLate());
    // Multiple animation periods previously left this page looping forever.
    await page.waitForTimeout(5500);
    await expect(page.locator('[data-game-sailing]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '进入海域', exact: true })).toBeEnabled();
    expect(await page.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      return { intent: service.hasRoomIntent(), active: localStorage.getItem('catan_game_active'), spectator: localStorage.getItem('catan_is_spectator') };
    })).toEqual({ intent: false, active: null, spectator: null });
    await page.screenshot({ path: info.outputPath('spectator-exited.png'), fullPage: true });
    const room = await host.evaluate(async () => {
      const service = (await import('/src/' + 'socketService.ts')).socketService;
      return await new Promise<any>(resolve => service.getMyActiveRoom('演示管理员', resolve));
    });
    expect(room.gameState).toBeTruthy();
    expect(room.spectators).toHaveLength(0);
    await spectate(page);
    await page.getByTitle('退出观战', { exact: true }).click();
    await page.getByRole('button', { name: '进入海域', exact: true }).click();
    await expect(page.getByRole('button', { name: '就绪', exact: true })).toBeVisible();
    await page.evaluate(() => (window as any).deliverLate());
    await expect(page.locator('[data-game-sailing]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '就绪', exact: true })).toBeVisible();
  } finally { await hostContext.close(); }
});

test('leaving while offline cancels queued joins before the connection returns', async ({ page, request }) => {
  await request.post('/api/demo/reset');
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  const outgoing = await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const socket = service.socket;
    await new Promise<void>(resolve => socket.connected ? resolve() : socket.once('connect', resolve));
    socket.disconnect();
    const connect = socket.connect.bind(socket);
    socket.connect = () => socket;
    let joins = 0;
    socket.onAnyOutgoing((event: string) => { if (event === 'join_room') joins++; });
    service.joinRoom('cancelled-spectator-join', '体验玩家', true);
    service.leaveRoom('cancelled-spectator-join');
    socket.connect = connect;
    await new Promise<void>(resolve => { socket.once('connect', resolve); socket.connect(); });
    await new Promise(resolve => setTimeout(resolve, 300));
    return { joins, intent: service.hasRoomIntent() };
  });
  expect(outgoing).toEqual({ joins: 0, intent: false });
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '进入海域', exact: true })).toBeEnabled();
});
