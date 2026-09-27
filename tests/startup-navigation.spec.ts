import { test, expect } from '@playwright/test';
import manifest from '../src/assetManifest.json' with { type: 'json' };

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

test('failed audio never reports complete and retry downloads only that audio once', async ({ page }) => {
  const missing = manifest.audio['%E8%83%8C%E6%99%AF%E9%9F%B3%E4%B9%90.mp3'];
  await page.route('**' + missing, route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'offline' }));
  await page.goto('/');
  await expect(page.locator('[data-startup]')).toHaveAttribute('data-startup', 'failed');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '97');
  await expect(page.locator('[data-lobby-tabs]')).toHaveCount(0);
  await page.unroute('**' + missing);
  const requests: string[] = [];
  page.on('request', request => { if (/\/assets\/(images|audio)\//.test(request.url())) requests.push(request.url()); });
  await page.getByRole('button', { name: '重试未完成资源' }).click();
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toContain(missing);
});

test('successful images do not wait on a stuck optional decode promise', async ({ page }) => {
  await page.addInitScript(() => { HTMLImageElement.prototype.decode = () => new Promise(() => {}); });
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  const ready = await page.evaluate(async () => {
    const images = await import('/src/' + 'assetPreloader.ts');
    const audio = await import('/src/' + 'audioService.ts');
    return { images: images.checkIsAssetsCached(), sounds: audio.audioService.getLoadedAudioUrls().length };
  });
  expect(ready).toEqual({ images: true, sounds: 6 });
});

test('back remains usable when the browser cannot leave an installed app', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.evaluate(() => {
    const go = history.go.bind(history);
    // Installed apps can reject leaving the document, but same-document
    // traversal still works. Do not disable restoration of the guard itself.
    history.go = (delta = 0) => {
      const position = history.state?.catanApp ? 2 : history.state?.catanBuffer ? 1 : 0;
      if (delta >= -position) go(delta);
    };
    history.back();
  });
  await expect(page.locator('.exit-toast')).toBeVisible();
  // The native second Back is intentionally released now. Exercise the
  // programmatic edge/button path whose history.go is blocked by this fixture.
  await page.evaluate(() => window.dispatchEvent(new Event('catan:back')));
  await page.waitForTimeout(850);
  const nav = page.locator('.lobby-tab-bar');
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
  await expect(nav).toBeHidden();
  await page.evaluate(() => history.back());
  await expect(nav).toBeVisible();
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
});

test('system mark-all survives polling and reload without reading private messages', async ({ page }) => {
  await page.goto('/');
  const nav = page.locator('.lobby-tab-bar');
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('系统消息', { exact: true }).click();
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: '一键已读' }).click();
  await page.waitForTimeout(3600);
  await expect(page.getByRole('button', { name: '一键已读' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('catan_read_msgs_体验玩家') || '[]'))).toEqual(['333333333333333333333333']);
  await page.evaluate(() => history.back());
  await expect(nav).toBeVisible();
  await expect(nav.locator('.bg-red-500')).toHaveCount(1);
  await page.reload();
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('系统消息', { exact: true }).click();
  await expect(page.getByText('海域公告', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '一键已读' })).toHaveCount(0);
});

test('root back warns once, expiry rearms it, second back leaves the app', async ({ page }) => {
  await page.route('**/exit-fixture', route => route.fulfill({ contentType: 'text/html', body: '<h1>Previous page</h1>' }));
  await page.goto('/exit-fixture');
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByText('再按一次返回键退出卡坦岛', { exact: true })).toBeVisible();
  await page.waitForTimeout(2400);
  await expect(page.locator('.exit-toast')).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page.locator('.exit-toast')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/exit-fixture$/);
});

test('private and rule detail occupy footer area and return one level at a time', async ({ page }, info) => {
  await page.goto('/');
  const nav = page.locator('.lobby-tab-bar');
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
  await expect(nav).toBeHidden();
  await expect.poll(() => page.locator('[data-lobby-panels]').evaluate(el => Math.abs(el.children[2].getBoundingClientRect().left))).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath('private-fullscreen.png'), animations: 'disabled' });
  await page.getByText('肖隐弦', { exact: true }).click();
  await expect(page.locator('.chat-screen')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('.chat-screen')).toHaveCount(0);
  await expect(nav).toBeHidden();
  await page.evaluate(() => history.back());
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: '规则', exact: true }).click();
  await page.getByRole('button', { name: '资源板块', exact: true }).click();
  await expect(nav).toBeHidden();
  await page.evaluate(() => history.back());
  await expect(nav).toBeVisible();
  await expect(page.getByRole('button', { name: '资源板块', exact: true })).toBeVisible();
});

test('admin subsections do not double-handle back or add history entries', async ({ page }) => {
  await page.route('**/api/me', async route => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({ json: { ...data, user: { ...data.user, role: 'admin' } } });
  });
  await page.route('**/api/admin/stats', route => route.fulfill({ json: { totalUsers: 1, totalGames: 0, allUsers: [], latestUsers: [], settings: {} } }));
  await page.route('**/api/admin/feedbacks', route => route.fulfill({ json: { feedbacks: [] } }));
  await page.goto('/');
  const nav = page.locator('.lobby-tab-bar');
  await nav.getByRole('button', { name: '我的', exact: true }).click();
  const length = await page.evaluate(() => history.length);
  await page.getByText('管理中心', { exact: true }).click();
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: /系统设置/ }).click();
  await page.evaluate(() => history.back());
  await expect(page.getByRole('button', { name: /系统设置/ })).toBeVisible();
  await expect(nav).toBeHidden();
  await page.evaluate(() => history.back());
  await expect(nav).toBeVisible();
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(length);
});
