import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });
async function open(page: Page, admin = false) {
  await page.goto(admin ? '/?demoRole=admin' : '/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
}
async function join(page: Page) {
  await open(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await expect(page.locator('[data-ai-slot]')).toHaveCount(3);
}
async function start(page: Page) {
  await join(page);
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
}

test('only admin triple logo click can open seed prompt', async ({ page }) => {
  let dialogs = 0;
  page.on('dialog', async dialog => { dialogs++; await dialog.dismiss(); });
  await open(page);
  const triple = () => page.getByAltText('Catan Logo', { exact: true }).evaluate(image => { for (let i = 0; i < 3; i++) image.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await triple();
  await page.waitForTimeout(100);
  expect(dialogs).toBe(0);
  await open(page, true);
  await triple();
  await expect.poll(() => dialogs).toBe(1);
});

test('AI levels survive server settings and compact game seats', async ({ page }, info) => {
  await join(page);
  await page.getByLabel('AI 2 难度').selectOption('beginner');
  await page.getByLabel('AI 3 难度').selectOption('expert');
  await expect(page.getByLabel('AI 2 难度')).toHaveValue('beginner');
  await expect(page.getByLabel('AI 3 难度')).toHaveValue('expert');
  await page.waitForTimeout(900); // Let the existing matching-screen entrance animation finish for the visual check.
  await page.screenshot({ path: info.outputPath('ai-levels.png') });
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  await expect.poll(() => page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
    return room?.gameState?.players.map((p: any) => p.botDifficulty);
  }), { timeout: 10000 }).toEqual(['expert', 'beginner', 'expert', 'standard']);
});

test('notices omit redundant badges and times; history summary stays frozen', async ({ page }, info) => {
  const games = Array.from({ length: 12 }, (_, i) => ({ roomId: `87000${i}`, winnerId: 0, completedAt: '2026-09-29T08:00:00Z', players: [
    { id: 0, name: '体验玩家', score: 14, breakdown: { settlements: 4, cities: 3, islandBonus: 4 } },
    { id: 1, name: '领主 AI 2', score: 8, breakdown: { settlements: 2, cities: 3 } },
  ] }));
  await page.route('**/api/user/games', route => route.fulfill({ json: { games } }));
  await open(page);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('系统消息', { exact: true }).click();
  await expect(page.getByText('系统公告', { exact: true })).toHaveCount(0);
  const notice = page.locator('h4').filter({ hasText: '海域公告' }).first();
  await expect(notice).toHaveCSS('font-weight', '700');
  await page.screenshot({ path: info.outputPath('notices.png') });
  await page.evaluate(() => history.back());
  await page.getByText('历史战绩', { exact: true }).click();
  const summary = page.locator('[data-history-summary]');
  const scroll = page.locator('[data-history-scroll]');
  await expect(scroll.locator('table')).toHaveCount(12);
  const top = (await summary.boundingBox())!.y;
  await scroll.evaluate(el => el.scrollTop = 400);
  expect((await summary.boundingBox())!.y).toBeCloseTo(top, 1);
  await expect(scroll.getByRole('columnheader', { name: '排名', exact: true }).first()).toHaveCSS('white-space', 'nowrap');
  await expect(scroll.getByRole('columnheader', { name: '总分', exact: true }).first()).toHaveCSS('white-space', 'nowrap');
  await expect(scroll.getByRole('columnheader', { name: '积分', exact: true }).first()).toBeAttached();
  await page.screenshot({ path: info.outputPath('history.png') });
});

test('real settlement reducer rejects pirate coast even when caller omits the sea hex', async ({ page }) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const React = (await import('/node_modules/.vite/deps/' + 'react.js')).default;
    const { createRoot } = (await import('/node_modules/.vite/deps/' + 'react-dom_client.js')).default;
    const { useCatanGame, getHexesForVertex } = await import('/src/' + 'useCatanGame.ts');
    let game: any;
    function Harness() { game = useCatanGame(); return null; }
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host); root.render(React.createElement(Harness));
    const flush = () => new Promise(resolve => setTimeout(resolve, 80));
    await flush();
    const s = game.initGame(2, 'archipelago');
    const sea = s.board.find((h: any) => h.type === 'sea' && !h.isOuterSea);
    const candidates = s.board.flatMap((h: any) => Array.from({ length: 6 }, (_, i) => {
      const a = (60 * i + 30) * Math.PI / 180;
      return `${Math.round(Math.sqrt(3) * 40 * (h.q + h.r / 2) + 40 * Math.cos(a))},${Math.round(60 * h.r + 40 * Math.sin(a))}`;
    }));
    const vertex = candidates.find((id: string) => {
      const hs = getHexesForVertex(s.board, id);
      return hs.some((h: any) => h.id === sea.id) && hs.some((h: any) => !['sea', 'desert'].includes(h.type));
    });
    if (!vertex) throw new Error('No coastal fixture');
    s.phase = 'main'; s.hasRolled = true; s.currentPlayerIndex = 0; s.pirateHexId = sea.id;
    s.players[0].resources = { lumber: 3, brick: 3, grain: 3, ore: 3, wool: 3 };
    s.roads = [{ edgeId: [vertex, '999,999'].sort().join('|'), playerId: 0 }];
    game.syncGameState(s); await flush();
    const land = getHexesForVertex(s.board, vertex).filter((h: any) => h.type !== 'sea').map((h: any) => h.id);
    game.buildSettlement(vertex, land); await flush();
    const blocked = game.gameState.settlements.length === 0 && game.gameState.players[0].resources.lumber === 3;
    game.syncGameState({ ...s, pirateHexId: null }); await flush();
    game.buildSettlement(vertex, land); await flush();
    const built = game.gameState.settlements.length === 1;
    root.unmount(); host.remove();
    return { blocked, built };
  });
  expect(result).toEqual({ blocked: true, built: true });
});

