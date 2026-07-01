// Per-origin runtime permission grants (ADR 0009).
//
// IABar holds no `<all_urls>` host permission. Any access to a site — reading a
// referenced tab, or reaching a user-supplied remote endpoint (e.g. an MCP
// server) — is granted per origin, at runtime, inside a user gesture. This
// module is the transport-agnostic core: it only grants/checks/revokes the
// origin. What you do with the grant (inject a script, `fetch` past CORS) lives
// in the caller.

/** The `chrome.permissions` origin pattern for a URL's origin (scheme+host+port). */
export function originPattern(url: string): string {
  return `${new URL(url).origin}/*`
}

/**
 * Request access to a URL's origin. **Must be called from a user gesture** so
 * the permission prompt is allowed. Resolves true if granted.
 */
export async function grantOrigin(url: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [originPattern(url)] })
}

/** Whether a URL's origin is already granted — silent, no prompt, no gesture. */
export async function hasOrigin(url: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [originPattern(url)] })
}

/** Revoke a previously granted origin pattern (e.g. `https://x.com/*`). */
export async function revokePattern(pattern: string): Promise<boolean> {
  return chrome.permissions.remove({ origins: [pattern] })
}

/** Revoke a previously granted origin (e.g. removing a trusted MCP server). */
export async function revokeOrigin(url: string): Promise<boolean> {
  return revokePattern(originPattern(url))
}

/**
 * The origin patterns the user has granted at runtime — i.e. everything granted
 * *minus* the static `host_permissions` baked into the manifest (LLM API hosts,
 * license server), which are always present and must not be revocable. Read the
 * static set from the live manifest so this never drifts from the source.
 */
export async function listGrantedOrigins(): Promise<string[]> {
  const [{ origins = [] }, manifest] = [
    await chrome.permissions.getAll(),
    chrome.runtime.getManifest(),
  ]
  const staticOrigins = new Set(manifest.host_permissions ?? [])
  return origins.filter((o) => !staticOrigins.has(o)).sort()
}
