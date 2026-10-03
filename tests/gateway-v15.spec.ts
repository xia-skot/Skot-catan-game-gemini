import { test, expect } from '@playwright/test';
import worker from '../gateway/worker';

test('entry replaces the current page without a popup and keeps the explicit room destination', async ({ page, context }) => {
  const config = { enabled: true, fallback: 'https://skot-game.onrender.com',
    sites: { early: 'https://one.onrender.com', middle: 'https://two.onrender.com', late: 'https://three.onrender.com' } };
  const response = await worker.fetch(new Request('https://entry.example/?site=early&room=123456'), {
    ROUTING: { get: async () => JSON.stringify(config), put: async () => {} }, GATEWAY_ADMIN_TOKEN: '',
  });
  const html = await response.text();
  await page.route('https://entry.example/**', route => route.fulfill({ status: 200, headers: Object.fromEntries(response.headers), body: html }));
  await page.route('https://one.onrender.com/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<meta charset="utf-8"><p>海域已连接</p>' }));
  const count = context.pages().length;
  await page.goto('https://entry.example/?site=early&room=123456');
  await expect(page).toHaveURL('https://one.onrender.com/?room=123456');
  await expect(page.getByText('海域已连接')).toBeVisible();
  expect(context.pages()).toHaveLength(count);
});

test('admin can configure and reload all three calendar destinations', async ({ page }, info) => {
  await page.goto('/?demoRole=admin');
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '管理中心', exact: true }).click();
  await page.getByRole('heading', { name: '数据中心', exact: true }).click();
  await page.getByRole('button', { name: '网址与流量', exact: true }).click();
  const form = page.getByRole('form', { name: '入口跳转设置' });
  await expect(form.getByRole('combobox', { name: '切换方式' })).toBeEnabled();
  await form.getByRole('combobox', { name: '切换方式' }).selectOption('calendar');
  await form.getByLabel('上旬（1—10 日）').fill('https://one.onrender.com');
  await form.getByLabel('中旬（11—20 日）').fill('https://two.onrender.com');
  await form.getByLabel('下旬（21 日—月底）').fill('https://three.onrender.com');
  await form.getByRole('button', { name: '保存入口设置' }).click();
  await expect(form.getByRole('status')).toContainText('演示配置已保存');
  await page.screenshot({ path: info.outputPath('gateway-settings.png'), fullPage: true });
  const saved = await page.evaluate(async () => (await (await fetch('/api/admin/gateway', {
    headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` },
  })).json()).config);
  expect(saved.enabled).toBe(true);
  expect(saved.sites.middle).toBe('https://two.onrender.com');
  const overflowing = await form.locator('input[type=url]').evaluateAll(elements => elements.some(el => el.getBoundingClientRect().right > innerWidth));
  expect(overflowing).toBe(false);
  await page.reload();
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '管理中心', exact: true }).click();
  await page.getByRole('heading', { name: '数据中心', exact: true }).click();
  await page.getByRole('button', { name: '网址与流量', exact: true }).click();
  await expect(page.getByLabel('中旬（11—20 日）')).toHaveValue('https://two.onrender.com');
});

test('automatic routing rejection stays visible and allows fixed-mode recovery', async ({ page }, info) => {
  await page.route('**/api/admin/gateway', async route => {
    const request = route.request();
    if (request.method() === 'PUT' && request.postDataJSON().bandwidth?.enabled) {
      return route.fulfill({ status: 409, json: { error: '未保存：没有可自动分配的游戏站。原入口配置保持不变。' } });
    }
    return route.continue();
  });
  await page.goto('/?demoRole=admin');
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '管理中心', exact: true }).click();
  await page.getByRole('heading', { name: '数据中心', exact: true }).click();
  await page.getByRole('button', { name: '网址与流量', exact: true }).click();
  const form = page.getByRole('form', { name: '入口跳转设置' });
  await form.getByLabel('切换方式').selectOption('bandwidth');
  for (const label of ['上旬（1—10 日）', '中旬（11—20 日）', '下旬（21 日—月底）']) await form.getByLabel(label).fill('https://one.onrender.com');
  await form.getByRole('button', { name: '保存入口设置' }).click();
  await expect(form.getByRole('alert').filter({ hasText: '原入口配置保持不变' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('bandwidth-not-ready.png'), fullPage: true });
  await form.getByLabel('切换方式').selectOption('fixed');
  await form.getByRole('button', { name: '保存入口设置' }).click();
  await expect(form.getByRole('status')).toContainText('演示配置已保存');
});

test('monthly points have per-game evidence and old server versions do not silently show stale scores', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '排行榜', exact: true }).click();
  await expect(page.locator('[data-leaderboard] summary')).toContainText('我的本月积分');
  await page.locator('[data-leaderboard] summary').click();
  const data = await page.evaluate(async () => (await (await fetch('/api/leaderboard', {
    headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` },
  })).json()));
  expect(data.myGames.reduce((sum: number, game: any) => sum + game.points, 0)).toBe(data.entries.find((entry: any) => entry.userId === '111111111111111111111111').points);
  await page.screenshot({ path: info.outputPath('leaderboard-details.png'), fullPage: true });
  await page.route('**/api/leaderboard?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...data, scoringVersion: undefined }) }));
  await page.getByRole('button', { name: '刷新排行榜' }).click();
  await expect(page.getByRole('alert')).toContainText('服务器计分版本尚未更新');
  await expect(page.locator('[data-leaderboard] tbody tr')).toHaveCount(0);
});
