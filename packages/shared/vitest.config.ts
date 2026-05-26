import { defineConfig } from 'vitest/config';

// Pure-math unit + property tests for the shared game logic. No DB, no DOM — the
// functions under test are deterministic, so these run in plain Node.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
