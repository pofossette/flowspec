import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.PLAYWRIGHT_WEB_PORT ?? 5174);
const API_PORT = Number(process.env.PLAYWRIGHT_API_PORT ?? 5176);
const WEB_BASE = `http://127.0.0.1:${WEB_PORT}`;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: WEB_BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `pnpm --filter flowspec exec node ./dist/run.js flow serve --dir ./e2e/.tmp-flowspec --port ${API_PORT} --host 127.0.0.1`,
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      stdout: 'pipe',
    },
    {
      command: `pnpm --filter @flowspec/web-app exec vite preview --port ${WEB_PORT} --host 127.0.0.1 --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
  outputDir: 'test-results',
});
