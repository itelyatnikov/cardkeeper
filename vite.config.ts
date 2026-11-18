import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const BUILD = `${pkg.version}-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)}`;

// Stamp the service worker with the build id so every deploy installs a new SW.
const stampSw = (): Plugin => ({
  name: 'stamp-sw',
  apply: 'build',
  closeBundle() {
    const f = 'dist/sw.js';
    writeFileSync(f, readFileSync(f, 'utf8').replaceAll('__BUILD__', BUILD));
  },
});

// base './' so the build works from any sub-path (e.g. GitHub Pages /repo/).
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __APP_BUILD__: JSON.stringify(BUILD) },
  plugins: [react(), stampSw()],
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
});
