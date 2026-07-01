import { useT } from '../lib/i18n'
import { trustedNow } from '../lib/license/trusted-time'
import { UserIcon } from './icons'
import { useLicense } from './useLicense'

/** Bottom-of-rail account entry: a login/account button + a plan tag
 *  (Paid / Free · N days left for a trial). Clicking opens the License tab. */
export function RailAccount({ onOpen }: { onOpen: () => void }) {
  const t = useT()
  const { state } = useLicense()

  const active = state?.status === 'active'
  const trial = active && state?.claims?.policy === 'trial'
  const paid = active && !trial
  const daysLeft =
    trial && state?.claims
      ? Math.max(
          0,
          Math.ceil(
            (state.claims.expires_at - (trustedNow() || Math.floor(Date.now() / 1000))) / 86_400,
          ),
        )
      : 0

  return (
    <div className="rail__account">
      <button className="rail__btn" title={t('account.title')} onClick={onOpen}>
        <UserIcon />
      </button>
      <div className="rail__plan">
        <span className={`rail__plan-tag rail__plan-tag--${paid ? 'paid' : 'free'}`}>
          {paid ? t('account.paid') : t('account.free')}
        </span>
        {trial && <span className="rail__days">{t('account.trialDays', daysLeft as never)}</span>}
      </div>
    </div>
  )
}
