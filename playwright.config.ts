import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync(edge) ? edge : undefined);
const baseURL = `http://127.0.0.1:${process.env.DEMO_PORT || 5174}`;
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 60000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node --import tsx server.ts --demo', url: `${baseURL}/api/demo/session`, reuseExistingServer: true },
  projects: [
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 }, launchOptions: { executablePath: chromium } } },
    { name: 'android', use: { ...devices['Pixel 7'], viewport: { width: 360, height: 814 }, launchOptions: { executablePath: chromium } } },
    { name: 'iphone', use: { ...devices['iPhone 13'], viewport: { width: 393, height: 852 } } },
  ],
});
