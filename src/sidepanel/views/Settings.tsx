import { useState } from 'react'
import { providerChat } from '../../harness'
import { fetchModels, modelLabel } from '../../lib/models'
import {
  baseUrlFor,
  PROVIDERS,
  providerKind,
  type Language,
  type ProviderId,
  type Settings,
  type ThemeMode,
} from '../../lib/store'
import { useT } from '../../lib/i18n'
import { EyeIcon, EyeOffIcon } from '../icons'
import { FilterSelect } from '../FilterSelect'
import { LicenseSection } from './LicenseSection'

type Status =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'ok'; msg?: string }
  | { state: 'fail'; msg: string }

export function SettingsView({
  settings,
  onSave,
  onSetTheme,
  onSetLanguage,
  onDone,
}: {
  settings: Settings
  onSave: (next: Settings) => void
  onSetTheme: (mode: ThemeMode) => void
  onSetLanguage: (lang: Language) => void
  onDone: () => void
}) {
  const t = useT()
  const [provider, setProvider] = useState<ProviderId>(settings.provider)
  // Per-provider credentials/model — switching never loses what you entered.
  const [byProvider, setByProvider] = useState(settings.byProvider)
  const [showKey, setShowKey] = useState(false)
  const [fetchStatus, setFetchStatus] = useState<Status>({ state: 'idle' })
  const [test, setTest] = useState<Status>({ state: 'idle' })
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'provider' | 'language' | 'theme' | 'license'>('provider')

  const meta = PROVIDERS.find((p) => p.id === provider)!
  const cfg = byProvider[provider]
  const apiKey = cfg.apiKey
  const model = cfg.model
  // The "checked" model list lives in the provider config so it persists.
  const models = cfg.models ?? []
  const modelOptions = models.length ? models : [model || meta.defaultModel]

  function patchCfg(patch: Partial<{ apiKey: string; model: string; models: string[] }>) {
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
      const ids = await fetchModels(provider, apiKey)
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
        baseUrl: baseUrlFor(provider),
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
            ['language', t('settings.language')],
            ['theme', t('settings.theme')],
            ['license', t('license.title')],
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

      {tab === 'license' && <LicenseSection />}
    </div>
  )
}
