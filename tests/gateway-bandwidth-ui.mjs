import { createServer } from 'vite';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const server = await createServer({ server: { port: 0, host: '127.0.0.1', hmr: false } });
await server.listen();
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const config = { enabled: false, fallback: 'https://skot-game01.onrender.com',
  sites: { early: 'https://skot-game01.onrender.com', middle: 'https://skot-game02.onrender.com', late: 'https://skot-game03.onrender.com' },
  bandwidth: { enabled: true, quotaGB: 5, reserveGB: 0.7 } };
try {
  await mkdir('test-results-bandwidth', { recursive: true });
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on('pageerror', error => console.error(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    await page.route('**/api/admin/gateway', route => route.fulfill({ json: { configured: true, gatewayUrl: 'https://example.workers.dev', config } }));
    await page.route('**/api/admin/gateway/bandwidth', route => route.fulfill({ json: { target: { origin: config.sites.middle }, snapshot: {
      rows: Object.values(config.sites).map((origin, i) => ({ id: `srv-${i}`, origin, usedGB: i ? 1.1 : 4.4, observedGB: 1.1,
        complete: i !== 2, healthy: true, checkedAt: Date.now(), measuredAt: Date.now() - 3600000 })),
    } } }));
    await page.route('**/bandwidth-preview', async route => route.fulfill({ contentType: 'text/html', body: await server.transformIndexHtml('/bandwidth-preview', `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="root" style="max-width:800px;padding:16px;margin:auto"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      const React = (await import('react')).default;
      const {createRoot} = await import('react-dom/client');
      const {GatewaySettings} = await import('/src/components/GatewaySettings.tsx');
      import '/src/index.css';
      createRoot(document.getElementById('root')).render(React.createElement(GatewaySettings));
      </script></body></html>`) }));
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/bandwidth-preview`);
    await page.getByText('当前选中', { exact: false }).waitFor();
    assert.equal(await page.getByLabel('切换方式').inputValue(), 'bandwidth');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `test-results-bandwidth/admin-${width}.png`, fullPage: true });
    await page.close();
  }
  console.log('Mobile and desktop bandwidth UI passed');
} finally {
  await browser.close();
  await server.close();
}
