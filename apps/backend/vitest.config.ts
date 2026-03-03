import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // walletService.test.ts is documentation-only (no runnable suites) — skip it
    exclude: ['src/services/walletService.test.ts'],
  },
});
