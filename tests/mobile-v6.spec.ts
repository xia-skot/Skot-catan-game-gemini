import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });
async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
}
async function start(page: Page) {
  await open(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('canvas').first()).toBeVisible();
}

test('join stays on original button and locks duplicate clicks until populated matching arrives', async ({ page }, info) => {
  await open(page);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const original = service.socket.onevent.bind(service.socket);
    service.socket.onevent = (packet: any) => packet.data?.[0] === 'room_state'
      ? setTimeout(() => original(packet), 1100) : original(packet);
    (window as any).joinRequests = 0;
    service.socket.onAnyOutgoing((event: string) => { if (event === 'join_room') (window as any).joinRequests++; });
  });
  const button = page.getByRole('button', { name: '进入海域', exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(button).toHaveText('进入海域');
  await page.evaluate(() => { for (let i = 0; i < 5; i++) (document.querySelector('#join-room-button') as HTMLButtonElement).click(); });
  await expect(page.getByText('正在连接海域', { exact: false })).toHaveCount(0);
  await expect(page.getByText('在线匹配', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('join-locked.png') });
  await expect(page.locator('[data-ai-slot]')).toHaveCount(3);
  expect(await page.evaluate(() => (window as any).joinRequests)).toBe(1);
});

test('rejoin reveals the prepared board at the first boat animation boundary', async ({ page }) => {
  await start(page);
  await page.getByTitle('离开房间', { exact: true }).click();
  await page.getByRole('button', { name: '中途离开', exact: true }).click();
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const original = service.socket.onevent.bind(service.socket);
    service.socket.onevent = (packet: any) => setTimeout(() => original(packet), 600);
    (window as any).sailStart = 0;
    (window as any).sailEnd = 0;
    document.addEventListener('animationstart', event => {
      if ((event as AnimationEvent).animationName === 'sailBoatAnim') (window as any).sailStart = performance.now();
    });
    const observer = new MutationObserver(() => {
      if ((window as any).sailStart && !document.querySelector('[data-game-sailing]')) {
        (window as any).sailEnd = performance.now(); observer.disconnect();
      }
    });
    observer.observe(document.body, { subtree: true, childList: true });
  });
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toContainText('重新驶入海域');
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 10000 });
  const elapsed = await page.evaluate(() => (window as any).sailEnd - (window as any).sailStart);
  expect(elapsed).toBeGreaterThan(2300);
  expect(elapsed).toBeLessThan(2950);
  await expect(page.locator('canvas').first()).toBeVisible();
});

test('robber pulses redraw markers without repainting terrain and sidebar remains scrollable', async ({ page }, info) => {
  await start(page);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
    const state = structuredClone(room.gameState);
    state.phase = 'robber'; state.currentPlayerIndex = 0; state.hasRolled = true;
    state.players[0].isBot = false;
    state.players[0].devCards = Array(12).fill('knight');
    service.socket.onevent({ data: ['game_state_updated', state] });
  });
  await page.waitForTimeout(500);
  const result = await page.evaluate(async () => {
    const Konva = (await import('/node_modules/.vite/deps/' + 'konva.js')).default;
    const stage = Konva.stages.find((s: any) => s.findOne('.board-terrain'));
    const terrain = stage.findOne('.board-terrain');
    const markers = stage.findOne('.board-markers');
    let staticDraws = 0, markerDraws = 0;
    terrain.on('draw.v6', () => staticDraws++);
    markers.on('draw.v6', () => markerDraws++);
    await new Promise(resolve => setTimeout(resolve, 600));
    terrain.off('draw.v6'); markers.off('draw.v6');
    const sidebar = document.querySelector('[data-game-resource-scroll]') as HTMLElement;
    const needsScroll = sidebar.scrollHeight > sidebar.clientHeight;
    const before = sidebar.scrollTop;
    if (sidebar.dataset.rotatedScroll) {
      for (const [type, x] of [['touchstart', 20], ['touchmove', 120], ['touchend', 120]] as const) {
        const event = new Event(type, { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: 80 }] });
        sidebar.dispatchEvent(event);
      }
    } else sidebar.scrollTop += 100;
    return { staticDraws, markerDraws, scrollable: !needsScroll || sidebar.scrollTop > before };
  });
  expect(result.staticDraws).toBeLessThan(5);
  expect(result.markerDraws).toBeGreaterThan(result.staticDraws);
  expect(result.scrollable).toBe(true);
  await page.screenshot({ path: info.outputPath('robber-sidebar.png') });
});

test('game lobby uses a full-width header matching profile and rules', async ({ page }, info) => {
  await open(page);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '大厅', exact: true }).click();
  const header = page.locator('[data-room-list-header]');
  await expect(header).toBeVisible();
  await expect.poll(async () => Math.round((await header.boundingBox())!.x)).toBe(0);
  await expect(header).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  const heading = header.getByRole('heading', { name: '游戏大厅' });
  await expect(heading).toHaveCSS('font-style', 'normal');
  const box = await header.boundingBox();
  expect(box!.width).toBeGreaterThan(page.viewportSize()!.width - 4);
  await page.screenshot({ path: info.outputPath('lobby-header.png') });
});

test('cancelling a pending join releases its request lock for a retry', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The request deduplication contract is browser independent');
  await open(page);
  const count = await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    let joins = 0;
    service.socket.onAnyOutgoing((event: string) => { if (event === 'join_room') joins++; });
    service.joinRoom('cancel-retry', '体验玩家');
    service.joinRoom('cancel-retry', '体验玩家');
    service.leaveRoom('cancel-retry');
    service.joinRoom('cancel-retry', '体验玩家');
    return joins;
  });
  expect(count).toBe(2);
});
