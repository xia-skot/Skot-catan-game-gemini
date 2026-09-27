import { test, expect } from '@playwright/test';
import manifest from '../src/assetManifest.json' with { type: 'json' };

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

test('failed texture blocks startup before the boat and only retries the missing asset', async ({ page }, info) => {
  const missing = Object.values(manifest.images).find(src => src.endsWith('.jpg'))!;
  await page.route('**' + missing, route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'offline' }));
  await page.goto('/');
  await expect(page.getByRole('button', { name: '重试未完成资源', exact: true })).toBeVisible();
  await expect(page.locator('[data-lobby-tabs]')).toHaveCount(0);
  await expect(page.locator('[data-startup]')).toHaveAttribute('data-startup', 'failed');
  await expect(page.locator('.startup-boat')).toHaveCount(0);
  expect(Number(await page.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeLessThan(100);
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('ocean-loading.png') });
  await page.unroute('**' + missing);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/assets/images/')) requests.push(request.url()); });
  await page.getByRole('button', { name: '重试未完成资源', exact: true }).click();
  await expect(page.locator('[data-startup]')).toHaveAttribute('data-startup', 'sailing');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(async () => (await import('/src/' + 'assetPreloader.ts')).checkIsAssetsCached())).toBe(true);
});

test('blocked CacheStorage still loads and shares decoded images', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'caches', { get() { throw new Error('Storage denied'); } }); });
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  const result = await page.evaluate(async () => {
    const pre = await import('/src/' + 'assetPreloader.ts');
    const loader = await import('/src/' + 'imageManager.ts');
    const images = await import('/src/' + 'images.ts');
    const ready = (await pre.preloadAllAssets()).ready;
    const [first, second] = await Promise.all([loader.loadGameImage(images.ALL_GAME_IMAGES[0]), loader.loadGameImage(images.ALL_GAME_IMAGES[0])]);
    return { ready, reused: first === second, loaded: first.naturalWidth > 0 };
  });
  expect(result).toEqual({ ready: true, reused: true, loaded: true });
});

test('image concurrency is bounded and aborted subscribers stop receiving progress', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.evaluate(async () => { await (await import('/src/' + 'assetPreloader.ts')).clearAssetsCache(); });
  let active = 0, maxActive = 0;
  await page.route('**/assets/images/*', async route => {
    active++; maxActive = Math.max(maxActive, active);
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 40));
    await route.fulfill({ response });
    active--;
  });
  const result = await page.evaluate(async () => {
    const pre = await import('/src/' + 'assetPreloader.ts');
    const controller = new AbortController();
    let notifications = 0;
    const first = pre.preloadAllAssets(() => notifications++, { signal: controller.signal });
    controller.abort();
    const atAbort = notifications;
    const [a, b] = await Promise.all([first, pre.preloadAllAssets()]);
    return { ready: a.ready && b.ready, notifications, atAbort };
  });
  expect(result.ready).toBe(true);
  expect(result.notifications).toBe(result.atAbort);
  expect(maxActive).toBeGreaterThan(0);
  expect(maxActive).toBeLessThanOrEqual(4);
});

test('rules depth, safe areas and chat keyboard do not move the lobby', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.lobby-tab-bar');
  await nav.getByRole('button', { name: '规则', exact: true }).click();
  await page.getByRole('button', { name: '资源板块', exact: true }).click();
  await expect(nav).toBeHidden();
  await page.evaluate(() => history.back());
  await expect(page.getByRole('button', { name: '资源板块', exact: true })).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '47px');
    document.documentElement.style.setProperty('--safe-bottom', '34px');
  });
  const bounds = await nav.boundingBox();
  expect(Math.abs(bounds!.y + bounds!.height - page.viewportSize()!.height)).toBeLessThan(2);
  await expect(nav).toHaveCSS('padding-bottom', '34px');
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
  await page.getByText('肖隐弦', { exact: true }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  const transform = await page.locator('[data-lobby-panels]').evaluate(el => getComputedStyle(el).transform);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, value: 480 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(page.locator('.chat-screen')).toHaveCSS('height', '480px');
  expect(await page.locator('[data-lobby-panels]').evaluate(el => getComputedStyle(el).transform)).toBe(transform);
  await page.locator('.chat-screen').getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.chat-screen')).toHaveCount(0);
  await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', 'profile');
});
