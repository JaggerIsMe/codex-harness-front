import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  use: {
    channel: process.env.HARNESS_E2E_CHANNEL || undefined,
    baseURL: 'http://127.0.0.1:18011',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  webServer: process.env.HARNESS_E2E_EXTERNAL_SERVER
    ? undefined
    : {
        command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 18011 --strictPort',
        url: 'http://127.0.0.1:18011',
        reuseExistingServer: !process.env.CI,
      },
})
