// ABOUTME: Vitest config for unit tests only.
// ABOUTME: Excludes integration, live (E2E), and smoke tests.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/dist/**',
      '**/node_modules/**',
      '**/integration/**',
      '**/live/**',
      '**/smoke/**',
    ],
  },
});
