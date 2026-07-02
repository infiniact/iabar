// iakms client: device identity, the online activate/renew/rebind calls, and
// offline token verification. Mirrors the flow in iakms's client-integration.md.
//
// The verify path is fully offline (WebCrypto over the embedded/cached pubkey);
// the network calls are plain JSON POSTs and only needed to obtain/refresh a
// token. The rollback watermark (max issued_at) is persisted alongside the
// token so a clock rollback can't replay an older token.

import {
  APP_ID,
  CHECKOUT_EMBED_URL,
  CHECKOUT_POLICY,
  CHECKOUT_URL,
  DEVICE_NAME,
  EMBEDDED_PUBKEYS,
  KMS_BASE_URL,
  LICENSE_STORAGE_KEY,
} from './config'
import { TokenError, verifyToken, type TokenClaims } from './token'
import { recordServerDate, trustedNow } from './trusted-time'

export type LicenseStatus = 'unlicensed' | 'active' | 'expired' | 'invalid'

export interface LicenseState {
  status: LicenseStatus
  claims?: TokenClaims
  /** Present when status is 'invalid'/'expired' — the failing reason. */
  error?: string
}

interface PubKey {
  key_version: number
  public_key_b64: string
}

/** Persisted device identity + cached token/watermark/pubkeys. */
interface LicenseCache {
  /** End-side generated, persisted UUIDv4 — the stable License binding id. */
  deviceUuid: string
  /** Hardware-ish fingerprint. No real HW id in the browser, so a persisted
   *  random value; the server only stores its hash (anti token-copy). */
  fingerprint: string
  licenseKey?: string
  token?: string
  /** Signed-in account email (set by email-OTP login) — the session identity. */
  email?: string
  /** Whether the session survives a browser restart (the "keep logged in" box). */
  keepLoggedIn?: boolean
  /** Anti clock-rollback watermark: highest issued_at ever accepted. */
  maxIssuedAt: number
  /** Pubkeys fetched from the endpoint when none are embedded. */
  pubkeys?: PubKey[]
}

// Marks the browser session alive; absent after a restart. Used so a session
// that opted out of "keep logged in" ends when the browser closes.
const SESSION_KEY = 'iabar.session'

// Anti-abuse: the device identity is ALSO mirrored to chrome.storage.sync, which
// rides with the user's Chrome profile. So clearing the extension's local data
// or reinstalling doesn't mint a fresh identity (and thus a fresh trial) — we
// recover the same uuid/fingerprint from the synced profile. It's a deterrent,
// not a wall: a user who disables Chrome sync or uses a clean profile still gets
// a new identity, so the server (iakms) stays the real gate (email dedup, IP).
// No new permission and no fingerprinting — it's the same random ids, just kept
// in a place casual "clear data / reinstall" can't reach.
const IDENTITY_KEY = 'iabar.identity'

interface DeviceIdentity {
  deviceUuid: string
  fingerprint: string
}

/** Recover the profile-synced identity, if any. */
async function loadSyncedIdentity(): Promise<DeviceIdentity | null> {
  try {
    const v = await chrome.storage?.sync?.get(IDENTITY_KEY)
    const id = v?.[IDENTITY_KEY] as Partial<DeviceIdentity> | undefined
    if (id?.deviceUuid && id?.fingerprint) {
      return { deviceUuid: id.deviceUuid, fingerprint: id.fingerprint }
    }
  } catch {
    // sync unavailable (not signed in / disabled) — fall through to local-only.
  }
  return null
}

/** Persist the identity to the synced profile store (best-effort). */
async function saveSyncedIdentity(id: DeviceIdentity): Promise<void> {
  try {
    await chrome.storage?.sync?.set({ [IDENTITY_KEY]: id })
  } catch {
    // quota/unavailable — local copy still works for this install.
  }
}

