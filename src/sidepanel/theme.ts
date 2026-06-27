import { useEffect } from 'react'
import type { ThemeMode } from '../lib/store'

/** Resolve the mode to a concrete light/dark and apply it to <html>. */
export function applyTheme(mode: ThemeMode): void {
  const dark =
    mode === 'dark' ||
    (mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

/** Apply the theme and, when following the system, react to OS changes. */
export function useTheme(mode: ThemeMode): void {
  useEffect(() => {
    applyTheme(mode)
    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [mode])
}
