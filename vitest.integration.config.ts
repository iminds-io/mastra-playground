// ABOUTME: Root vitest integration config — delegates to platform package's globalSetup
// ABOUTME: which creates a Neon branch and runs migrations before the test run.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/integration/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/live/**', '**/smoke/**'],
    globalSetup: ['packages/platform/test/integration/setup.ts'],
    setupFiles: ['packages/platform/test/integration/setup-env.ts'],
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