async function loadCache(): Promise<LicenseCache> {
  const v = await chrome.storage?.local.get(LICENSE_STORAGE_KEY)
  const stored = v?.[LICENSE_STORAGE_KEY] as Partial<LicenseCache> | undefined

  // Identity resolution order: local → profile-synced → freshly minted. Only
  // when local has none do we reach for sync (survives reinstall / clear-data),
  // and mint + persist as a last resort.
  let deviceUuid = stored?.deviceUuid
  let fingerprint = stored?.fingerprint
  if (!deviceUuid || !fingerprint) {
    const synced = await loadSyncedIdentity()
    deviceUuid = synced?.deviceUuid || crypto.randomUUID()
    fingerprint = synced?.fingerprint || crypto.randomUUID().replace(/-/g, '')
  }

  const cache: LicenseCache = {
    deviceUuid,
    fingerprint,
    licenseKey: stored?.licenseKey,
    token: stored?.token,
    email: stored?.email,
    keepLoggedIn: stored?.keepLoggedIn,
    maxIssuedAt: stored?.maxIssuedAt ?? 0,
    pubkeys: stored?.pubkeys,
  }
  // First time we resolve an identity for this install: persist to local AND
  // mirror to the synced profile store so future clears/reinstalls recover it.
  if (!stored?.deviceUuid || !stored?.fingerprint) {
    await saveCache(cache)
    await saveSyncedIdentity({ deviceUuid, fingerprint })
  }
  return cache
}

