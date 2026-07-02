import { useEffect, useState } from 'react'
import { providerChat } from '../../harness'
import { fetchModels, modelLabel } from '../../lib/models'
import {
  baseUrlFor,
  PROVIDERS,
  providerKind,
  resolveBaseUrl,
  type Language,
  type ProviderId,
  type Settings,
  type ThemeMode,
} from '../../lib/store'
import { listGrantedOrigins, revokePattern } from '../../lib/origin-permission'
import { useT } from '../../lib/i18n'
import { EyeIcon, EyeOffIcon, TrashIcon } from '../icons'
import { FilterSelect } from '../FilterSelect'

type Status =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'ok'; msg?: string }
  | { state: 'fail'; msg: string }

type SettingsTab = 'provider' | 'sites' | 'language' | 'theme'

const SITES_PER_PAGE = 8

/** A local (localhost / 127.0.0.1) origin needs no network egress. */
function isLocalOrigin(pattern: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(pattern)
}

/** Strip the trailing `/*` from an origin pattern for display. */
function displayOrigin(pattern: string): string {
  return pattern.replace(/\/\*$/, '')
}

export function SettingsView({
  settings,
  onSave,
  onSetTheme,
  onSetLanguage,
  onDone,
  initialTab = 'provider',
}: {
  settings: Settings
  onSave: (next: Settings) => void
  onSetTheme: (mode: ThemeMode) => void
  onSetLanguage: (lang: Language) => void
  onDone: () => void
  initialTab?: SettingsTab
}) {
  const t = useT()
  const [provider, setProvider] = useState<ProviderId>(settings.provider)
  // Per-provider credentials/model — switching never loses what you entered.
  const [byProvider, setByProvider] = useState(settings.byProvider)
  const [showKey, setShowKey] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<Status>({ state: 'idle' })
  const [test, setTest] = useState<Status>({ state: 'idle' })
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  // Runtime-granted site origins (ADR 0009) — everything the user has approved
  // for page reads or tool endpoints, minus the static manifest hosts.
  const [sites, setSites] = useState<string[] | null>(null)
  const [sitesPage, setSitesPage] = useState(0)

  useEffect(() => {
    if (tab !== 'sites') return
    let live = true
    listGrantedOrigins().then((o) => live && setSites(o))
    return () => {
      live = false
    }
  }, [tab])

  const siteCount = sites?.length ?? 0
  const sitesPages = Math.max(1, Math.ceil(siteCount / SITES_PER_PAGE))
  // Clamp the page whenever the list shrinks (e.g. after a revoke empties one).
  const page = Math.min(sitesPage, sitesPages - 1)
  const pageSites = (sites ?? []).slice(page * SITES_PER_PAGE, (page + 1) * SITES_PER_PAGE)

  async function revokeSite(pattern: string) {
    await revokePattern(pattern)
    setSites(await listGrantedOrigins())
  }

  const meta = PROVIDERS.find((p) => p.id === provider)!
  const cfg = byProvider[provider]
  const apiKey = cfg.apiKey
  const model = cfg.model
  const baseUrl = cfg.baseUrl ?? ''
  // The "checked" model list lives in the provider config so it persists. The
  // current model is always listed (it may be a hand-entered id not in the fetch).
  const models = cfg.models ?? []
  const modelOptions = Array.from(
    new Set([model, ...models, meta.defaultModel].filter(Boolean)),
  )

  function patchCfg(
    patch: Partial<{ apiKey: string; model: string; models: string[]; baseUrl: string }>,
  ) {
    setByProvider((b) => ({ ...b, [provider]: { ...b[provider], ...patch } }))
  }

  function pickProvider(id: ProviderId) {
    const m = PROVIDERS.find((p) => p.id === id)!
    if (!m.enabled) return
    setProvider(id)
    setShowKey(false)
    setFetchStatus({ state: 'idle' })
    setTest({ state: 'idle' })
  }

  // Step after the key: pull the model list (also validates the key).
  async function getModels() {
    if (!apiKey.trim()) {
      setFetchStatus({ state: 'fail', msg: t('settings.needKey') })
      return
    }
    setFetchStatus({ state: 'busy' })
    try {
      const ids = await fetchModels(provider, apiKey, baseUrl)
      const nextModel = ids.includes(model) ? model : ids[0]
      // Persist the full list immediately so the chat composer's picker sees it
      // without needing an explicit Save (closing the overlay would drop it).
      const next = {
        ...byProvider,
        [provider]: { ...byProvider[provider], apiKey: apiKey.trim(), models: ids, model: nextModel },
      }
      setByProvider(next)
      onSave({ provider, theme: settings.theme, language: settings.language, byProvider: next })
      setFetchStatus({ state: 'ok', msg: String(ids.length) })
    } catch (e) {
      patchCfg({ models: [] })
      setFetchStatus({ state: 'fail', msg: String(e instanceof Error ? e.message : e) })
    }
  }

  async function runTest() {
    if (!apiKey.trim()) {
      setTest({ state: 'fail', msg: t('settings.needKey') })
      return
    }
    setTest({ state: 'busy' })
    try {
      await providerChat({
        apiKey: apiKey.trim(),
        provider,
        baseUrl: resolveBaseUrl(provider, cfg),
        model,
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 8,
      })
      setTest({ state: 'ok' })
    } catch (e) {
      setTest({ state: 'fail', msg: String(e) })
    }
  }

  function save() {
    const next = { ...byProvider, [provider]: { ...byProvider[provider], apiKey: apiKey.trim() } }
    onSave({ provider, theme: settings.theme, language: settings.language, byProvider: next })
    setSaved(true)
    // Show "Saved ✓" briefly, then return to chat.
    setTimeout(onDone, 700)
  }

  return (
    <div className="view view--settings">
      <h2 className="view__title">{t('settings.title')}</h2>

      <div className="tabs" role="tablist">
        {(
          [
            ['provider', t('settings.provider')],
            ['sites', t('settings.sites')],
            ['language', t('settings.language')],
            ['theme', t('settings.theme')],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={`tab${tab === id ? ' tab--on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'provider' && (
        <>
      {/* Provider → API key → Model, grouped into one card */}
      <div className="group">
        <section className="field">
          <label className="field__label">{t('settings.provider')}</label>
          <FilterSelect
            value={provider}
            search
            onChange={(v) => pickProvider(v as ProviderId)}
            options={[...PROVIDERS]
              // Subscription tiers (coding/plan) group above plain API.
              .sort(
                (a, b) =>
                  (providerKind(a) === 'subscription' ? 0 : 1) -
                  (providerKind(b) === 'subscription' ? 0 : 1),
              )
              .map((p) => ({
                value: p.id,
                label: p.label,
                disabled: !p.enabled,
                badge: p.enabled ? undefined : 'soon',
                group:
                  providerKind(p) === 'subscription'
                    ? t('settings.groupSubscription')
                    : t('settings.groupApi'),
              }))}
          />
        </section>

        {/* Base URL — defaults to the catalog value; editable for endpoints that
            embed a per-account segment (e.g. 通义 Coding's workspace id) or for
            self-hosted / proxy bases. */}
        <section className="field">
          <label className="field__label">{t('settings.baseUrl')}</label>
          <input
            className="input"
            placeholder={baseUrlFor(provider)}
            value={baseUrl}
            spellCheck={false}
            onChange={(e) => {
              // Endpoint changed → drop the fetched list (it belonged to the old base).
              patchCfg({ baseUrl: e.target.value, models: [] })
              setFetchStatus({ state: 'idle' })
              setTest({ state: 'idle' })
            }}
          />
          <span className="field__note">{t('settings.baseUrlNote')}</span>
        </section>

        {/* 1. API key first */}
        <section className="field">
          <div className="field__row">
            <label className="field__label">{t('settings.apiKey')}</label>
            <a className="field__hint-link" href={meta.keyUrl} target="_blank" rel="noreferrer">
              {t('settings.getKey')}
            </a>
          </div>

          <div className="field__inline">
            <div className="input-affix">
              <input
                className="input"
                type={showKey ? 'text' : 'password'}
                placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
                value={apiKey}
                spellCheck={false}
                onChange={(e) => {
                  patchCfg({ apiKey: e.target.value, models: [] })
                  setFetchStatus({ state: 'idle' })
                  setTest({ state: 'idle' })
                }}
              />
              <button
                type="button"
                className="input__eye"
                title={showKey ? 'Hide key' : 'Show key'}
                aria-label={showKey ? 'Hide key' : 'Show key'}
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
              </button>
            </div>
            <button
              className={`btn${fetchStatus.state === 'ok' ? ' btn--ok' : ''}${fetchStatus.state === 'fail' ? ' btn--fail' : ''}`}
              onClick={getModels}
              disabled={fetchStatus.state === 'busy'}
              title={fetchStatus.state === 'fail' ? fetchStatus.msg : ''}
            >
              {fetchStatus.state === 'busy'
                ? t('settings.fetchBusy')
                : fetchStatus.state === 'ok'
                  ? t('settings.fetchOk', Number(fetchStatus.msg) as never)
                  : fetchStatus.state === 'fail'
                    ? t('settings.fetchFail')
                    : t('settings.fetchModels')}
            </button>
          </div>
        </section>

        {/* 2. Model — chosen from the fetched list, tested in place */}
        <section className="field">
          <label className="field__label">{t('settings.model')}</label>
          <div className="field__inline">
            <FilterSelect
              value={model}
              search
              allowCustom
              onChange={(v) => patchCfg({ model: v })}
              options={modelOptions.map((m) => ({ value: m, label: modelLabel(m) }))}
            />
            <button
              className={`btn${test.state === 'ok' ? ' btn--ok' : ''}${test.state === 'fail' ? ' btn--fail' : ''}`}
              onClick={runTest}
              disabled={test.state === 'busy'}
              title={test.state === 'fail' ? test.msg : ''}
            >
              {test.state === 'busy'
                ? t('settings.testBusy')
                : test.state === 'ok'
                  ? t('settings.testOk')
                  : test.state === 'fail'
                    ? t('settings.testFail')
                    : t('settings.test')}
            </button>
          </div>
          {!models.length && (
            <span className="field__note">{t('settings.pickModelNote')}</span>
          )}
        </section>
      </div>

          <div className="view__footer">
            <button className="btn btn--primary" onClick={save}>
              {saved ? t('settings.saved') : t('settings.save')}
            </button>
          </div>
        </>
      )}

      {tab === 'sites' && (
        <section className="field">
          <span className="field__note">{t('settings.sitesDesc')}</span>
          {sites !== null && sites.length === 0 && (
            <div className="sites__empty">{t('settings.sitesEmpty')}</div>
          )}
          {sites !== null && sites.length > 0 && (
            <ul className="sites">
              {pageSites.map((pattern) => (
                <li key={pattern} className="sites__item">
                  <div className="sites__main">
                    <span className="sites__origin" title={displayOrigin(pattern)}>
                      {displayOrigin(pattern)}
                    </span>
                    <span
                      className={`sites__badge${isLocalOrigin(pattern) ? ' sites__badge--local' : ''}`}
                    >
                      {isLocalOrigin(pattern)
                        ? t('settings.sitesLocal')
                        : t('settings.sitesRemote')}
                    </span>
                  </div>
                  <button
                    className="sites__del"
                    onClick={() => revokeSite(pattern)}
                    title={t('settings.revoke')}
                    aria-label={t('settings.revoke')}
                  >
                    <TrashIcon size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {sitesPages > 1 && (
            <div className="pager">
              <button
                className="pager__btn"
                onClick={() => setSitesPage(page - 1)}
                disabled={page === 0}
                aria-label={t('settings.pagePrev')}
                title={t('settings.pagePrev')}
              >
                ‹
              </button>
              <span className="pager__info">
                {t('settings.pageInfo', (page + 1) as never, sitesPages as never)}
              </span>
              <button
                className="pager__btn"
                onClick={() => setSitesPage(page + 1)}
                disabled={page >= sitesPages - 1}
                aria-label={t('settings.pageNext')}
                title={t('settings.pageNext')}
              >
                ›
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'theme' && (
        <section className="field">
          <label className="field__label">{t('settings.theme')}</label>
          <div className="seg">
          {(
            [
              ['system', t('settings.themeSystem')],
              ['light', t('settings.themeLight')],
              ['dark', t('settings.themeDark')],
            ] as [ThemeMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              className={`seg__btn${settings.theme === mode ? ' seg__btn--on' : ''}`}
              onClick={() => onSetTheme(mode)}
            >
              {label}
            </button>
          ))}
          </div>
        </section>
      )}

      {tab === 'language' && (
        <section className="field">
          <label className="field__label">{t('settings.language')}</label>
          <FilterSelect
            value={settings.language}
            onChange={(v) => onSetLanguage(v as Language)}
            options={[
              { value: 'zh', label: '中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </section>
      )}
    </div>
  )
}
