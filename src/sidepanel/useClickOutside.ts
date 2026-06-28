import { useEffect, useRef, type RefObject } from 'react'

/**
 * Calls `onOutside` when a pointer/touch press starts outside `ref` (while
 * `active`). Used by every popup so clicking anywhere outside dismisses it.
 * The callback is held in a ref so the listener isn't re-subscribed each render.
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  active = true,
) {
  const cb = useRef(onOutside)
  cb.current = onOutside

  useEffect(() => {
    if (!active) return
    function handle(e: Event) {
      const el = ref.current
      if (el && !el.contains(e.target as Node)) cb.current()
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [ref, active])
}