async function saveCache(cache: LicenseCache): Promise<void> {
  await chrome.storage?.local.set({ [LICENSE_STORAGE_KEY]: cache })
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let resp: Response
  try {
    resp = await fetch(`${KMS_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    throw new Error(`Network error: ${String(e)}`)
  }
  recordServerDate(resp.headers.get('date'))
  const text = await resp.text()
  if (!resp.ok) {
    // Surface the server's error code/message when present.
    let msg = `HTTP ${resp.status}`
    try {
      const j = JSON.parse(text) as { error?: string; message?: string }
      msg = j.error || j.message || msg
    } catch {
      if (text) msg = text
    }
    throw new Error(msg)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/** Resolve verify keys: embedded first, else cached, else fetch + cache. */
async function resolveKeys(cache: LicenseCache): Promise<PubKey[]> {
  if (EMBEDDED_PUBKEYS.length) return EMBEDDED_PUBKEYS
  if (cache.pubkeys?.length) return cache.pubkeys
  const resp = await fetch(`${KMS_BASE_URL}/v1/apps/${APP_ID}/pubkeys`)
  recordServerDate(resp.headers.get('date'))
  if (!resp.ok) throw new Error(`pubkeys HTTP ${resp.status}`)
  const keys = (await resp.json()) as PubKey[]
  cache.pubkeys = keys
  await saveCache(cache)
  return keys
}

/** Verify the cached token offline and advance the rollback watermark. */
async function verifyCached(cache: LicenseCache): Promise<LicenseState> {
  if (!cache.token) return { status: 'unlicensed' }
  try {
    const keys = await resolveKeys(cache)
    const claims = await verifyToken(
      cache.token,
      (v) => keys.find((k) => k.key_version === v)?.public_key_b64,
      { expectedDeviceUuid: cache.deviceUuid, nowUnix: trustedNow(), minIssuedAt: cache.maxIssuedAt },
    )
    if (claims.issued_at > cache.maxIssuedAt) {
      cache.maxIssuedAt = claims.issued_at
      await saveCache(cache)
    }
    return { status: 'active', claims }
  } catch (e) {
    if (e instanceof TokenError && e.code === 'expired') {
      return { status: 'expired', error: e.message }
    }
    return { status: 'invalid', error: e instanceof Error ? e.message : String(e) }
  }
}

interface ActivateResp {
  token: string
  key_version: number
  expires_at: number
  max_seats: number
  machines_used: number
}

interface RebindResp {
  license_key: string
  new_recovery_code: string
  token: ActivateResp | string
}

/** Current license state (offline verify of whatever token is cached). */
export async function getLicenseState(): Promise<LicenseState> {
  return verifyCached(await loadCache())
}

/** Stable device identity (for display / support). */
export async function getDeviceUuid(): Promise<string> {
  return (await loadCache()).deviceUuid
}

// ---------- Account / email-OTP login ----------

export interface Session {
  email?: string
  loggedIn: boolean
}

async function sessionAlive(): Promise<boolean> {
  try {
    const v = await chrome.storage?.session?.get(SESSION_KEY)
    return Boolean(v?.[SESSION_KEY])
  } catch {
    return false
  }
}

async function markSessionAlive(): Promise<void> {
  try {
    await chrome.storage?.session?.set({ [SESSION_KEY]: true })
  } catch {
    // storage.session may be unavailable; keep-logged-in still works via local.
  }
}

async function clearSession(cache: LicenseCache): Promise<void> {
  cache.token = undefined
  cache.licenseKey = undefined
  cache.email = undefined
  cache.keepLoggedIn = undefined
  await saveCache(cache)
}

/** The signed-in session. A session that opted out of "keep logged in" ends
 *  when the browser restarts (its session marker is gone) → auto-logout. */
export async function getSession(): Promise<Session> {
  const cache = await loadCache()
  if (cache.token && cache.keepLoggedIn === false && !(await sessionAlive())) {
    await clearSession(cache)
    return { loggedIn: false }
  }
  return { email: cache.email, loggedIn: Boolean(cache.token) }
}

/** Send a 6-digit login code to the email (KMS trial-OTP endpoint). */
export async function requestEmailCode(email: string): Promise<void> {
  const cache = await loadCache()
  await postJson('/v1/trial/request-code', {
    app_id: APP_ID,
    email: email.trim(),
    fingerprint: cache.fingerprint,
  })
}

/** Verify the code → receive + cache a signed token (the session). `keep`
 *  controls whether the session survives a browser restart. */
export async function verifyEmailCode(
  email: string,
  code: string,
  keep: boolean,
): Promise<LicenseState> {
  const cache = await loadCache()
  const resp = await postJson<ActivateResp>('/v1/trial/verify-code', {
    app_id: APP_ID,
    email: email.trim(),
    code: code.trim(),
    device_uuid: cache.deviceUuid,
    fingerprint: cache.fingerprint,
    device_name: DEVICE_NAME,
  })
  cache.token = resp.token
  cache.email = email.trim()
  cache.keepLoggedIn = keep
  await saveCache(cache)
  await markSessionAlive()
  return verifyCached(cache)
}

/** Sign out: drop the token + account email (device identity is kept). */
export async function logout(): Promise<void> {
  const cache = await loadCache()
  await clearSession(cache)
  try {
    await chrome.storage?.session?.remove(SESSION_KEY)
  } catch {
    // ignore
  }
}

/**
 * Re-fetch the current entitlement for the signed-in session and cache the
 * fresh token — WITHOUT sending another email/code. This is how a purchase is
 * picked up: after Stripe checkout the webhook binds the license to the email,
 * and the next sync (app open, or return from the checkout tab) upgrades the
 * cached token from trial → paid. Falls back to the cached token when offline
 * or signed out.
 */
export async function syncSession(): Promise<LicenseState> {
  const cache = await loadCache()
  if (!cache.email || !cache.token) return verifyCached(cache)
  try {
    const resp = await postJson<ActivateResp>('/v1/session/refresh', {
      app_id: APP_ID,
      email: cache.email,
      device_uuid: cache.deviceUuid,
      fingerprint: cache.fingerprint,
    })
    cache.token = resp.token
    await saveCache(cache)
  } catch {
    // Offline / endpoint not yet available — keep the cached token.
  }
  return verifyCached(cache)
}

/** URL that opens Stripe checkout (in a new tab) with the signed-in email
 *  prefilled. iakms creates the Checkout Session and redirects to Stripe. */
export async function buildCheckoutUrl(): Promise<string> {
  const { email } = await loadCache()
  const q = new URLSearchParams({ app_id: APP_ID, policy: CHECKOUT_POLICY })
  if (email) q.set('email', email)
  return `${CHECKOUT_URL}?${q.toString()}`
}

/** URL for the iakms embedded-checkout page, framed inside the side panel. We
 *  pass our own extension origin so iakms can target its completion postMessage
 *  back to us (the receiver still verifies the message *came from* iakms). */
export async function buildEmbeddedCheckoutUrl(): Promise<string> {
  const { email } = await loadCache()
  const q = new URLSearchParams({
    app_id: APP_ID,
    policy: CHECKOUT_POLICY,
    origin: location.origin,
  })
  if (email) q.set('email', email)
  return `${CHECKOUT_EMBED_URL}?${q.toString()}`
}

/** iakms origin — the only sender we trust for checkout-completion messages. */
export const KMS_ORIGIN = KMS_BASE_URL

/**
 * Start (or resume) the free trial for this device. The server mints a
 * trial-policy license bound to the device, deduped by fingerprint — repeat
 * calls are idempotent, and an already-spent trial comes back as an error.
 */
export async function startTrial(): Promise<LicenseState> {
  const cache = await loadCache()
  const resp = await postJson<ActivateResp>('/v1/trial', {
    app_id: APP_ID,
    device_uuid: cache.deviceUuid,
    fingerprint: cache.fingerprint,
    device_name: DEVICE_NAME,
  })
  cache.token = resp.token
  await saveCache(cache)
  return verifyCached(cache)
}

/** Activate this device with a license key, cache the token, return state. */
export async function activate(licenseKey: string): Promise<LicenseState> {
  const cache = await loadCache()
  const resp = await postJson<ActivateResp>('/v1/activate', {
    app_id: APP_ID,
    // The signed-in account email owns the seat — this is the anchor iakms uses
    // to allocate/look up licenses. Device uuid/fingerprint are just a local
    // random per-install id for seat counting (no hardware info is collected).
    email: cache.email,
    license_key: licenseKey.trim(),
    device_uuid: cache.deviceUuid,
    fingerprint: cache.fingerprint,
    device_name: DEVICE_NAME,
  })
  cache.licenseKey = licenseKey.trim()
  cache.token = resp.token
  await saveCache(cache)
  return verifyCached(cache)
}

/** Renew the lease (refresh the token) using the stored license key. */
export async function renew(): Promise<LicenseState> {
  const cache = await loadCache()
  if (!cache.licenseKey) return { status: 'unlicensed' }
  const resp = await postJson<ActivateResp>('/v1/renew', {
    app_id: APP_ID,
    email: cache.email,
    license_key: cache.licenseKey,
    device_uuid: cache.deviceUuid,
    fingerprint: cache.fingerprint,
  })
  cache.token = resp.token
  await saveCache(cache)
  return verifyCached(cache)
}

/**
 * Rebind to this machine using a recovery code (e.g. after a device swap).
 * Returns the new state plus the rotated recovery code, which the caller MUST
 * surface to the user — it's one-time and replaces the old one.
 */
export async function rebind(
  recoveryCode: string,
): Promise<{ state: LicenseState; newRecoveryCode: string }> {
  const cache = await loadCache()
  const resp = await postJson<RebindResp>('/v1/rebind', {
    app_id: APP_ID,
    email: cache.email,
    recovery_code: recoveryCode.trim(),
    device_uuid: cache.deviceUuid,
    fingerprint: cache.fingerprint,
    device_name: DEVICE_NAME,
  })
  cache.licenseKey = resp.license_key
  cache.token = typeof resp.token === 'string' ? resp.token : resp.token.token
  await saveCache(cache)
  return { state: await verifyCached(cache), newRecoveryCode: resp.new_recovery_code }
}

/**
 * Unbind this device locally: drop the cached token + license key so the app
 * returns to 'unlicensed' and a different key can be activated. The device
 * identity (uuid/fingerprint) is kept, and the server-side seat is unaffected
 * until it's reclaimed via rebind elsewhere.
 */
export async function unbind(): Promise<LicenseState> {
  const cache = await loadCache()
  cache.licenseKey = undefined
  cache.token = undefined
  await saveCache(cache)
  return { status: 'unlicensed' }
}

/** True once the lease has less than 1/3 TTL left — time to renew. */
export function needsRenew(claims: TokenClaims): boolean {
  const now = trustedNow()
  if (!now) return false // no trusted time yet — don't renew on a guess
  const ttl = claims.expires_at - claims.issued_at
  if (ttl <= 0) return false
  return claims.expires_at - now < ttl / 3
}
