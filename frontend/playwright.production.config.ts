import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e-production',
  workers: 1,
  use: {
    baseURL: process.env.PRODUCTION_BASE_URL,
    ignoreHTTPSErrors: true,
    headless: true,
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    launchOptions: { args: ['--ignore-certificate-errors'] },
  },
})
