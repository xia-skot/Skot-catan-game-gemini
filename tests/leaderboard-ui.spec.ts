import { test, expect, type Page } from '@playwright/test';

async function openProfile(page: Page, admin = false) {
  await page.goto(admin ? '/?demoRole=admin' : '/');
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '排行榜', exact: true })).toBeVisible();
}

async function openAdminSection(page: Page, section: '玩家名单' | '系统设置') {
  await page.getByRole('heading', { name: '管理中心', exact: true }).click();
  await page.getByRole('heading', { name: section, exact: true }).click();
  return page.locator(`[data-admin-section="${section === '玩家名单' ? 'users' : 'system'}"]`);
}

test.beforeEach(async ({ request }) => { await request.post('/api/demo/reset'); });

test('profile monthly board shows real demo results, calendar selection, empty state and back', async ({ page }, info) => {
  await openProfile(page);
  await page.getByRole('heading', { name: '排行榜', exact: true }).click();
  const board = page.locator('[data-leaderboard]');
  await expect(board.locator('tbody tr').first()).toBeVisible();
  await expect(board.getByText('北京时间 · 前 20 名')).toBeVisible();
  await expect(board.getByRole('button', { name: '下个月', exact: true })).toBeDisabled();
  const currentMonth = await board.getByLabel('排行榜月份').inputValue();
  const bounds = await board.boundingBox();
  const table = await board.locator('table').boundingBox();
  expect(table!.x + table!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1);
  await page.screenshot({ path: info.outputPath('leaderboard.png'), fullPage: true });
  await board.getByLabel('排行榜月份').fill('2000-01');
  await expect(board.getByText('本月暂无可计分战绩')).toBeVisible();
  await expect(board.getByRole('button', { name: '上个月', exact: true })).toBeDisabled();
  await board.getByLabel('排行榜月份').fill(currentMonth);
  await expect(board.locator('tbody tr').first()).toBeVisible();
  await board.getByRole('button', { name: '返回', exact: true }).click();
  await expect(page.getByRole('heading', { name: '历史战绩', exact: true })).toBeVisible();
  await expect(page.locator('.lobby-tab-bar')).toBeVisible();
});

test('leaderboard fetch failure offers retry and does not leave stale rows', async ({ page }) => {
  await openProfile(page);
  await page.route('**/api/leaderboard?*', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '排行榜暂时不可用，请稍后重试' }) }));
  await page.getByRole('heading', { name: '排行榜', exact: true }).click();
  const board = page.locator('[data-leaderboard]');
  await expect(board.getByRole('alert')).toContainText('排行榜暂时不可用');
  await expect(board.locator('tbody tr')).toHaveCount(0);
  await page.unroute('**/api/leaderboard?*');
  await board.getByRole('button', { name: '重试', exact: true }).click();
  await expect(board.locator('tbody tr').first()).toBeVisible();
  await expect(board.getByRole('alert')).toHaveCount(0);
});

test('admin player list sorts all four fields in both directions', async ({ page }, info) => {
  await openProfile(page, true);
  const panel = await openAdminSection(page, '玩家名单');
  const players: any[] = await page.evaluate(async () => {
    const response = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${localStorage.getItem('catan_auth_token')}` } });
    return (await response.json()).allUsers;
  });
  await expect(panel.locator('[data-admin-player]')).toHaveCount(players.length);
  for (const field of ['createdAt', 'winRate', 'totalGames', 'recent3DayGames']) {
    await panel.getByLabel('玩家排序字段').selectOption(field);
    for (const direction of ['desc', 'asc']) {
      const values = await panel.locator('[data-admin-player]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-admin-player')));
      const ordered = values.map(id => players.find(player => player._id === id)).map(player => field === 'createdAt' ? new Date(player[field]).getTime() : player[field]);
      expect(ordered.every(Number.isFinite)).toBe(true);
      expect(ordered).toEqual([...ordered].sort((left, right) => direction === 'desc' ? right - left : left - right));
      await panel.getByRole('button', { name: direction === 'desc' ? '降序，切换为升序' : '升序，切换为降序', exact: true }).click();
    }
  }
  await expect(panel.getByText(/近3天对局/).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('admin-player-sorting.png'), fullPage: true });
});

test('admin display count saves, survives reload and limits the profile board', async ({ page }) => {
  await openProfile(page, true);
  let panel = await openAdminSection(page, '系统设置');
  const count = panel.getByLabel('显示人数');
  await expect(count).toBeEnabled();
  await expect(count).toHaveValue('20');
  await count.fill('101');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  expect(await count.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
  await count.fill('1');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('已保存');
  await openProfile(page, true);
  panel = await openAdminSection(page, '系统设置');
  await expect(panel.getByLabel('显示人数')).toHaveValue('1');
  await openProfile(page, true);
  await page.getByRole('heading', { name: '排行榜', exact: true }).click();
  const board = page.locator('[data-leaderboard]');
  await expect(board.locator('tbody tr')).toHaveCount(1);
  await expect(board.getByText('北京时间 · 前 1 名')).toBeVisible();
});
