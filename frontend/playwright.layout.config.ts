import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'calendar-modes.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:18175',
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 18175 --strictPort',
    url: 'http://127.0.0.1:18175',
    reuseExistingServer: false,
  },
})
