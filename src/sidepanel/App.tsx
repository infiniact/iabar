import { useEffect, useMemo, useRef, useState } from 'react'
import {
  harnessVersion,
  hookEvents,
  initHarness,
  providerChat,
  validateHooks,
  type ChatTurn,
  type ValidateResult,
} from '../harness'

const SAMPLE_HOOKS = `# AI agent [[hooks]] config — parsed & validated by real engine code in wasm.
[[hooks]]
event = "PreToolUse"
command = "echo blocking dangerous tool"
if = "tool == shell"
timeout_secs = 10

[[hooks]]
event = "Stop"
prompt = "Summarize what changed in {{path}}."
`

type HarnessState =
  | { status: 'loading' }
  | { status: 'ready'; version: string; events: string[] }
  | { status: 'error'; message: string }

export function App() {
  const [harness, setHarness] = useState<HarnessState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    initHarness()
      .then(() => {
        if (cancelled) return
        setHarness({
          status: 'ready',
          version: harnessVersion(),
          events: hookEvents(),
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setHarness({ status: 'error', message: String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__brand">
          <span className="app__logo">⌘</span>
          <div>
            <h1>IABar</h1>
            <p className="app__tagline">AI agent harness · WebAssembly</p>
          </div>
        </div>
        <HarnessBadge harness={harness} />
      </header>

      {harness.status === 'ready' && <Chat />}

      {harness.status === 'error' && (
        <div className="panel panel--error">
          <strong>Harness failed to load</strong>
          <pre>{harness.message}</pre>
        </div>
      )}

      {harness.status === 'ready' && <HookLab events={harness.events} />}
    </div>
  )
}

function HarnessBadge({ harness }: { harness: HarnessState }) {
  if (harness.status === 'loading') {
    return <span className="badge badge--pending">loading wasm…</span>
  }
  if (harness.status === 'error') {
    return <span className="badge badge--error">offline</span>
  }
  return (
    <span className="badge badge--ok" title={`${harness.events.length} hook events`}>
      v{harness.version} · {harness.events.length} events
    </span>
  )
}

function HookLab({ events }: { events: string[] }) {
  const [src, setSrc] = useState(SAMPLE_HOOKS)
  const [result, setResult] = useState<ValidateResult | null>(null)

  // Validate on mount and whenever the user edits, debounced lightly.
  useEffect(() => {
    const id = setTimeout(() => setResult(validateHooks(src)), 150)
    return () => clearTimeout(id)
  }, [src])

  return (
    <section className="panel">
      <div className="panel__title">
        <h2>Hook Lab</h2>
        <span className="panel__hint">parsed by the AI agent engine · wasm</span>
      </div>

      <textarea
        className="hook-editor"
        spellCheck={false}
        value={src}
        onChange={(e) => setSrc(e.target.value)}
      />

      {result && <ValidationView result={result} knownEvents={events} />}
    </section>
  )
}

function ValidationView({
  result,
  knownEvents,
}: {
  result: ValidateResult
  knownEvents: string[]
}) {
  const known = useMemo(() => new Set(knownEvents), [knownEvents])

  if (!result.ok) {
    return (
      <div className="result result--error">
        <span className="result__icon">✗</span>
        <code>{result.error}</code>
      </div>
    )
  }

  return (
    <div className="result result--ok">
      <div className="result__summary">
        ✓ {result.count} hook{result.count === 1 ? '' : 's'} valid
      </div>
      <ul className="hook-list">
        {result.hooks.map((h, i) => (
          <li key={i} className="hook-item">
            <span className={`tag tag--${h.kind}`}>{h.kind}</span>
            <span
              className={`hook-item__event${known.has(h.event) ? '' : ' hook-item__event--unknown'}`}
            >
              {h.event}
            </span>
            <span className="hook-item__detail">{h.detail}</span>
            <span className="hook-item__meta">
              {h.has_condition && <span className="dot" title="has condition">if</span>}
              {h.timeout_secs}s
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface Msg extends ChatTurn {
  pending?: boolean
}

const API_KEY_STORAGE = 'iabar.anthropic.apiKey'

function Chat() {
  const [apiKey, setApiKey] = useState('')
  const [keyLoaded, setKeyLoaded] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load the saved API key from extension storage on mount.
  useEffect(() => {
    chrome.storage?.local.get(API_KEY_STORAGE).then((v) => {
      if (v[API_KEY_STORAGE]) setApiKey(v[API_KEY_STORAGE])
      setKeyLoaded(true)
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  function saveKey(k: string) {
    setApiKey(k)
    chrome.storage?.local.set({ [API_KEY_STORAGE]: k })
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    if (!apiKey) {
      setError('Set your Anthropic API key first.')
      return
    }
    setError(null)
    const history: ChatTurn[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '', pending: true }])
    setInput('')
    setBusy(true)
    try {
      // Drives through the real engine LlmProvider trait (wasm).
      const result = await providerChat({
        apiKey,
        messages: history,
        system:
          'You are IABar, an AI assistant running inside a Chrome extension powered by an AI agent harness compiled to WebAssembly. Be concise.',
      })
      setMessages([...history, { role: 'assistant', content: result.text }])
    } catch (e: unknown) {
      setMessages(history)
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (!keyLoaded) return null

  return (
    <section className="panel chat">
      <div className="panel__title">
        <h2>Agent</h2>
        <span className="panel__hint">claude-opus-4-8 · wasm fetch</span>
      </div>

      {!apiKey && (
        <input
          className="chat__key"
          type="password"
          placeholder="Anthropic API key (sk-ant-…)"
          onBlur={(e) => e.target.value && saveKey(e.target.value.trim())}
        />
      )}

      <div className="chat__log" ref={scrollRef}>
        {messages.length === 0 && (
          <p className="muted-copy">Ask anything. Messages go straight to Claude from wasm.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.pending ? <span className="bubble__typing">…</span> : m.content}
          </div>
        ))}
      </div>

      {error && <div className="chat__error">{error}</div>}

      <div className="chat__input">
        <textarea
          rows={2}
          value={input}
          placeholder="Message Claude…"
          disabled={busy}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button onClick={() => void send()} disabled={busy || !input.trim()}>
          {busy ? '…' : 'Send'}
        </button>
      </div>
      {apiKey && (
        <button className="chat__clearkey" onClick={() => saveKey('')}>
          clear API key
        </button>
      )}
    </section>
  )
}
