import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173' + (process.env['TEST_SUBPATH'] ?? '/'),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(process.env['CI'] ? {} : { channel: 'chrome' }) },
    },
  ],
  webServer: {
    command: 'node scripts/test-server.mjs',
    url: 'http://localhost:4173' + (process.env['TEST_SUBPATH'] ?? '/'),
    reuseExistingServer: !process.env['CI'],
  },
});
