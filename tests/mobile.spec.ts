import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

async function openDemo(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
}
async function tab(page: Page, name: string) {
  await page.locator('.lobby-tab-bar').getByRole('button', { name, exact: true }).click();
}
async function swipe(page: Page, x: number, y: number, dx: number, dy = 0, cancel = false) {
  // Use DOM touch events for WebKit too; this checks the app recognizer, not OS gestures.
  await page.evaluate(({ x, y, dx, dy, cancel }) => {
    const target = document.elementFromPoint(x, y)!;
    const touch = (px: number, py: number) => ({ identifier: 1, target, clientX: px, clientY: py, pageX: px, pageY: py, screenX: px, screenY: py });
    const fire = (type: string, touches: any[], changed: any[]) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: touches }, changedTouches: { value: changed } });
      target.dispatchEvent(event);
    };
    fire('touchstart', [touch(x, y)], [touch(x, y)]);
    fire('touchmove', [touch(x + dx, y + dy)], [touch(x + dx, y + dy)]);
    fire(cancel ? 'touchcancel' : 'touchend', [], [touch(x + dx, y + dy)]);
  }, { x, y, dx, dy, cancel });
  await page.waitForTimeout(420);
}

test('20 menu/back cycles stay on the correct page and preserve layout', async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openDemo(page);
  const historyLength = await page.evaluate(() => history.length);
  for (let i = 0; i < 20; i++) {
    await tab(page, '我的');
    await page.getByText('关于', { exact: true }).click();
    await swipe(page, 150, 320, -90);
    await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', 'profile');
    await expect(page.getByText('卡坦岛 · 本地演示', { exact: true })).toBeVisible();
    if (i % 2) await page.evaluate(() => history.back());
    else await swipe(page, 8, 320, 95);
    await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
    await tab(page, '大厅');
    await expect(page.getByText('游戏大厅', { exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => history.length)).toBe(historyLength);
  const footer = await page.locator('.lobby-tab-bar').boundingBox();
  expect(Math.abs(footer!.y + footer!.height - page.viewportSize()!.height)).toBeLessThan(2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: info.outputPath('lobby.png'), animations: 'disabled' });
});

test('top-level swipe, cancellation and vertical scroll never leak into submenus', async ({ page }) => {
  await openDemo(page);
  await tab(page, '大厅');
  await swipe(page, 180, 340, -55);
  await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', 'profile');
  await swipe(page, 180, 640, -100, 0, true);
  await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', 'profile');
  await swipe(page, 180, 640, -25, -90);
  await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', 'profile');
  await page.getByText('私信', { exact: true }).click();
  await swipe(page, 180, 450, -120);
  await expect(page.locator('[data-lobby-tabs]')).toHaveAttribute('data-lobby-tabs', 'profile');
  await page.getByText('肖隐弦', { exact: true }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  await swipe(page, 180, 450, -120);
  await expect(page.locator('.chat-screen')).toBeVisible();
  await swipe(page, 8, 450, 100);
  await expect(page.locator('.chat-screen')).toHaveCount(0);
  await expect(page.getByText('肖隐弦', { exact: true })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
});

test('private message read indicators clear immediately and survive reload', async ({ page }) => {
  await openDemo(page);
  await tab(page, '我的');
  await expect(page.locator('.lobby-tab-bar .bg-red-500')).toHaveCount(1);
  await page.getByText('私信', { exact: true }).click();
  await page.getByText('肖隐弦', { exact: true }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  await expect(page.locator('.lobby-tab-bar .bg-red-500')).toHaveCount(0);
  await page.locator('.chat-screen').getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.locator('.bg-green-400, .bg-green-500')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await expect(page.locator('.lobby-tab-bar .bg-red-500')).toHaveCount(0);
});

test('image readiness and failed download recovery', async ({ page }) => {
  await openDemo(page);
  expect(await page.evaluate(async () => (await (await import('/src/' + 'assetPreloader.ts')).preloadAllAssets()).ready)).toBe(true);
  const failedSrc = await page.evaluate(async () => {
    const pre = await import('/src/' + 'assetPreloader.ts');
    await pre.clearAssetsCache();
    return (await import('/src/' + 'images.ts')).ALL_GAME_IMAGES[1];
  });
  await page.route('**' + failedSrc, route => route.fulfill({ status: 503, contentType: 'text/html', body: 'Unavailable' }));
  const result = await page.evaluate(async () => {
    const pre = await import('/src/' + 'assetPreloader.ts');
    const progress: number[] = [];
    const result = await pre.preloadAllAssets((percent: number) => progress.push(percent));
    return { ...result, progress };
  });
  expect(result.ready).toBe(false);
  expect(result.failed).toEqual([failedSrc]);
  expect(Math.max(...result.progress)).toBeLessThan(100);
  await page.unroute('**' + failedSrc);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/assets/images/')) requests.push(request.url()); });
  expect(await page.evaluate(async () => (await (await import('/src/' + 'assetPreloader.ts')).preloadAllAssets()).ready)).toBe(true);
  expect(requests).toHaveLength(1);
});

test('persistent cache, partial eviction and version cleanup', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit' && process.platform === 'win32', 'Windows WebKit ephemeral CacheStorage loses response bodies on reload; verify persistent caching on a real iPhone');
  await openDemo(page);
  expect(await page.evaluate(async () => (await (await import('/src/' + 'assetPreloader.ts')).preloadAllAssets()).ready)).toBe(true);
  const failedSrc = await page.evaluate(async () => (await import('/src/' + 'images.ts')).ALL_GAME_IMAGES[1]);
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/assets/images/')) requests.push(request.url()); });
  await page.reload();
  expect(await page.evaluate(async () => (await (await import('/src/' + 'assetPreloader.ts')).preloadAllAssets()).ready)).toBe(true);
  expect(requests).toHaveLength(0);
  await page.evaluate(async src => {
    const current = (await caches.keys()).find(name => name.startsWith('catan-media-'))!;
    await (await caches.open(current)).delete(src);
    await caches.open('catan-media-obsolete');
    await caches.open('unrelated-cache');
    localStorage.setItem('catan_test_save', 'keep');
  }, failedSrc);
  await page.reload();
  expect(await page.evaluate(async () => (await (await import('/src/' + 'assetPreloader.ts')).preloadAllAssets()).ready)).toBe(true);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => caches.keys())).not.toContain('catan-media-obsolete');
  expect(await page.evaluate(() => caches.keys())).toContain('unrelated-cache');
  expect(await page.evaluate(() => localStorage.getItem('catan_test_save'))).toBe('keep');
});

