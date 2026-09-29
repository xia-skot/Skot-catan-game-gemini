import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { chromium, expect, type Browser, type Page } from '@playwright/test';

let server: ViteDevServer;
let browser: Browser;
let baseURL: string;
let harness: string;
const screenshots = mkdtempSync(join(tmpdir(), 'catan-message-display-'));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

before(async () => {
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0, hmr: false, watch: null } });
  await server.listen();
  const address = server.httpServer!.address() as { port: number };
  baseURL = `http://127.0.0.1:${address.port}`;
  harness = await server.transformIndexHtml('/__profile_test', `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root" style="height:100dvh"></div><script type="module">
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import { UserProfileModal } from '/src/components/UserProfileModal.tsx';
    import { runTopBackHandler } from '/src/navigation.ts';
    import '/src/index.css';
    const root = ReactDOM.createRoot(document.getElementById('root'));
    const params = new URLSearchParams(location.search);
    const user = params.get('admin') ? { id: 'admin-id', username: 'Official', role: 'admin' } : { id: 'player-id', username: 'Player', role: 'user' };
    window.testRenderProfile = currentUser => root.render(React.createElement(UserProfileModal, { currentUser, inline: true, onClose() {}, onUpdateSuccess() {} }));
    window.addEventListener('catan:back', runTopBackHandler);
    window.testRenderProfile(user);
  </script></body></html>`);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(edge) ? edge : undefined), headless: true });
});

after(async () => {
  await browser?.close();
  await server?.close();
  console.log(`Message display screenshots: ${screenshots}`);
});

async function fixture(page: Page, admin = false) {
  const records = [
    { id: 'incoming', type: 'private', senderName: 'Official', senderId: 'admin-id', targetUserId: 'player-id', targetUserName: 'Player', content: 'Original incoming', createdAt: 1000 },
    { id: 'outgoing', type: 'private', senderName: 'Player', senderId: 'player-id', targetUserId: 'admin-id', targetUserName: 'Official', content: 'Original outgoing', createdAt: 2000 },
    { id: 'notice', type: 'system', senderName: 'System', senderId: 'system', targetUserId: '', targetUserName: '', content: 'System record', createdAt: 3000 },
  ];
  const mutations: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__profile_test*', route => route.request().resourceType() === 'document' ? route.fulfill({ contentType: 'text/html', body: harness }) : route.continue());
  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') mutations.push(`${request.method()} ${url.pathname}`);
    let response: object = {};
    if (url.pathname === '/api/messages') response = { messages: records, adminUsername: 'Official', allPlayers: ['Player', 'Empty'] };
    if (url.pathname === '/api/leaderboard') response = { month: url.searchParams.get('month'), timezone: 'Asia/Shanghai', topCount: 20, entries: [] };
    if (request.method() === 'POST' && ['/api/messages/private', '/api/admin/messages'].includes(url.pathname)) {
      const message = { ...records[admin ? 0 : 1], id: `sent-${records.length}`, content: request.postDataJSON().content, createdAt: Date.now() };
      records.push(message);
      response = { success: true, message };
    }
    await route.fulfill({ json: response });
  });
  await page.goto(baseURL + '/__profile_test' + (admin ? '?admin=1' : ''));
  try { await expect(page.getByRole('button', { name: '排行榜', exact: true })).toBeVisible(); }
  catch (error) { throw new Error(`${error}\nBrowser errors: ${errors.join('\n')}`); }
  await page.evaluate(() => localStorage.setItem('existing_message_history', 'KEEP HISTORY'));
  return { records, mutations };
}

async function back(page: Page) { await page.evaluate(() => window.dispatchEvent(new Event('catan:back'))); }
async function openChatList(page: Page) { await page.getByText('私信', { exact: true }).click(); }

