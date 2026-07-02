import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activate as kmsActivate,
  buildCheckoutUrl,
  buildEmbeddedCheckoutUrl,
  getLicenseState,
  getSession,
  KMS_ORIGIN,
  logout as kmsLogout,
  needsRenew,
  rebind as kmsRebind,
  renew,
  requestEmailCode as kmsRequestEmailCode,
  startTrial as kmsStartTrial,
  syncSession,
  unbind as kmsUnbind,
  verifyEmailCode as kmsVerifyEmailCode,
  type LicenseState,
  type Session,
} from '../lib/license/client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** License state + account session + actions. `state`/`session` are null until
 *  the first check resolves. A best-effort renew runs when the cached lease is
 *  getting old (silently ignored when offline). */
export function useLicense() {
  const [state, setState] = useState<LicenseState | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  // Non-null while the embedded-checkout iframe should be shown (its src URL).
  const [checkout, setCheckout] = useState<string | null>(null)
  // Try the silent device trial at most once per mount (avoids re-firing on
  // every window focus, and never re-calls once it's granted).
  const trialTried = useRef(false)

  const refresh = useCallback(async (): Promise<LicenseState> => {
    const sess = await getSession()
    setSession(sess)
    if (sess.loggedIn) {
      // Signed-in account: re-fetch the entitlement from the session — this is
      // what upgrades trial → paid after a Stripe purchase, with no extra email.
      const s = await syncSession()
      setState(s)
      return s
    }
    // Device (license-key) activation: offline-verify, renew by key if aging.
    let s = await getLicenseState()
    // Anonymous first run: silently establish the device-fingerprint trial so a
    // never-logged-in user still sees their free days (7-day device trial, no
    // login, no gesture — just `POST /v1/trial`). Only when truly unlicensed
    // (an expired/spent trial reads 'expired', not 'unlicensed', and won't retry).
    if (s.status === 'unlicensed' && !trialTried.current) {
      trialTried.current = true
      try {
        s = await kmsStartTrial()
      } catch {
        // Offline, or the device's trial is already spent — leave unlicensed.
      }
    }
    setState(s)
    if (s.status === 'active' && s.claims && needsRenew(s.claims)) {
      try {
        s = await renew()
        setState(s)
      } catch {
        // Offline / server down — the cached token is still valid within TTL.
      }
    }
    return s
  }, [])

  useEffect(() => {
    void refresh()
    // Returning to the side panel (e.g. back from the checkout tab) re-syncs, so
    // a completed purchase is picked up automatically.
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  // Auto-refresh on embedded-checkout completion. iakms postMessages us when the
  // Stripe payment succeeds; we close the iframe and re-sync. The message is only
  // a *trigger* — the entitlement itself comes from the signed token iakms issues
  // after its webhook binds the license, so a forged message just yields "still
  // unlicensed". A short retry covers the webhook-vs-return race.
  useEffect(() => {
    async function onMessage(e: MessageEvent) {
      if (e.origin !== KMS_ORIGIN || e.data?.type !== 'iakms:checkout-complete') return
      setCheckout(null)
      for (let i = 0; i < 4; i++) {
        const s = await refresh()
        if (s.status === 'active') break
        await sleep(1500)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refresh])

  const activate = useCallback(async (key: string) => {
    const s = await kmsActivate(key)
    setState(s)
    return s
  }, [])

  const rebind = useCallback(async (code: string) => {
    const r = await kmsRebind(code)
    setState(r.state)
    return r
  }, [])

  const unbind = useCallback(async () => {
    const s = await kmsUnbind()
    setState(s)
    return s
  }, [])

  const startTrial = useCallback(async () => {
    const s = await kmsStartTrial()
    setState(s)
    return s
  }, [])

  const requestEmailCode = useCallback((email: string) => kmsRequestEmailCode(email), [])

  const verifyEmailCode = useCallback(async (email: string, code: string, keep: boolean) => {
    const s = await kmsVerifyEmailCode(email, code, keep)
    setState(s)
    setSession(await getSession())
    return s
  }, [])

  const logout = useCallback(async () => {
    await kmsLogout()
    setSession(await getSession())
    setState(await getLicenseState())
  }, [])

  /** Open embedded Stripe checkout in an in-panel iframe (email prefilled). On
   *  success iakms postMessages us and the listener above re-syncs the license. */
  const buy = useCallback(async () => {
    setCheckout(await buildEmbeddedCheckoutUrl())
  }, [])

  const closeCheckout = useCallback(() => setCheckout(null), [])

  /** Fallback: hosted checkout in a NEW TAB (when the iframe can't load — CSP,
   *  network, embed endpoint down). Closes the iframe; the window `focus`
   *  listener picks the purchase up on return, as before. */
  const buyInTab = useCallback(async () => {
    setCheckout(null)
    const url = await buildCheckoutUrl()
    if (chrome.tabs?.create) chrome.tabs.create({ url })
    else window.open(url, '_blank', 'noopener')
  }, [])

  return {
    state,
    session,
    checkout,
    refresh,
    activate,
    rebind,
    unbind,
    startTrial,
    requestEmailCode,
    verifyEmailCode,
    logout,
    buy,
    buyInTab,
    closeCheckout,
  }
}
