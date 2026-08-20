import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-web',
  },
  server: {
    // Dev server runs on 5173 and proxies API calls to the TRACE API server
    // (default port 3000). Run `npm run server` alongside `npm run dev`.
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
