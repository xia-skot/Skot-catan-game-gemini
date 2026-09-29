import { test, expect } from '@playwright/test';
import manifest from '../src/assetManifest.json' with { type: 'json' };

test('startup accepts a BGM download slower than the former 12 second deadline', async ({ page }) => {
  const bgm = Object.values(manifest.audio).find(path => path.includes('e74476e735256a80'))!;
  const failures: string[] = [];
  page.on('requestfailed', request => { if (request.url().includes(bgm)) failures.push(request.failure()?.errorText || 'failed'); });
  await page.route(`**${bgm}`, async route => {
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve, 13500));
    await route.fulfill({ response });
  });
  await page.goto('/');
  await expect(page.locator('[data-lobby-tabs]')).toBeVisible({ timeout: 45000 });
  expect(failures).toEqual([]);
  await expect(page.getByRole('button', { name: '重试未完成资源', exact: true })).toHaveCount(0);
});
