import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, retries: 0,
  timeout: 30000,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'output/playwright/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:4320', locale: 'zh-CN', timezoneId: 'Asia/Shanghai', colorScheme: 'light',
    viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure',
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  },
});
