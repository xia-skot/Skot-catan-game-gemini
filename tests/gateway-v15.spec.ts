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
  await page.getByRole('heading', { name: '系统设置', exact: true }).click();
  const form = page.getByRole('form', { name: '入口跳转设置' });
  await expect(form.getByRole('checkbox')).toBeEnabled();
  await form.getByRole('checkbox').check();
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
  await page.getByRole('heading', { name: '系统设置', exact: true }).click();
  await expect(page.getByLabel('中旬（11—20 日）')).toHaveValue('https://two.onrender.com');
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
