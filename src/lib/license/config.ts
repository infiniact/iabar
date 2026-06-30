// KMS (iakms) client configuration.
// Spec: ../../../../iakms/docs/client-integration.md
//
// PLACEHOLDERS — set these per deployment:
//   - KMS_BASE_URL: the iakms server origin. MUST also be added to
//     `host_permissions` in manifest.config.ts (fetch is otherwise blocked).
//   - EMBEDDED_PUBKEYS: the app's signing public key(s) (SEC1 uncompressed
//     point, base64url — i.e. `public_key_b64` from the pubkeys endpoint).
//     Embedding lets the client verify fully offline; if left empty it fetches
//     and caches them from `GET /v1/apps/{APP_ID}/pubkeys` on first use.

/** Application id registered in iakms. */
export const APP_ID = 'iabar'

// Test/dev iakms server. TODO(deploy): swap for the production origin and keep
// in sync with manifest host_permissions.
export const KMS_BASE_URL = 'http://127.0.0.1:8080'

export interface EmbeddedPubKey {
  key_version: number
  /** SEC1 uncompressed point (65 bytes, leading 0x04), base64url. */
  public_key_b64: string
}

// Test server's `iabar` key (key_version 1) — enables fully-offline verify.
// TODO(deploy): replace with the production public key before shipping.
export const EMBEDDED_PUBKEYS: EmbeddedPubKey[] = [
  {
    key_version: 1,
    public_key_b64:
      'BChNc5bMoO93nOfHFOwzi1W44aodI8jdrSnFZZJRn3rgVEqbw0F0oNYfTdhI4ZGI0xAzUEIzkWwQwiCiSju-z98',
  },
]

/** chrome.storage.local key holding the device identity + cached token/watermark. */
export const LICENSE_STORAGE_KEY = 'iabar.license'

/** A human label sent on activate/rebind so the seat is recognizable. */
export const DEVICE_NAME = 'IABar (browser extension)'
