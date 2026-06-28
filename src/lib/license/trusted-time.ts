// Trusted-time watermark.
//
// The app can't trust the local clock (tamperable) and the browser sandbox has
// no other clock source. But it IS online by nature: every model turn and every
// KMS call is a TLS request whose response carries a server `Date` header — a
// time sample the user can't forge. We fold those into a monotonic watermark
// and use it (not `Date.now()`) as the clock for license/trial verification.
//
// This is passive: we only read `Date` headers that providers already send — no
// active clock sync, no probing/comparing the system time. Using the app
// advances trusted time, so a tampered local clock can't extend a trial.

const KEY = 'iabar.trustedTime'

// In-memory monotonic mirror so the hot path (recording on every response) is
// sync and race-free; persistence is fire-and-forget.
let watermark = 0

/** Load the persisted watermark once at startup. */
export async function initTrustedTime(): Promise<void> {
  const v = await chrome.storage?.local.get(KEY)
  const stored = v?.[KEY] as number | undefined
  if (typeof stored === 'number' && stored > watermark) watermark = stored
}

/** Record a provider/KMS response `Date` header. Only advances, never rewinds. */
export function recordServerDate(dateHeader: string | null | undefined): void {
  if (!dateHeader) return
  const t = Math.floor(Date.parse(dateHeader) / 1000)
  if (!Number.isFinite(t) || t <= watermark) return
  watermark = t
  void chrome.storage?.local.set({ [KEY]: t })
}

/** Highest trusted server time seen (Unix seconds); 0 before any server contact. */
export function trustedNow(): number {
  return watermark
}
