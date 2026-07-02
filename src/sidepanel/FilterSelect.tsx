import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon, CheckIcon } from './icons'
import { useClickOutside } from './useClickOutside'
import { useT } from '../lib/i18n'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  /** Small trailing tag, e.g. "soon". */
  badge?: string
  /** Section header shown above the first option of each group. Options must be
   *  pre-sorted by group for headers to render once per section. */
  group?: string
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
  allowCustom = false,
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
  /** Let the user commit the typed query as the value even when it matches no
   *  option — for fields where valid values aren't fully enumerable (e.g. a
   *  model id the provider's `/models` doesn't list but still accepts). */
  allowCustom?: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  // Show the filter box when asked, or automatically once the list is long
  // (>10 items) — global rule so every long dropdown stays scannable.
  const showSearch = search || options.length > 10
  const current = options.find((o) => o.value === value)
  const filtered =
    showSearch && query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
      : options
  // Free-text commit: a non-empty query that isn't already an option value.
  const q = query.trim()
  const canCreate = allowCustom && q.length > 0 && !options.some((o) => o.value === q)
  const commitCustom = () => {
    onChange(q)
    setOpen(false)
  }

  // Click/touch outside → close (shared with every other popup).
  useClickOutside(ref, () => setOpen(false), open)

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    if (showSearch) searchRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, showSearch])

  const searchRow = showSearch ? (
    <div className="fselect__search">
      <input
        ref={searchRef}
        className="fselect__search-input"
        placeholder={allowCustom ? t('fselect.searchOrType') : t('fselect.search')}
        value={query}
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canCreate) {
            e.preventDefault()
            commitCustom()
          }
        }}
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
        <span className="fselect__value">{current?.label ?? (value || placeholder) ?? ''}</span>
        <span className="fselect__chev">
          <ChevronDownIcon size={variant === 'chip' ? 12 : 16} />
        </span>
      </button>

      {open && (
        <div
          className={`fselect__menu${menuAlign === 'right' ? ' fselect__menu--right' : ''}`}
          role="listbox"
        >
          {showSearch && !up && searchRow}
          <ul className="fselect__list">
            {canCreate && (
              <li>
                <button
                  type="button"
                  className="fselect__opt fselect__opt--create"
                  onClick={commitCustom}
                >
                  <span className="fselect__opt-label">{t('fselect.use', q as never)}</span>
                </button>
              </li>
            )}
            {filtered.length === 0 && !canCreate && (
              <li className="fselect__empty">{t('fselect.empty')}</li>
            )}
            {filtered.map((o, i) => (
              <Fragment key={o.value}>
                {o.group && o.group !== filtered[i - 1]?.group && (
                  <li className="fselect__group">{o.group}</li>
                )}
                <li>
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
              </Fragment>
            ))}
          </ul>
          {showSearch && up && searchRow}
        </div>
      )}
    </div>
  )
}
