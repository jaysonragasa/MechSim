import { defineConfig } from 'vite';

// Vite serves the app from the project root. `npm run dev` starts the dev
// server (hot reload); `npm run build` produces a static bundle in /dist.
export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    open: true
  },
  build: {
    outDir: 'dist',
    target: 'es2020'
  }
});
