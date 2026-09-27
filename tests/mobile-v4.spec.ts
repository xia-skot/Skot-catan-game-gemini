import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });
async function open(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 20000 });
}

test('repeated Back never adds new history entries after the last screen interaction', async ({ page }) => {
  await page.route('**/exit-fixture', route => route.fulfill({ contentType: 'text/html', body: '<h1>Previous page</h1>' }));
  await page.goto('/exit-fixture');
  await open(page);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
  await page.getByText('肖隐弦', { exact: true }).click();
  // Native phone Back cannot be driven here. This checks the structural cause:
  // no pushState after traversal, with no trusted clicks to reset activation.
  const back = () => page.evaluate(() => history.back());
  await page.evaluate(() => {
    const original = history.pushState.bind(history);
    (window as any).pushesAfterBack = 0;
    history.pushState = (...args) => { (window as any).pushesAfterBack++; original(...args); };
  });
  await back();
  await expect(page.locator('.chat-screen')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
  await back();
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
  for (let i = 0; i < 3; i++) {
    await back();
    await expect(page.locator('.exit-toast')).toBeVisible();
    await page.waitForTimeout(1250);
    await expect(page.locator('.exit-toast')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => !!history.state?.catanApp)).toBe(true);
  }
  expect(await page.evaluate(() => (window as any).pushesAfterBack)).toBe(0);
  await back();
  await expect(page.locator('.exit-toast')).toBeVisible();
  await back();
  await expect(page).toHaveURL(/\/exit-fixture$/);
});

test('sailing caption restores the original typography and fullscreen entry is removed', async ({ page }, info) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-startup]')).toHaveAttribute('data-startup', 'sailing', { timeout: 20000 });
  const caption = page.locator('.startup-progress.is-sailing');
  await expect(caption).toHaveCSS('font-style', 'italic');
  await expect(caption).toHaveCSS('font-weight', '900');
  await expect(caption).toHaveCSS('color', 'rgb(12, 74, 110)');
  const box = await caption.boundingBox();
  expect(box!.y / page.viewportSize()!.height).toBeGreaterThan(.76);
  expect(box!.y / page.viewportSize()!.height).toBeLessThan(.82);
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('sailing-v4.png') });
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await expect(page.getByRole('button', { name: '全屏', exact: true })).toHaveCount(0);
});

test('installed icon dimensions match the manifest and the icon can decode', async ({ page, request }) => {
  const manifest = await (await request.get('/manifest.json')).json();
  expect(manifest.name).toBe('CATAN · 卡坦岛');
  const icon = manifest.icons[0];
  await page.goto('/');
  const dimensions = await page.evaluate(async src => {
    const image = new Image(); image.src = src; await image.decode();
    return `${image.naturalWidth}x${image.naturalHeight}`;
  }, icon.src);
  expect(dimensions).toBe(icon.sizes);
  expect(Number(dimensions.split('x')[0])).toBeGreaterThanOrEqual(512);
});

test('board number font stays Times during and after drag caching; dice sum has room', async ({ page }, info) => {
  await open(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('[data-game-sailing]')).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator('canvas').first()).toBeVisible();
  const fonts = await page.evaluate(() => {
    const stage = (window as any).Konva.stages.find((s: any) => s.container().closest('[data-portrait-rotated]'));
    const read = () => stage.find('.hex-number').map((n: any) => ({ family: n.fontFamily(), style: n.fontStyle(), font: n._getContextFont() }));
    const before = read(); stage.fire('dragstart'); const during = read(); stage.fire('dragend');
    return { before, during, after: read() };
  });
  expect(fonts.before.length).toBeGreaterThan(0);
  expect(fonts.during).toEqual(fonts.before);
  expect(fonts.after).toEqual(fonts.before);
  for (const font of fonts.before) { expect(font.family).toContain('Times New Roman'); expect(font.style).toBe('bold'); expect(font.font).not.toContain('900'); }
  await page.evaluate(async () => {
    const { socketService: service } = await import('/src/' + 'socketService.ts');
    const room: any = await new Promise(resolve => service.getMyActiveRoom('体验玩家', resolve));
    const state = structuredClone(room.gameState);
    state.phase = 'playing'; state.hasRolled = true; state.dice = [6, 6];
    service.socket.onevent({ data: ['game_state_updated', state] });
  });
  const sum = page.locator('[data-dice-result]');
  await expect(sum).toContainText('12', { timeout: 15000 });
  await expect(sum.locator('p')).not.toHaveClass(/animate-pulse/);
  await page.waitForTimeout(3000);
  await expect(sum).toHaveText('12');
  const metrics = await sum.evaluate(el => {
    const style = getComputedStyle(el), p = el.querySelector('p')!;
    return { width: el.clientWidth, size: parseFloat(style.fontSize), overflow: getComputedStyle(p).overflow, textWidth: p.scrollWidth, clientWidth: p.clientWidth };
  });
  expect(metrics.width).toBeGreaterThanOrEqual(metrics.size * 1.4);
  expect(metrics.width).toBeLessThanOrEqual(metrics.size * 1.7);
  expect(metrics.textWidth).toBeLessThanOrEqual(metrics.clientWidth);
  expect(metrics.overflow).toBe('visible');
  await page.screenshot({ path: info.outputPath('board-dice-v4.png') });
});
