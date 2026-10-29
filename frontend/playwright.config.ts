import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:18173',
    headless: true,
    viewport: { width: 1440, height: 1000 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: '../backend/.venv/bin/python ../scripts/e2e_server.py',
      url: 'http://127.0.0.1:18174/api/v1/health',
      env: { APP_ORIGIN: 'http://localhost:18173', E2E_API_PORT: '18174' },
      timeout: 60000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -- --port 18173 --strictPort',
      url: 'http://localhost:18173',
      env: { API_TARGET: 'http://127.0.0.1:18174' },
      timeout: 30000,
      reuseExistingServer: false,
    },
  ],
})
