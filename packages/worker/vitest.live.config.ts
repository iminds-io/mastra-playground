// ABOUTME: Vitest config for worker E2E (live) tests.
// ABOUTME: Expects WORKER_BASE_URL env var — set by the run-e2e.mjs orchestrator.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/live/**/*.e2e.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
});