for (const width of [1280, 360, 393]) {
  test(`composer, local clearing, safe area and navigation at ${width}px`, { timeout: 60000 }, async () => {
    const page = await browser.newPage({ viewport: { width, height: 814 }, isMobile: width < 500, hasTouch: width < 500 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const { records, mutations } = await fixture(page);
      const ranking = await page.getByRole('button', { name: '排行榜', exact: true }).boundingBox();
      const history = await page.getByRole('button', { name: '历史战绩', exact: true }).boundingBox();
      assert.ok(ranking!.y < history!.y);
      await page.getByRole('button', { name: '排行榜', exact: true }).click();
      await expect(page.locator('[data-leaderboard]')).toBeVisible();
      await page.locator('[data-leaderboard]').getByRole('button', { name: '返回', exact: true }).click();
      await openChatList(page);
      await page.getByRole('button', { name: '打开与Official的私信' }).click();
      const chat = page.locator('.chat-screen');
      await expect(chat.getByText('Original incoming', { exact: true })).toBeVisible();
      const input = page.getByRole('textbox', { name: '私信内容' });
      await expect(input).toHaveAttribute('rows', '1');
      assert.ok((await input.boundingBox())!.height <= 32);
      await input.fill('First');
      await input.press('Enter');
      await expect(input).toHaveValue('First\n');
      assert.equal(mutations.length, 0);
      assert.ok((await input.boundingBox())!.height > 32);
      await input.fill(Array.from({ length: 20 }, (_, index) => `Line ${index}`).join('\n'));
      assert.ok((await input.boundingBox())!.height <= 144);
      assert.ok(await input.evaluate(element => element.scrollHeight > element.clientHeight));
      await page.screenshot({ path: join(screenshots, `composer-${width}.png`) });
      await input.fill('Sent with button\nSecond line');
      await chat.getByRole('button', { name: '发送', exact: true }).click();
      await expect(input).toHaveValue('');
      assert.ok((await input.boundingBox())!.height <= 32);
      await expect(chat.getByText('Sent with button', { exact: false })).toBeVisible();
      await expect(chat.getByRole('button', { name: '清屏（仅本机）', exact: true })).toHaveCount(0);
      assert.equal(records.length, 4);
      assert.ok(mutations.every(request => request.startsWith('POST ')));
      await back(page);
      await expect(chat).toHaveCount(0);
      await expect(page.getByRole('button', { name: '打开与Official的私信' })).toBeVisible();
      await page.getByRole('button', { name: '清屏（仅本机）', exact: true }).click();
      await expect(page.locator('[data-conversation]')).toHaveCount(0);
      await back(page);
      await expect(page.getByRole('button', { name: '历史战绩', exact: true })).toBeVisible();
      await page.reload();
      await openChatList(page);
      await expect(page.locator('[data-conversation]')).toHaveCount(0);
      await page.getByRole('button', { name: '已隐藏会话 (1)' }).click();
      await page.getByRole('button', { name: '打开与Official的私信' }).click();
      await expect(chat.getByText('Original incoming', { exact: true })).toBeVisible();
      records.push({ ...records[0], id: 'new-after-clear', content: 'New visible', createdAt: 1000 });
      await expect(chat.getByText('New visible', { exact: true })).toBeVisible({ timeout: 10000 });
      await expect(chat.getByText('Original incoming', { exact: true })).toBeVisible();
      await page.setViewportSize({ width, height: 420 });
      await expect.poll(async () => Math.round((await chat.boundingBox())!.height)).toBe(420);
      const inputBox = (await input.boundingBox())!;
      assert.ok(inputBox.y + inputBox.height <= 420);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.equal(await page.evaluate(() => localStorage.getItem('existing_message_history')), 'KEEP HISTORY');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
}

test('left swipe, keyboard alternative, reload, resurfacing, unread and account isolation', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 360, height: 814 }, isMobile: true, hasTouch: true });
  try {
    const { records, mutations } = await fixture(page);
    await openChatList(page);
    const row = page.locator('[data-conversation="Official"]');
    await expect(row.locator('[data-unread-count="1"]')).toBeVisible();
    const box = (await row.boundingBox())!;
    const touch = await page.context().newCDPSession(page);
    const startX = box.x + box.width - 80, endX = box.x + 40, y = box.y + 35;
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
    for (let step = 1; step <= 12; step++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + (endX - startX) * step / 12, y }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await expect(page.locator('.chat-screen')).toHaveCount(0);
    const remove = page.getByRole('button', { name: '删除与Official的会话（仅本机隐藏）', exact: true });
    await expect(remove).toBeVisible();
    await page.screenshot({ path: join(screenshots, 'swipe-360.png') });
    await remove.click();
    await expect(row).toHaveCount(0);
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('catan_read_msgs_Player') || '[]')), ['incoming']);
    await page.reload();
    await openChatList(page);
    await expect(row).toHaveCount(0);
    records.push({ ...records[0], id: 'new-after-hide', content: 'Unread arrival', createdAt: 1000 });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(row.locator('[data-unread-count="1"]')).toBeVisible();
    await row.getByRole('button', { name: 'Official的会话操作' }).focus();
    await page.keyboard.press('Enter');
    await expect(remove).toBeVisible();
    await remove.focus();
    await page.keyboard.press('Enter');
    await expect(row).toHaveCount(0);
    await page.evaluate(() => (window as any).testRenderProfile({ id: 'other-id', username: 'Other', role: 'user' }));
    await expect(page.getByRole('button', { name: '打开与Official的私信' })).toBeVisible();
    await page.evaluate(() => (window as any).testRenderProfile({ id: 'player-id', username: 'Player', role: 'user' }));
    await expect(row).toHaveCount(0);
    await page.getByRole('button', { name: '已隐藏会话 (1)' }).click();
    await row.getByRole('button', { name: '打开与Official的私信' }).click();
    await expect(page.locator('.chat-screen').getByText('Original incoming', { exact: true })).toBeVisible();
    assert.equal(records.length, 4);
    assert.deepEqual(mutations, []);
  } finally { await page.close(); }
});

