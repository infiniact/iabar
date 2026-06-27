import { useState } from 'react'
import { anthropicChat } from '../../harness'
import { PROVIDERS, type Settings, type ThemeMode } from '../../lib/store'

type TestState =
  | { state: 'idle' }
  | { state: 'testing' }
  | { state: 'ok' }
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
  const [provider, setProvider] = useState(settings.provider)
  const [model, setModel] = useState(settings.model)
  const [apiKey, setApiKey] = useState(settings.apiKey)
  const [keyMode, setKeyMode] = useState<'get' | 'manual'>(settings.apiKey ? 'manual' : 'get')
  const [test, setTest] = useState<TestState>({ state: 'idle' })
  const [saved, setSaved] = useState(false)

  const meta = PROVIDERS.find((p) => p.id === provider)!

  function pickProvider(id: typeof provider) {
    const m = PROVIDERS.find((p) => p.id === id)!
    if (!m.enabled) return
    setProvider(id)
    setModel(m.defaultModel)
    setTest({ state: 'idle' })
  }

  async function runTest() {
    if (!apiKey.trim()) {
      setTest({ state: 'fail', msg: 'Enter an API key first.' })
      return
    }
    setTest({ state: 'testing' })
    try {
      await anthropicChat({
        apiKey: apiKey.trim(),
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

      <section className="field">
        <label className="field__label">Model</label>
        <input
          className="input"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          spellCheck={false}
        />
      </section>

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
          placeholder={provider === 'anthropic' ? 'sk-ant-…' : 'API key'}
          value={apiKey}
          spellCheck={false}
          onChange={(e) => {
            setApiKey(e.target.value)
            setTest({ state: 'idle' })
          }}
        />

        <div className="field__actions">
          <button className="btn" onClick={runTest} disabled={test.state === 'testing'}>
            {test.state === 'testing' ? 'Testing…' : '测试'}
          </button>
          {test.state === 'ok' && <span className="status status--ok">✓ key works</span>}
          {test.state === 'fail' && <span className="status status--fail">✗ {test.msg}</span>}
        </div>
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
        <button className="btn btn--primary" onClick={save}>
          {saved ? 'Saved ✓' : '保存'}
        </button>
      </div>
    </div>
  )
}
