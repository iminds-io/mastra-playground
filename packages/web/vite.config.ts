import { defineConfig, loadEnv } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load non-VITE-prefixed vars so we can read `API_TARGET` for the dev-server
  // proxy without exposing it to the browser bundle.
  const env = loadEnv(mode, '../..', '');
  const apiTarget = env.API_TARGET ?? env.VITE_API_TARGET ?? 'http://localhost:3000';

  return {
    envDir: '../..',
    plugins: [tailwindcss(), react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
