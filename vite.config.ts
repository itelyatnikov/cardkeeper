import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works from any sub-path (e.g. GitHub Pages /repo/).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
});
