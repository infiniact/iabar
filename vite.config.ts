import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.config'

// The wasm-pack `--target web` glue (src/wasm/iabar_wasm.js) loads the .wasm
// via `new URL('…_bg.wasm', import.meta.url)`, which Vite resolves through its
// asset pipeline; @crxjs emits it as a web-accessible resource. No dedicated
// wasm plugin is needed for this flow.
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    target: 'esnext',
    rollupOptions: {
      // @crxjs derives inputs from the manifest; nothing extra to declare.
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    // HMR over a fixed port so the service worker reconnects cleanly.
    hmr: { port: 5173 },
  },
})
