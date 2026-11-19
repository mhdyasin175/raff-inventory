import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In normal mode the dev server proxies /api to the ASP.NET Core backend.
// In demo mode (`npm run dev:demo`) the app runs entirely in the browser with seeded data.
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:5080', changeOrigin: true },
    },
  },
});
