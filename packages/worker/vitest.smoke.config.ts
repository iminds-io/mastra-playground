// ABOUTME: Vitest config for worker smoke tests against a deployed worker.
// ABOUTME: Reads SMOKE_BASE_URL from env — tests use describe.skipIf to no-op when unset.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/smoke/**/*.smoke.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['test/smoke/setup-env.ts'],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