test('sound reuses decoded buffers, stops loops and does not queue hidden effects', async ({ page }) => {
  await openDemo(page);
  test.skip(await page.evaluate(() => !window.AudioContext && !(window as any).webkitAudioContext), 'This browser engine has no Web Audio implementation; actual sound needs a real device');
  await page.evaluate(async () => {
    const { audioService } = await import('/src/' + 'audioService.ts');
    await audioService.preloadAllAudio();
    (window as any).testAudio = audioService;
  });
  await tab(page, '我的');
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.context.state)).toBe('running');
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/assets/audio/')) requests.push(request.url()); });
  const result = await page.evaluate(async () => {
    const audio = (window as any).testAudio;
    let starts = 0;
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args: any[]) { starts++; return original.apply(this, args); };
    audio.roomActive = true;
    audio.play('dice'); audio.play('build'); audio.play('resource'); audio.play('pirate', true);
    const activeLoop = audio.active.get('pirate').source.loop;
    audio.stop('pirate');
    const stopped = !audio.active.has('pirate') && !audio.loops.has('pirate');
    audio.enabled = false;
    audio.play('dice');
    const mutedStarts = starts;
    audio.enabled = true;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    audio.play('dice'); audio.play('build');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
    await audio.unlockAll();
    await new Promise(resolve => setTimeout(resolve, 250));
    AudioBufferSourceNode.prototype.start = original;
    return { activeLoop, stopped, mutedStarts, starts, bufferCount: audio.buffers.size, decoded: [...audio.buffers.values()].every((buffer: any) => buffer.length > 0) };
  });
  expect(result).toEqual({ activeLoop: true, stopped: true, mutedStarts: 4, starts: 4, bufferCount: 5, decoded: true });
  expect(requests).toHaveLength(0);
});

test('real board renders complete textures in both orientations', async ({ page }, info) => {
  await openDemo(page);
  await page.getByRole('button', { name: '进入海域', exact: true }).click();
  await page.getByRole('button', { name: '就绪', exact: true }).click();
  await page.getByRole('button', { name: '开启游戏', exact: true }).click();
  await expect(page.locator('canvas').first()).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/' + 'assetPreloader.ts')).checkIsAssetsCached())).toBe(true);
  await expect.poll(() => page.locator('canvas').first().evaluate((canvas: HTMLCanvasElement) => {
    if (!canvas.width || !canvas.height) return 0;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 400) if (pixels[i + 3]) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size;
  })).toBeGreaterThan(40);
  await expect.poll(() => page.locator('canvas').first().evaluate(canvas => {
    const container = canvas.closest('.transition-opacity');
    return container ? Number(getComputedStyle(container).opacity) : 1;
  })).toBe(1);
  await page.screenshot({ path: info.outputPath('board-portrait.png') });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.height, height: viewport.width });
  await page.waitForTimeout(500);
  await expect(page.locator('canvas').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('board-landscape.png') });
});

test('installed fullscreen is detected without invoking browser fullscreen', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      const result = nativeMatchMedia(query);
      if (query === '(display-mode: fullscreen)') Object.defineProperty(result, 'matches', { value: true });
      return result;
    };
    (window as any).fullscreenCalls = 0;
    Element.prototype.requestFullscreen = async () => { (window as any).fullscreenCalls++; };
  });
  await openDemo(page);
  await tab(page, '我的');
  await page.getByText('关于', { exact: true }).click();
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).fullscreenCalls)).toBe(0);
  expect(await page.evaluate(async () => (await import('/src/' + 'navigation.ts')).isInstalledDisplay())).toBe(true);
});
