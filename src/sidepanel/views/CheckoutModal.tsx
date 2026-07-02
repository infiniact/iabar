import { useT } from '../../lib/i18n'
import { CloseIcon } from '../icons'

/** In-panel Stripe checkout. We frame the iakms embedded-checkout page (which
 *  loads Stripe.js and mounts Stripe Embedded Checkout on its own origin — MV3
 *  bars us from loading Stripe.js here, and Stripe's hosted page refuses to be
 *  framed, so this indirection is required). On payment success iakms
 *  postMessages the panel and `useLicense` re-syncs + closes this modal.
 *  `onFallback` opens hosted checkout in a new tab — the escape hatch when the
 *  iframe can't load (embed endpoint down, network filtering, etc.). */
export function CheckoutModal({
  url,
  onClose,
  onFallback,
}: {
  url: string
  onClose: () => void
  onFallback: () => void
}) {
  const t = useT()
  return (
    <div className="modal">
      <div className="modal__panel modal__panel--checkout">
        <button
          className="modal__close"
          onClick={onClose}
          title={t('common.close')}
          aria-label={t('common.close')}
        >
          <CloseIcon size={18} />
        </button>
        <iframe
          className="checkout__frame"
          src={url}
          title={t('license.checkoutTitle')}
          allow="payment"
        />
        <button className="link-btn checkout__fallback" onClick={onFallback}>
          {t('license.checkoutFallback')}
        </button>
      </div>
    </div>
  )
}
