import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const ENTRY_CHUNK_LIMIT = 200 * 1024;
const ASYNC_CHUNK_LIMIT = 600 * 1024;

function bundleBudget(): Plugin {
  return {
    name: 'bundle-budget',
    apply: 'build',
    // Vite adds preload imports late; measure final UTF-8 bytes, not characters.
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const output of Object.values(bundle)) {
          if (output.type !== 'chunk') continue;
          const limit = output.isEntry ? ENTRY_CHUNK_LIMIT : ASYNC_CHUNK_LIMIT;
          const bytes = Buffer.byteLength(output.code, 'utf8');
          if (bytes > limit) {
            this.error(`${output.fileName} is ${(bytes / 1024).toFixed(1)} KiB; budget is ${(limit / 1024).toFixed(0)} KiB`);
          }
        }
      }
    }
  };
}

export default defineConfig({
  plugins: [svelte(), bundleBudget()],
  base: '/cookie-cutter-designer/',
  preview: {
    allowedHosts: ['cookie-cutter-dev.tail218fe6.ts.net']
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          // Keep optional loaders/exporters/controls separate from the shared engine.
          if (normalizedId.includes('/node_modules/three/examples/')) return 'three-addons';
          if (normalizedId.includes('/node_modules/three/')) return 'three-vendor';
          // Shared UI runtime is independently cacheable across app and lazy panels.
          if (normalizedId.includes('/node_modules/svelte/')) return 'svelte-vendor';
        }
      }
    }
  }
});
