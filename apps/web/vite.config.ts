import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'API_PROXY_');

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: process.env.API_PROXY_TARGET ?? environment.API_PROXY_TARGET ?? 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
