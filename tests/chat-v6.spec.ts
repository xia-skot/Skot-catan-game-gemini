import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

async function openList(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
}

test('chat starts on one line, Enter inserts a newline and clearing never deletes records', async ({ page }, info) => {
  const mutations: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/messages') && request.method() !== 'GET') mutations.push(request.method());
  });
  await openList(page);
  await page.getByRole('button', { name: '打开与肖隐弦的私信' }).click();
  const chat = page.locator('.chat-screen');
  const input = page.getByRole('textbox', { name: '私信内容' });
  await expect(input).toHaveAttribute('rows', '1');
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(32);
  await input.fill('第一行');
  await input.press('Enter');
  await expect(input).toHaveValue('第一行\n');
  expect(mutations).toEqual([]);
  await input.fill('第一行\n第二行');
  await page.screenshot({ path: info.outputPath('multiline-chat.png') });
  await chat.getByRole('button', { name: '发送', exact: true }).click();
  await expect(input).toHaveValue('');
  await expect(chat.getByText('第一行', { exact: false })).toBeVisible();
  await chat.getByRole('button', { name: '清屏（仅本机）', exact: true }).click();
  await expect(chat.getByText('暂无消息', { exact: true })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(chat).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  await openList(page);
  await page.getByRole('button', { name: '打开与肖隐弦的私信' }).click();
  await expect(chat.getByText('暂无消息', { exact: true })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const response = await fetch('/api/messages', { headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` } });
    return response.json();
  });
  expect(stored.messages.some((message: any) => message.content === '第一行\n第二行')).toBe(true);
  expect(mutations).toEqual(['POST']);
});

test('left swipe hides only the local conversation and a new incoming message restores it', async ({ page }, info) => {
  let arrival = false;
  const mutations: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/messages') && request.method() !== 'GET') mutations.push(request.method());
  });
  await page.route('**/api/messages', async route => {
    const response = await route.fetch();
    const data = await response.json();
    if (arrival) {
      const original = data.messages.find((message: any) => message.type === 'private');
      data.messages.push({ ...original, id: '444444444444444444444444', _id: '444444444444444444444444', content: '新私信', createdAt: Date.now() });
    }
    await route.fulfill({ response, json: data });
  });
  await openList(page);
  const row = page.locator('[data-conversation="肖隐弦"]');
  await expect(row.locator('[data-unread-count="1"]')).toBeVisible();
  const box = (await row.boundingBox())!;
  await page.mouse.move(box.x + box.width - 65, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 30, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.chat-screen')).toHaveCount(0);
  const remove = row.getByRole('button', { name: '删除与肖隐弦的会话（仅本机隐藏）' });
  await expect(remove).toBeVisible();
  await expect(row.locator(':scope > div')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, -80, 0)');
  await page.screenshot({ path: info.outputPath('swipe-conversation.png') });
  await remove.click();
  await expect(row).toHaveCount(0);
  await openList(page);
  await expect(row).toHaveCount(0);
  arrival = true;
  await expect(row).toBeVisible({ timeout: 12000 });
  await expect(row.locator('[data-unread-count="1"]')).toBeVisible();
  expect(mutations).toEqual([]);
});
