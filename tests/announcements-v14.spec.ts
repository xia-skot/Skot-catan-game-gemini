import { test, expect } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

test('administrator can publish in a full-screen editor, edit, and republish without duplicates', async ({ page }, info) => {
  await page.goto('/?demoRole=admin');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('系统消息', { exact: true }).click();
  await page.getByRole('button', { name: '发布系统公告', exact: true }).click();
  const editor = page.locator('[data-announcement-editor]');
  await expect(editor).toBeVisible();
  const box = (await editor.boundingBox())!;
  expect(box.width).toBe(page.viewportSize()!.width);
  expect(box.height).toBe(page.viewportSize()!.height);
  const content = editor.getByLabel('公告内容');
  expect((await content.boundingBox())!.height).toBeGreaterThan(box.height * 0.65);
  await editor.getByLabel('公告标题').fill('版本公告');
  await content.fill(Array.from({ length: 30 }, (_, index) => `第 ${index + 1} 项：公告正文。`).join('\n'));
  await page.screenshot({ path: info.outputPath('announcement-editor.png') });
  await editor.getByRole('button', { name: '发布', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const edit = page.getByRole('button', { name: '编辑公告：版本公告', exact: true });
  await edit.click();
  await editor.getByLabel('公告标题').fill('版本公告已更新');
  await editor.getByLabel('公告内容').fill('重新发布后的正文。');
  await editor.getByRole('button', { name: '重新发布', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑公告：版本公告已更新', exact: true })).toHaveCount(1);
  await page.getByText('版本公告已更新', { exact: true }).click();
  await expect(page.locator('[data-announcement-detail]')).toContainText('重新发布后的正文。');
  await page.screenshot({ path: info.outputPath('announcement-reading.png') });
  const records = await page.evaluate(async () => (await (await fetch('/api/messages', { headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` } })).json()).messages);
  expect(records.filter((message: any) => message.title.startsWith('版本公告'))).toHaveLength(1);
  expect(records.find((message: any) => message.title === '版本公告已更新').revision).toBe(2);
});

test('updated announcements become unread and the back gesture closes detail before leaving notices', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('系统消息', { exact: true }).click();
  await expect(page.getByRole('button', { name: '发布系统公告', exact: true })).toHaveCount(0);
  await page.getByText('海域公告', { exact: true }).click();
  await expect(page.locator('[data-announcement-detail]')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('[data-announcement-detail]')).toHaveCount(0);
  await expect(page.locator('[data-system-announcements]')).toBeVisible();
  const session = await (await request.get('/api/demo/session?role=admin')).json();
  const response = await request.put('/api/admin/messages/333333333333333333333333', {
    headers: { Authorization: `Bearer ${session.token}` }, data: { title: '海域公告更新', content: '新正文', revision: 1 }
  });
  expect(response.ok()).toBe(true);
  await expect(page.getByText('海域公告更新', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-system-announcements]').getByLabel('未读')).toHaveCount(1);
  await page.getByText('海域公告更新', { exact: true }).click();
  await expect(page.locator('[data-announcement-detail] button')).toHaveCount(0);
  await page.locator('[data-page-header]').getByTitle('返回', { exact: true }).click();
  await expect(page.locator('[data-system-announcements]').getByLabel('未读')).toHaveCount(0);
});