test('AI resolves selection cards and setup; settlement report is compact', async ({ page }, info) => {
  await start(page);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
    (window as any).testRoom = room;
    (window as any).states = [];
    service.socket.onAnyOutgoing((event: string, _room: string, state: any) => { if (event === 'update_game_state') (window as any).states.push(structuredClone(state)); });
    const s = structuredClone(room.gameState);
    s.currentPlayerIndex = 1; s.phase = 'year_of_plenty'; s.hasRolled = true;
    s.players[1].isBot = true; s.players[1].botDifficulty = 'expert';
    s.hasPlayedDevCardThisTurn = true; s.playingDevCard = 'yearOfPlenty';
    service.socket.onevent({ data: ['game_state_updated', s] });
  });
  await expect.poll(() => page.evaluate(() => (window as any).states.some((s: any) => s.phase === 'main' && s.currentPlayerIndex === 1)), { timeout: 10000 }).toBe(true);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const s = structuredClone((window as any).testRoom.gameState);
    s.currentPlayerIndex = 1; s.phase = 'monopoly'; s.hasRolled = true;
    s.players[1].isBot = true; s.hasPlayedDevCardThisTurn = true; s.playingDevCard = 'monopoly';
    (window as any).states = [];
    service.socket.onevent({ data: ['game_state_updated', s] });
  });
  await expect.poll(() => page.evaluate(() => (window as any).states.some((s: any) => s.phase === 'main' && s.playingDevCard === null)), { timeout: 10000 }).toBe(true);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const s = structuredClone((window as any).testRoom.gameState);
    s.currentPlayerIndex = 1; s.phase = 'setup'; s.hasRolled = false;
    (window as any).states = [];
    service.socket.onevent({ data: ['game_state_updated', s] });
  });
  await expect.poll(() => page.evaluate(() => (window as any).states.some((s: any) => s.roads.length > 0)), { timeout: 10000 }).toBe(true);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const s = structuredClone((window as any).testRoom.gameState);
    s.phase = 'finished'; s.winnerId = 0;
    service.socket.onevent({ data: ['game_state_updated', s] });
  });
  await expect(page.getByRole('heading', { name: '本局战报' })).toBeVisible();
  await expect(page.locator('[data-game-report]')).toHaveCSS('opacity', '1');
  await expect(page.getByText('卡坦岛盛大闭幕')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('game-report.png') });
});

test('AI trading is bounded and expired offers never hold a turn open', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
    const state = structuredClone(room.gameState);
    state.phase = 'main'; state.hasRolled = true; state.currentPlayerIndex = 1;
    state.players[1].botDifficulty = 'expert'; state.players[1].isBot = true;
    state.players[1].resources = { lumber: 3, brick: 0, wool: 0, grain: 1, ore: 1 };
    state.hasPlayedDevCardThisTurn = true;
    (window as any).tradeStates = [];
    service.socket.onAnyOutgoing((event: string, _room: string, s: any) => {
      if (event === 'update_game_state') (window as any).tradeStates.push(structuredClone(s));
    });
    service.socket.onevent({ data: ['game_state_updated', state] });
  });
  await expect.poll(() => page.evaluate(() => (window as any).tradeStates.some((s: any) => s.currentPlayerIndex !== 1)), { timeout: 18000 }).toBe(true);
  const result = await page.evaluate(() => {
    const states = (window as any).tradeStates;
    const offers = new Map<string, any>();
    for (const state of states) for (const offer of state.tradeOffers || []) if (offer.initiatorId === 1) offers.set(offer.id, offer);
    return { count: offers.size, pending: [...offers.values()].filter(o => o.status === 'pending').length,
      maxBudget: Math.max(...states.map((s: any) => s.botTradesThisTurn || 0)) };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.count).toBeLessThanOrEqual(2);
  expect(result.pending).toBe(0);
  expect(result.maxBudget).toBeLessThanOrEqual(2);
});

test('server trade finalization requires acceptance and cannot execute twice', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Server-side transaction checks are browser-independent');
  await start(page);
  const result = await page.evaluate(async () => {
    const service = (await import('/src/' + 'socketService.ts')).socketService;
    const getRoom = () => new Promise<any>(resolve => service.getMyActiveRoom('体验玩家', resolve));
    const room = await getRoom(), state = structuredClone(room.gameState);
    state.phase = 'main'; state.hasRolled = true; state.currentPlayerIndex = 0;
    state.players[0].isBot = false;
    state.players[0].resources = { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 };
    state.players[1].resources = { lumber: 0, brick: 1, wool: 0, grain: 0, ore: 0 };
    state.tradeOffers = [{ id: 'single-trade', initiatorId: 0, targetPlayerId: 1, offer: { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 }, request: { lumber: 0, brick: 1, wool: 0, grain: 0, ore: 0 }, status: 'pending', acceptedBy: [], rejectedBy: [] }];
    service.sendGameState(room.roomId, state);
    service.sendFinalizeTrade(room.roomId, 'single-trade', 1);
    const before = (await getRoom()).gameState.players[0].resources;
    service.sendReactToTrade(room.roomId, 'single-trade', 1, 'accept');
    service.sendFinalizeTrade(room.roomId, 'single-trade', 1);
    service.sendFinalizeTrade(room.roomId, 'single-trade', 1);
    const after = (await getRoom()).gameState.players[0].resources;
    return { before, after };
  });
  expect(result.before).toMatchObject({ lumber: 1, brick: 0 });
  expect(result.after).toMatchObject({ lumber: 0, brick: 1 });
});
