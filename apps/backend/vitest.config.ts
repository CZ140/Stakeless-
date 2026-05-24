import { defineConfig } from 'vitest/config';

// Integration tests run against a real, dedicated Postgres database
// (`gambling_test`). globalSetup creates + migrates it; each test truncates.
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/gambling_test';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // walletService.test.ts is documentation-only (no runnable suites) — skip it
    exclude: ['src/services/walletService.test.ts'],
    globalSetup: ['./test/globalSetup.ts'],
    // Integration tests share one database and truncate between tests, so files
    // must not run in parallel workers.
    fileParallelism: false,
    // Self-contained env so the suite does not depend on a developer .env. env.ts
    // loads .env via dotenv, which never overrides values already set here.
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-test-jwt-secret-test-jwt-secret',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '587',
      SMTP_USER: 'test',
      SMTP_PASS: 'test',
      SMTP_FROM: 'test@test.local',
    },
  },
});
