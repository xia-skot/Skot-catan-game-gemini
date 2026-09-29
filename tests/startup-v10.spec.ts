import { test, expect } from '@playwright/test';

test('loading layout stays fixed and 100 percent waits for account readiness', async ({ page }, info) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/me', async route => { await gate; await route.continue(); });
  await page.route('**/assets/audio/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto('/');
  const meter = page.getByRole('progressbar', { name: '资源加载' });
  await expect(meter).toBeVisible();
  const before = (await meter.boundingBox())!;
  await expect(meter).toHaveAttribute('aria-valuenow', '98', { timeout: 30000 });
  await expect(page.getByText('正在准备游戏…')).toBeVisible();
  await page.waitForTimeout(700);
  await expect(meter).toHaveAttribute('aria-valuenow', '98');
  expect(Math.abs((await meter.boundingBox())!.y - before.y)).toBeLessThan(1);
  const width = (await meter.boundingBox())!.width;
  expect(Math.abs((await meter.locator(':scope > div').boundingBox())!.width - width * .98)).toBeLessThan(1);
  await page.screenshot({ path: info.outputPath('waiting-account.png') });
  release();
  await expect(page.locator('[data-startup]')).toHaveAttribute('data-startup', 'sailing');
  const hiddenMeter = page.locator('.startup-meter');
  await expect(hiddenMeter).toHaveAttribute('aria-valuenow', '100');
  expect(Math.abs((await hiddenMeter.locator(':scope > div').boundingBox())!.width - width)).toBeLessThan(1);
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 10000 });
});