test('admin can hide empty roster cards and clear the list without touching another account', { timeout: 60000 }, async () => {
  const page = await browser.newPage({ viewport: { width: 393, height: 852 } });
  try {
    const { records, mutations } = await fixture(page, true);
    await openChatList(page);
    const empty = page.locator('[data-conversation="Empty"]');
    await empty.getByRole('button', { name: 'Empty的会话操作' }).click();
    await empty.getByRole('button', { name: '删除与Empty的会话（仅本机隐藏）' }).click();
    await page.reload();
    await openChatList(page);
    await expect(empty).toHaveCount(0);
    records.push({ ...records[1], id: 'empty-first', senderName: 'Empty', senderId: 'empty-id', content: 'First from Empty' });
    await expect(empty).toBeVisible({ timeout: 10000 });
    await expect(empty.locator('[data-unread-count="1"]')).toBeVisible();
    await page.getByRole('button', { name: '打开与Player的私信' }).click();
    await expect(page.locator('.chat-screen').getByText('Original incoming', { exact: true })).toBeVisible();
    await back(page);
    await page.getByRole('button', { name: '清屏（仅本机）', exact: true }).click();
    await expect(page.locator('[data-conversation]')).toHaveCount(0);
    await page.getByRole('button', { name: '已隐藏会话 (2)' }).click();
    await page.getByRole('button', { name: '打开与Empty的私信' }).click();
    await expect(page.locator('.chat-screen').getByText('First from Empty', { exact: true })).toBeVisible();
    await back(page);
    await page.evaluate(() => (window as any).testRenderProfile({ id: 'player-id', username: 'Player', role: 'user' }));
    await page.getByRole('button', { name: '打开与Official的私信' }).click();
    await expect(page.locator('.chat-screen').getByText('Original incoming', { exact: true })).toBeVisible();
    assert.deepEqual(mutations, []);
    assert.equal(records.length, 4);
  } finally { await page.close(); }
});
