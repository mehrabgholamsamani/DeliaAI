import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    watch: {
      // Docker Desktop bind mounts inside OneDrive can drop native file events.
      usePolling: true,
      interval: 300
    },
    proxy: {
      '/api': apiTarget,
      '/socket.io': { target: apiTarget, ws: true }
    }
  }
});
