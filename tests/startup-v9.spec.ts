import { test, expect } from '@playwright/test';

test('one startup scene survives delayed program and account loading without resetting', async ({ page }) => {
  await page.route('**/src/App.tsx', async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.route('**/api/me', async route => {
    await new Promise(resolve => setTimeout(resolve, 1800));
    await route.continue();
  });
  await page.goto('/');
  const startup = page.locator('[data-startup]');
  await expect(startup).toBeVisible();
  await startup.evaluate(element => {
    (window as any).startupNode = element;
    (window as any).startupSamples = [];
    const sample = () => {
      const current = document.querySelector('[data-startup]');
      if (!current) return;
      (window as any).startupSamples.push({
        same: current === (window as any).startupNode,
        progress: Number(current.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') || 100),
      });
      requestAnimationFrame(sample);
    };
    sample();
  });
  await expect(startup).toHaveAttribute('data-startup', 'sailing', { timeout: 30000 });
  await expect(page.locator('[data-lobby-tabs]')).toBeHidden();
  await expect(startup).toHaveCount(0, { timeout: 10000 });
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible();
  const samples = await page.evaluate(() => (window as any).startupSamples as {same: boolean; progress: number}[]);
  expect(samples.every(sample => sample.same)).toBe(true);
  expect(samples.every((sample, i) => i === 0 || sample.progress >= samples[i - 1].progress)).toBe(true);
  await page.locator('.lobby-tab-bar').getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('button', { name: '退出登录', exact: true }).locator('svg')).toHaveCSS('rotate', '180deg');
});
