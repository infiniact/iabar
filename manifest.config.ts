import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json' with { type: 'json' }

// Store builds omit the pinned `key` so the Chrome Web Store assigns the
// official production id. Set by `pnpm build:store`.
const STORE_BUILD = process.env.IABAR_STORE === '1'

// MV3 manifest. The agent lives in the side panel (a normal extension page,
// where WebAssembly is allowed once we grant 'wasm-unsafe-eval').
//
// Permission model — ADR 0009: NO `<all_urls>` content script and NO
// `<all_urls>` host permission. Page context is read only when the user
// `@`-references a tab, via `chrome.permissions.request` (per-origin, user
// gesture) + `chrome.scripting.executeScript` on demand. The only static host
// permission is the narrow LLM API endpoint.
export default defineManifest({
  manifest_version: 3,
  name: 'IABar — A real AI agent, right in your browser',
  version: pkg.version,
  description: pkg.description,

  // Pinned public key → a STABLE extension id across reloads / machines /
  // re-installs (id = obnegfbdllkgcmchabhaomkdgceaelik). Without it, an
  // unpacked extension's id is derived from its path and every load can look
  // like a fresh install (losing chrome.storage, granted permissions, etc.).
  // This is the public half only; the private `key.pem` is gitignored. The
  // store build omits it (see STORE_BUILD) so the Web Store assigns the prod id.
  ...(STORE_BUILD
    ? {}
    : {
        key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvkLIUPAKIJXJNQmQU+mUOYj+lr/WD6IxYaZHSOvkcMDy88JUhbIgIatskmVkzEvYk2gK/JDcNAQbmnbaMFJydQIcJtndzYTJ0qvq66bebHK0tGoUFvQXjDShNDU7FWGBReS2o9gMWdcSPFPsiYXsGTo5KErrHy4hnTdBXWeosNsNM8/23UalEB9xfdOrXmv/5oklc3IaIwtdbTqgs1vggAM+Vroxr8rkKgwrEgBmGhluvPKMFYivse74dGPezzdtXcdLEiJi4tw4j7yGc58p4gIYssdiMI+qGfPtGGetj+e4V7GZONW6sJj+/IVjeHioM/F/O8H6K7bDHgOHYGTjMQIDAQAB',
      }),

  // Side panel hosts the chat UI and the wasm harness.
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Open IABar',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  // `tabs` lets the @-picker list other tabs' title/url; `scripting` injects
  // the page-context extractor on demand; `activeTab` is the fast path for the
  // tab the user invoked on. No content_scripts — nothing runs on pages by
  // default.
  permissions: ['sidePanel', 'activeTab', 'tabs', 'scripting', 'storage'],
  // Narrow: only the LLM provider endpoints (bypasses CORS). Not <all_urls>.
  // One entry per supported provider's API host (see PROVIDERS in lib/store.ts).
  host_permissions: [
    'https://api.anthropic.com/*',
    'https://api.deepseek.com/*',
    'https://api.openai.com/*',
    'https://openrouter.ai/*',
    'https://api.moonshot.cn/*',
    'https://api.z.ai/*',
    'https://dashscope.aliyuncs.com/*',
    'https://api.minimaxi.com/*',
    'https://ark.cn-beijing.volces.com/*',
    'https://generativelanguage.googleapis.com/*',
    // iakms license server (see src/lib/license/config.ts — keep in sync).
    'http://127.0.0.1:8080/*',
  ],
  // Page access is requested at runtime, per origin, when the user @-references
  // a tab (ADR 0009). Nothing is granted up front.
  optional_host_permissions: ['*://*/*'],

  // 'wasm-unsafe-eval' is required to instantiate the AI agent wasm module in
  // the side panel page.
  content_security_policy: {
    extension_pages:
      "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
})
