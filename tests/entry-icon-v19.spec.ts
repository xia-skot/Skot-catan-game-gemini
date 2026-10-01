import { test, expect } from '@playwright/test';
import { createServer, entryConfig } from '../render-entry/server.js';

test('entry advertises a transparent full-resolution logo without changing the game frame', async ({ page }, info) => {
  const server = createServer({
    config: entryConfig({ FALLBACK_GAME_URL: 'https://skot-game01.onrender.com' }),
    fetcher: async () => Response.json({ slot: 'early', origin: 'https://skot-game01.onrender.com' }),
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await page.route('https://skot-game01.onrender.com/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Game frame</p>' }));
    await page.goto(base);
    await expect(page).toHaveURL(`${base}/`);
    await expect(page.locator('iframe')).toHaveAttribute('src', 'https://skot-game01.onrender.com/');
    const manifest = await (await page.request.get(`${base}/manifest.json`)).json();
    const result = await page.evaluate(async (manifest) => {
      const image = new Image();
      image.src = manifest.icons[0].src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 512;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, 512, 512).data;
      let darkPixels = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 100 && pixels[i + 1] < 130) darkPixels++;
      return { width: image.naturalWidth, height: image.naturalHeight, count: manifest.icons.length, darkPixels,
        cornerAlpha: pixels[3], centerAlpha: pixels[(256 * 512 + 256) * 4 + 3] };
    }, manifest);
    expect(result.width).toBe(512);
    expect(result.height).toBe(512);
    expect(result.count).toBe(1);
    expect(result.darkPixels).toBeGreaterThan(10000);
    expect(result.cornerAlpha).toBe(0);
    expect(result.centerAlpha).toBeGreaterThan(200);
    await page.goto(`${base}/catan-icon-v19-512.png`);
    await page.screenshot({ path: info.outputPath('entry-logo.png') });
  } finally {
    await page.goto('about:blank');
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
