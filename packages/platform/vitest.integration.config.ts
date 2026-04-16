// ABOUTME: Vitest config for platform integration tests.
// ABOUTME: Creates a Neon branch via globalSetup, runs sequentially against the branch.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    globalSetup: ['test/integration/setup.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
