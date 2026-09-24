import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Запросы к backend в режиме разработки: браузер → Vite → http://localhost:8787
    proxy: { '/api': { target: process.env.QUTQAR_API_PROXY ?? 'http://localhost:8787', changeOrigin: true } },
  },
});
