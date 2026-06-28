import { useState } from 'react'
import { useT } from '../../lib/i18n'
import type { LicenseState } from '../../lib/license/client'
import { trustedNow } from '../../lib/license/trusted-time'
import { useLicense } from '../useLicense'

type Busy = { state: 'idle' } | { state: 'busy' } | { state: 'fail'; msg: string }

/** License panel: shows the current (offline-verified) state and lets the user
 *  activate this device or rebind via a recovery code. Status-only — it does
 *  not gate any features. */
export function LicenseSection() {
  const t = useT()
  const { state, activate, rebind, unbind, startTrial } = useLicense()

  const [key, setKey] = useState('')
  const [code, setCode] = useState('')
  const [showRebind, setShowRebind] = useState(false)
  const [act, setAct] = useState<Busy>({ state: 'idle' })
  const [reb, setReb] = useState<Busy>({ state: 'idle' })
  const [unb, setUnb] = useState<Busy>({ state: 'idle' })
  const [trl, setTrl] = useState<Busy>({ state: 'idle' })
  const [newRecovery, setNewRecovery] = useState<string | null>(null)

  const active = state?.status === 'active'
  const isTrial = active && state?.claims?.policy === 'trial'
  // Something is bound locally (active / expired / invalid token) → can unbind.
  const bound = !!state && state.status !== 'unlicensed'

  // Trial days remaining, by trusted server time (falls back to local for the
  // first paint before any server contact — display only).
  const daysLeft =
    isTrial && state?.claims
      ? Math.max(
          0,
          Math.ceil(
            (state.claims.expires_at - (trustedNow() || Math.floor(Date.now() / 1000))) / 86_400,
          ),
        )
      : 0

  async function onStartTrial() {
    if (trl.state === 'busy') return
    setTrl({ state: 'busy' })
    try {
      await startTrial()
      setTrl({ state: 'idle' })
    } catch (e) {
      setTrl({ state: 'fail', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  async function onActivate() {
    if (!key.trim() || act.state === 'busy') return
    setAct({ state: 'busy' })
    try {
      await activate(key)
      setAct({ state: 'idle' })
      setKey('')
    } catch (e) {
      setAct({ state: 'fail', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  async function onRebind() {
    if (!code.trim() || reb.state === 'busy') return
    setReb({ state: 'busy' })
    try {
      const { newRecoveryCode } = await rebind(code)
      setReb({ state: 'idle' })
      setCode('')
      setNewRecovery(newRecoveryCode)
    } catch (e) {
      setReb({ state: 'fail', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  async function onUnbind() {
    if (unb.state === 'busy') return
    setUnb({ state: 'busy' })
    try {
      await unbind()
      setUnb({ state: 'idle' })
    } catch (e) {
      setUnb({ state: 'fail', msg: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <section className="field">
      <div className="field__row">
        <label className="field__label">{t('license.title')}</label>
        <LicenseBadge state={state} />
      </div>

      {active && state?.claims ? (
        isTrial ? (
          <div className="field__note">
            {t('license.trialDaysLeft', daysLeft as never)} · {t('license.expires')}:{' '}
            {new Date(state.claims.expires_at * 1000).toLocaleDateString(
              t.lang === 'zh' ? 'zh-CN' : 'en-US',
            )}
          </div>
        ) : (
          <div className="field__note">
            {t('license.policy')}: {state.claims.policy} · {t('license.seats')}:{' '}
            {state.claims.max_seats} · {t('license.expires')}:{' '}
            {new Date(state.claims.expires_at * 1000).toLocaleDateString(
              t.lang === 'zh' ? 'zh-CN' : 'en-US',
            )}
          </div>
        )
      ) : (
        <>
          {state?.status === 'unlicensed' && (
            <div className="license__actions">
              <button
                className={`btn btn--primary${trl.state === 'fail' ? ' btn--fail' : ''}`}
                onClick={onStartTrial}
                disabled={trl.state === 'busy'}
                title={trl.state === 'fail' ? trl.msg : ''}
              >
                {trl.state === 'busy' ? t('license.starting') : t('license.startTrial')}
              </button>
            </div>
          )}
          {trl.state === 'fail' && <span className="field__note">{trl.msg}</span>}
          <div className="field__inline">
            <input
              className="input"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              value={key}
              spellCheck={false}
              onChange={(e) => {
                setKey(e.target.value)
                setAct({ state: 'idle' })
              }}
              onKeyDown={(e) => e.key === 'Enter' && void onActivate()}
            />
            <button
              className={`btn${act.state === 'fail' ? ' btn--fail' : ''}`}
              onClick={onActivate}
              disabled={act.state === 'busy' || !key.trim()}
              title={act.state === 'fail' ? act.msg : ''}
            >
              {act.state === 'busy' ? t('license.activating') : t('license.activate')}
            </button>
          </div>
          {act.state === 'fail' && <span className="field__note">{act.msg}</span>}
        </>
      )}

      {/* Rebind (device swap) / unbind — buttons, always available. */}
      <div className="license__actions">
        <button
          className={`btn${showRebind ? ' btn--on' : ''}`}
          onClick={() => setShowRebind((v) => !v)}
        >
          {t('license.rebind')}
        </button>
        {bound && (
          <button
            className={`btn${unb.state === 'fail' ? ' btn--fail' : ''}`}
            onClick={onUnbind}
            disabled={unb.state === 'busy'}
            title={unb.state === 'fail' ? unb.msg : ''}
          >
            {unb.state === 'busy' ? t('license.unbinding') : t('license.unbind')}
          </button>
        )}
      </div>
      {showRebind && (
        <>
          <span className="field__note">{t('license.rebindHint')}</span>
          <div className="field__inline">
            <input
              className="input"
              placeholder={t('license.recoveryPlaceholder')}
              value={code}
              spellCheck={false}
              onChange={(e) => {
                setCode(e.target.value)
                setReb({ state: 'idle' })
              }}
              onKeyDown={(e) => e.key === 'Enter' && void onRebind()}
            />
            <button
              className={`btn${reb.state === 'fail' ? ' btn--fail' : ''}`}
              onClick={onRebind}
              disabled={reb.state === 'busy' || !code.trim()}
              title={reb.state === 'fail' ? reb.msg : ''}
            >
              {reb.state === 'busy' ? t('license.rebinding') : t('license.rebind')}
            </button>
          </div>
          {reb.state === 'fail' && <span className="field__note">{reb.msg}</span>}
          {newRecovery && (
            <div className="field__note license__recovery">
              {t('license.newRecoveryCode')}: <code>{newRecovery}</code>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function LicenseBadge({ state }: { state: LicenseState | null }) {
  const t = useT()
  if (!state) return null
  const label =
    state.status === 'active'
      ? t('license.statusActive')
      : state.status === 'expired'
        ? t('license.statusExpired')
        : state.status === 'invalid'
          ? t('license.statusInvalid')
          : t('license.statusUnlicensed')
  return <span className={`license__badge license__badge--${state.status}`}>{label}</span>
}
