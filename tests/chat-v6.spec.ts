import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

async function openList(page: Page) {
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
}

test('list clearing hides cards, chat retains records and Enter inserts a newline', async ({ page }, info) => {
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
  await expect(chat.getByRole('button', { name: '清屏（仅本机）', exact: true })).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(chat).toHaveCount(0);
  await page.getByRole('button', { name: '清屏（仅本机）', exact: true }).click();
  await expect(page.locator('[data-conversation]')).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page.getByText('历史战绩', { exact: true })).toBeVisible();
  await openList(page);
  await expect(page.locator('[data-conversation]')).toHaveCount(0);
  await expect(page.getByText(/已隐藏会话/)).toHaveCount(0);
  const recipients = page.getByRole('combobox', { name: '选择玩家发起私信' });
  await expect(recipients.locator('option')).toHaveCount(2);
  await recipients.selectOption('肖隐弦');
  await expect(chat.getByText('第一行', { exact: false })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const response = await fetch('/api/messages', { headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` } });
    return response.json();
  });
  expect(stored.messages.some((message: any) => message.content === '第一行\n第二行')).toBe(true);
  expect(mutations).toEqual(['POST']);
});

test('all timestamps toggle together while the first message each day always retains its date', async ({ page }) => {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  await page.route('**/api/messages', async route => {
    const response = await route.fetch();
    const data = await response.json();
    const original = data.messages.find((message: any) => message.type === 'private');
    data.messages = [
      { ...original, id: 'before-midnight', createdAt: midnight.getTime() - 15000, content: '昨天最后一条' },
      { ...original, id: 'after-midnight', createdAt: midnight.getTime() + 15000, content: '今天第一条' },
      { ...original, id: 'today-second', createdAt: midnight.getTime() + 120000, content: '今天第二条' },
      { ...original, id: 'today-third', createdAt: midnight.getTime() + 240000, content: '今天第三条' },
    ];
    await route.fulfill({ response, json: data });
  });
  await openList(page);
  await page.getByRole('button', { name: '打开与肖隐弦的私信' }).click();
  const times = page.locator('.chat-screen').getByRole('button', { name: '切换日期显示', exact: true });
  await expect(times).toHaveCount(4);
  await expect(times.nth(1)).toHaveText(/\d{2}-\d{2} 00:00/);
  await expect(times.nth(2)).toHaveText('00:02');
  await expect(times.nth(3)).toHaveText('00:04');
  await times.nth(1).click();
  await expect(times.nth(1)).toHaveText(/\d{2}-\d{2} 00:00/);
  await expect(times.nth(2)).toHaveText(/\d{2}-\d{2} 00:02/);
  await expect(times.nth(3)).toHaveText(/\d{2}-\d{2} 00:04/);
  await times.nth(3).click();
  await expect(times.nth(0)).toHaveText(/\d{2}-\d{2} 23:59/);
  await expect(times.nth(1)).toHaveText(/\d{2}-\d{2} 00:00/);
  await expect(times.nth(2)).toHaveText('00:02');
  await expect(times.nth(3)).toHaveText('00:04');
});

test('admin can start conversations from the private list without a hidden-list interface', async ({ page }) => {
  await page.route('**/api/messages', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.allPlayers = [...(data.allPlayers || []), '尚未聊天的玩家'];
    data.recipients = [...(data.recipients || []), { id: '777777777777777777777777', username: '尚未聊天的玩家', isGuest: false }];
    await route.fulfill({ response, json: data });
  });
  await page.goto('/?demoRole=admin');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 30000 });
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
  await expect(page.locator('[data-conversation]').first()).toBeVisible();
  await expect(page.locator('[data-conversation="尚未聊天的玩家"]')).toHaveCount(0);
  await page.getByRole('combobox', { name: '选择玩家发起私信' }).selectOption('777777777777777777777777');
  await expect(page.locator('.chat-screen')).toBeVisible();
  await page.locator('.chat-screen').getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('button', { name: '打开与尚未聊天的玩家的私信' })).toBeVisible();
  await page.getByRole('button', { name: '清屏（仅本机）', exact: true }).click();
  await expect(page.locator('[data-conversation]')).toHaveCount(0);
  await page.reload();
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await page.getByText('私信', { exact: true }).click();
  await expect(page.locator('[data-conversation]')).toHaveCount(0);
  await expect(page.getByText(/已隐藏会话/)).toHaveCount(0);
  await page.getByRole('combobox', { name: '选择玩家发起私信' }).selectOption('777777777777777777777777');
  await expect(page.locator('.chat-screen')).toBeVisible();
});

test('lobby profile and rules headers have the same height', async ({ page }) => {
  await page.goto('/');
  const tabs = page.locator('.lobby-tab-bar');
  await expect(tabs).toBeVisible({ timeout: 30000 });
  await tabs.getByRole('button', { name: '大厅', exact: true }).click();
  const lobbyHeight = (await page.locator('[data-room-list-header]').boundingBox())!.height;
  for (const name of ['我的', '规则']) {
    await tabs.getByRole('button', { name, exact: true }).click();
    const header = page.locator('[data-page-header]').filter({ hasText: name === '我的' ? 'demo@example.test' : '游戏规则与指南' });
    await expect(header).toHaveCount(1);
    expect(Math.abs((await header.boundingBox())!.height - lobbyHeight)).toBeLessThan(1);
  }
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
