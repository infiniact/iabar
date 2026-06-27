import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

// MV3 manifest. The agent lives in the side panel (a normal extension page,
// where WebAssembly is allowed once we grant 'wasm-unsafe-eval'). A content
// script reads the active page so the harness has page context to work with.
export default defineManifest({
  manifest_version: 3,
  name: 'iabar — iacoder in your browser',
  version: pkg.version,
  description: pkg.description,

  // Side panel hosts the chat UI and the wasm harness.
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  action: {
    default_title: 'Open iabar',
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],

  permissions: ['sidePanel', 'activeTab', 'scripting', 'storage'],
  host_permissions: ['<all_urls>'],

  // 'wasm-unsafe-eval' is required to instantiate the iacoder wasm module in
  // the side panel page.
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
})
