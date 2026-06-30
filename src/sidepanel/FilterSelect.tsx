import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon, CheckIcon } from './icons'
import { useClickOutside } from './useClickOutside'
import { useT } from '../lib/i18n'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** Small trailing tag, e.g. "soon". */
  badge?: string
}

/**
 * Styled dropdown used for every picker.
 * - `up`: open upward (for controls near the bottom composer).
 * - `search`: show a filter box, pinned next to the trigger (bottom when `up`).
 * - `variant`: 'input' (full-width field) or 'chip' (compact pill for toolbars).
 */
export function FilterSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder,
  up = false,
  search = false,
  variant = 'input',
  leading,
  menuAlign = 'left',
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  up?: boolean
  search?: boolean
  variant?: 'input' | 'chip'
  leading?: ReactNode
  menuAlign?: 'left' | 'right'
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const current = options.find((o) => o.value === value)
  const filtered =
    search && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options

  // Click/touch outside → close (shared with every other popup).
  useClickOutside(ref, () => setOpen(false), open)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    if (search) searchRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, search])

  const searchRow = search ? (
    <div className="fselect__search">
      <input
        ref={searchRef}
        className="fselect__search-input"
        placeholder={t('fselect.search')}
        value={query}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
      />
    </div>
  ) : null

  return (
    <div className={`fselect fselect--${variant}`} ref={ref} data-open={open} data-up={up}>
      <button
        type="button"
        className={variant === 'chip' ? 'fselect__chip' : 'fselect__btn input'}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {leading && <span className="fselect__leading">{leading}</span>}
        <span className="fselect__value">{current?.label ?? placeholder ?? ''}</span>
        <span className="fselect__chev">
          <ChevronDownIcon size={variant === 'chip' ? 12 : 16} />
        </span>
      </button>

      {open && (
        <div
          className={`fselect__menu${menuAlign === 'right' ? ' fselect__menu--right' : ''}`}
          role="listbox"
        >
          {search && !up && searchRow}
          <ul className="fselect__list">
            {filtered.length === 0 && <li className="fselect__empty">{t('fselect.empty')}</li>}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  className={`fselect__opt${o.value === value ? ' fselect__opt--on' : ''}`}
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return
                    onChange(o.value)
                    setOpen(false)
                  }}
                >
                  <span className="fselect__opt-label">{o.label}</span>
                  {o.badge && <span className="seg__soon">{o.badge}</span>}
                  {o.value === value && (
                    <span className="fselect__check">
                      <CheckIcon size={15} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          {search && up && searchRow}
        </div>
      )}
    </div>
  )
}
