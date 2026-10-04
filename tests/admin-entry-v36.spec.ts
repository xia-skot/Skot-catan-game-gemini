import { test, expect } from '@playwright/test';

test('admin menu opens without requesting full player statistics', async ({ page, request }) => {
  await request.post('/api/demo/reset');
  let statsRequests = 0;
  await page.route('**/api/admin/stats', async route => {
    statsRequests++;
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"unavailable"}' });
  });
  await page.goto('/?demoRole=admin');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByRole('heading', { name: '管理中心', exact: true }).click();
  await expect(page.getByRole('heading', { name: '数据中心', exact: true })).toBeVisible();
  expect(statsRequests).toBe(0);
  await page.getByRole('heading', { name: '数据中心', exact: true }).click();
  await expect(page.locator('[data-admin-analytics]')).toBeVisible();
  expect(statsRequests).toBe(0);
});
