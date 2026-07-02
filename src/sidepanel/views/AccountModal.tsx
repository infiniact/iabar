import { useState } from 'react'
import { useT } from '../../lib/i18n'
import { trustedNow } from '../../lib/license/trusted-time'
import { GoogleIcon, HeroMark, LogoutIcon, UserIcon } from '../icons'
import { useLicense } from '../useLicense'
import { CheckoutModal } from './CheckoutModal'
import { LicenseSection } from './LicenseSection'

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Account dialog: a login page (Google — soon — + email OTP) when signed out,
 *  or License / Usage tabs when signed in. */
export function AccountModal() {
  const t = useT()
  const lic = useLicense()
  const [tab, setTab] = useState<'license' | 'usage'>('license')

  if (!lic.session) return <div className="account account--loading">…</div>

  if (!lic.session.loggedIn) return <LoginView lic={lic} />

  return (
    <div className="account">
      <div className="account__head">
        <span className="account__id">
          <UserIcon size={15} />
          {lic.session.email ?? t('account.title')}
        </span>
        <button
          className="account__logout"
          onClick={() => void lic.logout()}
          title={t('account.logout')}
          aria-label={t('account.logout')}
        >
          <LogoutIcon size={16} />
        </button>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ['license', t('account.tabLicense')],
            ['usage', t('account.tabUsage')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className={`tab${tab === id ? ' tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'license' ? <LicenseSection lic={lic} /> : <UsagePanel lic={lic} />}
      {lic.checkout && (
        <CheckoutModal
          url={lic.checkout}
          onClose={lic.closeCheckout}
          onFallback={() => void lic.buyInTab()}
        />
      )}
    </div>
  )
}

function LoginView({ lic }: { lic: ReturnType<typeof useLicense> }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [keep, setKeep] = useState(true)
  const [busy, setBusy] = useState<'idle' | 'sending' | 'verifying'>('idle')
  const [err, setErr] = useState<string | null>(null)

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const codeOk = code.trim().length >= 4

  async function sendCode() {
    if (!emailOk || busy !== 'idle') return
    setBusy('sending')
    setErr(null)
    try {
      await lic.requestEmailCode(email)
      setSent(true)
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy('idle')
    }
  }

  async function verify() {
    if (!codeOk || busy !== 'idle') return
    setBusy('verifying')
    setErr(null)
    try {
      await lic.verifyEmailCode(email, code, keep) // success → session flips → account view
    } catch (e) {
      setErr(errText(e))
    } finally {
      setBusy('idle')
    }
  }

  return (
    <div className="login">
      <div className="login__head">
        <HeroMark size={40} />
        <h3 className="login__title">{t('login.title')}</h3>
        <p className="login__sub">{t('login.sub')}</p>
      </div>

      <button className="login__google" title={t('login.googleSoon')} disabled>
        <GoogleIcon size={18} />
        {t('login.google')}
      </button>

      <div className="login__or">
        <span>{t('login.or')}</span>
      </div>

      <div className="login__form">
        <input
          className="input"
          type="email"
          inputMode="email"
          placeholder={t('login.email')}
          value={email}
          spellCheck={false}
          onChange={(e) => {
            setEmail(e.target.value)
            setErr(null)
          }}
          onKeyDown={(e) => e.key === 'Enter' && !sent && void sendCode()}
        />

        {sent && (
          <>
            <span className="field__note">{t('login.codeSent', email as never)}</span>
            <input
              className="input"
              inputMode="numeric"
              placeholder={t('login.code')}
              value={code}
              spellCheck={false}
              autoFocus
              onChange={(e) => {
                setCode(e.target.value)
                setErr(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && void verify()}
            />
          </>
        )}

        {!sent ? (
          <button
            className="btn btn--primary"
            onClick={sendCode}
            disabled={!emailOk || busy === 'sending'}
          >
            {busy === 'sending' ? t('login.sending') : t('login.sendCode')}
          </button>
        ) : (
          <button
            className="btn btn--primary"
            onClick={verify}
            disabled={!codeOk || busy === 'verifying'}
          >
            {busy === 'verifying' ? t('login.verifying') : t('login.verify')}
          </button>
        )}

        {sent && (
          <button className="link-btn" onClick={sendCode} disabled={busy !== 'idle'}>
            {t('login.resend')}
          </button>
        )}

        <label className="login__keep">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          {t('login.keep')}
        </label>

        {err && <div className="chat__error">{err}</div>}
      </div>
    </div>
  )
}

function UsagePanel({ lic }: { lic: ReturnType<typeof useLicense> }) {
  const t = useT()
  const claims = lic.state?.status === 'active' ? lic.state.claims : undefined
  const trial = claims?.policy === 'trial'
  const daysLeft =
    trial && claims
      ? Math.max(
          0,
          Math.ceil((claims.expires_at - (trustedNow() || Math.floor(Date.now() / 1000))) / 86_400),
        )
      : 0

  if (!claims) {
    return <div className="field__note usage__empty">{t('license.statusUnlicensed')}</div>
  }

  const rows: [string, string][] = [
    [t('usage.plan'), trial ? t('usage.deviceTrial') : claims.policy],
    [t('usage.status'), trial ? t('account.trialDays', daysLeft as never) : t('license.statusActive')],
    [t('usage.seats'), String(claims.max_seats)],
    [
      t('usage.expires'),
      new Date(claims.expires_at * 1000).toLocaleDateString(t.lang === 'zh' ? 'zh-CN' : 'en-US'),
    ],
  ]

  return (
    <div className="usage">
      {rows.map(([k, v]) => (
        <div className="usage__row" key={k}>
          <span className="usage__k">{k}</span>
          <span className="usage__v">{v}</span>
        </div>
      ))}
    </div>
  )
}
