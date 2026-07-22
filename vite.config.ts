import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const ENTRY_CHUNK_LIMIT = 200 * 1024;
const ASYNC_CHUNK_LIMIT = 600 * 1024;

function bundleBudget(): Plugin {
  return {
    name: 'bundle-budget',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;

        const limit = output.isEntry ? ENTRY_CHUNK_LIMIT : ASYNC_CHUNK_LIMIT;
        if (output.code.length > limit) {
          const actualKiB = (output.code.length / 1024).toFixed(1);
          const limitKiB = (limit / 1024).toFixed(0);
          this.error(`${output.fileName} is ${actualKiB} KiB; budget is ${limitKiB} KiB`);
        }
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), bundleBudget()],
  base: '/cookie-cutter-designer/',
  preview: {
    allowedHosts: ['cookie-cutter-dev.tail218fe6.ts.net']
  },
  build: {
    // Three.js and the Clipper WASM runtime are isolated, cached async dependencies.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/three/')) return 'three-vendor';
        }
      }
    }
  }
});
