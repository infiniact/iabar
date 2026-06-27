import { useState } from 'react'
import { providerChat } from '../../harness'
import { fetchModels } from '../../lib/models'
import { PROVIDERS, type ProviderId, type Settings, type ThemeMode } from '../../lib/store'

type Status =
  | { state: 'idle' }
  | { state: 'busy' }
  | { state: 'ok'; msg?: string }
  | { state: 'fail'; msg: string }

export function SettingsView({
  settings,
  onSave,
  onSetTheme,
}: {
  settings: Settings
  onSave: (next: Settings) => void
  onSetTheme: (mode: ThemeMode) => void
}) {
  const [provider, setProvider] = useState<ProviderId>(settings.provider)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [keyMode, setKeyMode] = useState<'get' | 'manual'>(settings.apiKey ? 'manual' : 'get')
  const [model, setModel] = useState(settings.model)
  const [models, setModels] = useState<string[]>([])
  const [fetchStatus, setFetchStatus] = useState<Status>({ state: 'idle' })
  const [test, setTest] = useState<Status>({ state: 'idle' })
  const [saved, setSaved] = useState(false)

  const meta = PROVIDERS.find((p) => p.id === provider)!
  const modelOptions = models.length ? models : [model || meta.defaultModel]

  function pickProvider(id: ProviderId) {
    const m = PROVIDERS.find((p) => p.id === id)!
    if (!m.enabled) return
    setProvider(id)
    setModel(m.defaultModel)
    setModels([])
    setFetchStatus({ state: 'idle' })
    setTest({ state: 'idle' })
  }

  // Step after the key: pull the model list (also validates the key).
  async function getModels() {
    if (!apiKey.trim()) {
      setFetchStatus({ state: 'fail', msg: 'Enter an API key first.' })
      return
    }
    setFetchStatus({ state: 'busy' })
    try {
      const ids = await fetchModels(provider, apiKey)
      setModels(ids)
      setModel((cur) => (ids.includes(cur) ? cur : ids[0]))
      setFetchStatus({ state: 'ok', msg: `${ids.length} models` })
    } catch (e) {
      setModels([])
      setFetchStatus({ state: 'fail', msg: String(e instanceof Error ? e.message : e) })
    }
  }

  async function runTest() {
    if (!apiKey.trim()) {
      setTest({ state: 'fail', msg: 'Enter an API key first.' })
      return
    }
    setTest({ state: 'busy' })
    try {
      await providerChat({
        apiKey: apiKey.trim(),
        provider,
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
    onSave({ provider, model, apiKey: apiKey.trim(), theme: settings.theme })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="view view--settings">
      <h2 className="view__title">Settings</h2>

      <section className="field">
        <label className="field__label">Provider</label>
        <div className="seg">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              className={`seg__btn${provider === p.id ? ' seg__btn--on' : ''}`}
              disabled={!p.enabled}
              title={p.enabled ? '' : 'Coming soon'}
              onClick={() => pickProvider(p.id)}
            >
              {p.label}
              {!p.enabled && <span className="seg__soon">soon</span>}
            </button>
          ))}
        </div>
      </section>

      {/* 1. API key first */}
      <section className="field">
        <div className="field__row">
          <label className="field__label">API key</label>
          <div className="seg seg--mini">
            <button
              className={`seg__btn${keyMode === 'get' ? ' seg__btn--on' : ''}`}
              onClick={() => setKeyMode('get')}
            >
              获取
            </button>
            <button
              className={`seg__btn${keyMode === 'manual' ? ' seg__btn--on' : ''}`}
              onClick={() => setKeyMode('manual')}
            >
              手动输入
            </button>
          </div>
        </div>

        {keyMode === 'get' && (
          <a className="field__hint-link" href={meta.keyUrl} target="_blank" rel="noreferrer">
            Open {meta.label} console to create a key ↗
          </a>
        )}

        <input
          className="input"
          type="password"
          placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'sk-…'}
          value={apiKey}
          spellCheck={false}
          onChange={(e) => {
            setApiKey(e.target.value)
            setFetchStatus({ state: 'idle' })
            setTest({ state: 'idle' })
            setModels([])
          }}
        />

        <div className="field__actions">
          <button className="btn" onClick={getModels} disabled={fetchStatus.state === 'busy'}>
            {fetchStatus.state === 'busy' ? 'Fetching…' : '获取模型列表'}
          </button>
          {fetchStatus.state === 'ok' && <span className="status status--ok">✓ {fetchStatus.msg}</span>}
          {fetchStatus.state === 'fail' && (
            <span className="status status--fail">✗ {fetchStatus.msg}</span>
          )}
        </div>
      </section>

      {/* 2. Model — chosen from the fetched list */}
      <section className="field">
        <label className="field__label">Model</label>
        <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {!models.length && (
          <span className="field__note">Fetch the model list above, then pick one.</span>
        )}
      </section>

      <section className="field">
        <label className="field__label">Theme</label>
        <div className="seg">
          {(
            [
              ['system', '跟随系统'],
              ['light', '浅色'],
              ['dark', '深色'],
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

      <div className="view__footer">
        <div className="field__actions">
          <button className="btn" onClick={runTest} disabled={test.state === 'busy'}>
            {test.state === 'busy' ? 'Testing…' : '测试'}
          </button>
          {test.state === 'ok' && <span className="status status--ok">✓ works</span>}
          {test.state === 'fail' && <span className="status status--fail">✗ {test.msg}</span>}
        </div>
        <button className="btn btn--primary" onClick={save}>
          {saved ? 'Saved ✓' : '保存'}
        </button>
      </div>
    </div>
  )
}
