import { useCallback, useEffect, useState } from 'react'
import {
  activate as kmsActivate,
  getLicenseState,
  needsRenew,
  rebind as kmsRebind,
  renew,
  startTrial as kmsStartTrial,
  unbind as kmsUnbind,
  type LicenseState,
} from '../lib/license/client'

/** License state + actions. `state` is null until the first offline check
 *  resolves. Activate/rebind update the state; a best-effort renew runs when
 *  the cached lease is getting old (silently ignored when offline). */
export function useLicense() {
  const [state, setState] = useState<LicenseState | null>(null)

  const refresh = useCallback(async () => {
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

  return { state, refresh, activate, rebind, unbind, startTrial }
}
