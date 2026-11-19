import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.VITE_DEV_API ?? 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Same-origin in dev: the browser talks to Vite, Vite forwards WebSockets to the API.
    proxy: {
      '/socket.io': { target: API, ws: true, changeOrigin: true },
      '/healthz': { target: API, changeOrigin: true },
      '/api': { target: API, changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
});
