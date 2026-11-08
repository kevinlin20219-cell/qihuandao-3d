import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000,
    rollupOptions: { input: { main: 'index.html', viewer: 'viewer.html' } },
  },
});
