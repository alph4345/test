import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Builds one self-contained HTML file (dist/index.html) that works offline
// by double-clicking it, and can be hosted anywhere.
export default defineConfig({
  base: './',
  plugins: [preact(), viteSingleFile()],
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000 },
  worker: { format: 'es' },
});
