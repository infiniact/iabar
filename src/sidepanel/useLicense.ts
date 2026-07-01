import { useCallback, useEffect, useState } from 'react'
import {
  activate as kmsActivate,
  buildCheckoutUrl,
  getLicenseState,
  getSession,
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

/** License state + account session + actions. `state`/`session` are null until
 *  the first check resolves. A best-effort renew runs when the cached lease is
 *  getting old (silently ignored when offline). */
export function useLicense() {
  const [state, setState] = useState<LicenseState | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  const refresh = useCallback(async () => {
    const sess = await getSession()
    setSession(sess)
    if (sess.loggedIn) {
      // Signed-in account: re-fetch the entitlement from the session — this is
      // what upgrades trial → paid after a Stripe purchase, with no extra email.
      setState(await syncSession())
      return
    }
    // Device (license-key) activation: offline-verify, renew by key if aging.
    const s = await getLicenseState()
    setState(s)
    if (s.status === 'active' && s.claims && needsRenew(s.claims)) {
      try {
        setState(await renew())
      } catch {
        // Offline / server down — the cached token is still valid within TTL.
      }
    }
  }, [])

  useEffect(() => {
    void refresh()
    // Returning to the side panel (e.g. back from the checkout tab) re-syncs, so
    // a completed purchase is picked up automatically.
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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

  /** Open Stripe checkout in a new tab (email prefilled). The return-to-panel
   *  focus listener re-syncs, so the purchased license is picked up on return. */
  const buy = useCallback(async () => {
    const url = await buildCheckoutUrl()
    if (chrome.tabs?.create) chrome.tabs.create({ url })
    else window.open(url, '_blank', 'noopener')
    return url
  }, [])

  return {
    state,
    session,
    refresh,
    activate,
    rebind,
    unbind,
    startTrial,
    requestEmailCode,
    verifyEmailCode,
    logout,
    buy,
  }
}
