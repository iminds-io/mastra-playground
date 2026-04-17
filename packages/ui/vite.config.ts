// ABOUTME: Vite/Vitest configuration for the @hono-workspace/ui package
// ABOUTME: Runs component tests in jsdom environment

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
