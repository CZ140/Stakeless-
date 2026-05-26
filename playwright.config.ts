import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive a real browser against the full stack (Vite SPA → Express
// API → Postgres). Locally they reuse an already-running `pnpm dev`; in CI they
// start it themselves (the e2e job provisions Postgres + env first).
const PORT = 5173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev', // backend (:3000) + frontend (:5173)
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
