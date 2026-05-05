import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  // Each test launches a real Electron process — keep timeout generous
  timeout: 60000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Run tests sequentially: parallel Electron launches on CI are flaky
  workers: 1,
  use: {
    trace: 'on-first-retry',
    video: 'on-first-retry'
  },
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.test.ts'
    }
  ],
  outputDir: 'test-results/'
});
