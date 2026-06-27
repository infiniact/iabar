import { useEffect, useRef, useState } from 'react'
import { providerChat, type ChatTurn } from '../../harness'
import type { Conversation, Settings } from '../../lib/store'
import {
  capturePageContext,
  listReferenceableTabs,
  PageContextError,
  type PageContext,
  type RefTab,
} from '../../lib/page-context'
import { AtIcon, CloseIcon, SendIcon } from '../icons'

interface Msg extends ChatTurn {
  pending?: boolean
}

const SYSTEM_BASE =
  'You are IABar, an AI assistant running inside a Chrome extension powered by an agent harness compiled to WebAssembly. Be concise.'

export function ChatView({
  settings,
  conversation,
  onChange,
  onNeedSettings,
}: {
  settings: Settings
  conversation: Conversation
  onChange: (c: Conversation) => void
  onNeedSettings: () => void
}) {
  const [messages, setMessages] = useState<Msg[]>(conversation.messages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<PageContext[]>([])
  const [picker, setPicker] = useState<{ tabs: RefTab[]; loading: boolean } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Reset when switching conversations.
  useEffect(() => {
    setMessages(conversation.messages)
    setAttachments([])
    setError(null)
  }, [conversation.id])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  async function openPicker() {
    setPicker({ tabs: [], loading: true })
    try {
      setPicker({ tabs: await listReferenceableTabs(), loading: false })
    } catch (e) {
      setPicker(null)
      setError(String(e))
    }
  }

  async function attach(tab: RefTab) {
    setPicker(null)
    setError(null)
    try {
      const ctx = await capturePageContext(tab)
      setAttachments((a) => [...a.filter((x) => x.url !== ctx.url), ctx])
    } catch (e) {
      setError(e instanceof PageContextError ? e.message : String(e))
    }
  }

  function onInputChange(v: string) {
    // Typing `@` opens the tab picker (and we strip the trigger char).
    if (v.endsWith('@') && !input.endsWith('@')) {
      setInput(v.slice(0, -1))
      void openPicker()
      return
    }
    setInput(v)
  }

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    if (!settings.apiKey) {
      setError('Set your API key in Settings first.')
      return
    }
    setError(null)

    const history: ChatTurn[] = [...messages.map(stripPending), { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '', pending: true }])
    setInput('')
    setBusy(true)

    const system = attachments.length
      ? `${SYSTEM_BASE}\n\nThe user attached page context with @:\n${attachments
          .map(
            (a, i) =>
              `[${i + 1}] ${a.title} <${a.url}>\n${a.selection ? `selection: ${a.selection}\n` : ''}${a.text}`,
          )
          .join('\n\n')}`
      : SYSTEM_BASE

    try {
      const result = await providerChat({
        apiKey: settings.apiKey,
        model: settings.model,
        system,
        messages: history,
      })
      const next = [...history, { role: 'assistant' as const, content: result.text }]
      setMessages(next)
      setAttachments([])
      persist(next)
    } catch (e) {
      setMessages(history)
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  function persist(msgs: ChatTurn[]) {
    const firstUser = msgs.find((m) => m.role === 'user')
    onChange({
      ...conversation,
      title: conversation.title || (firstUser ? firstUser.content.slice(0, 40) : 'New chat'),
      messages: msgs,
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="view view--chat">
      <div className="chat__log" ref={logRef}>
        {messages.length === 0 && (
          <p className="muted-copy">
            Ask anything. Type <b>@</b> to attach a page as context — IABar asks for that site’s
            permission only when you reference it.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble bubble--${m.role}`}>
            {m.pending ? <span className="bubble__typing">…</span> : m.content}
          </div>
        ))}
      </div>

      {error && <div className="chat__error">{error}</div>}

      {attachments.length > 0 && (
        <div className="chips">
          {attachments.map((a) => (
            <span className="chip" key={a.url} title={a.url}>
              @{hostOf(a.url)}
              <button
                className="chip__x"
                onClick={() => setAttachments((s) => s.filter((x) => x.url !== a.url))}
                aria-label="remove"
              >
                <CloseIcon size={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="chat__input">
        <button className="iconbtn" title="Attach a page (@)" onClick={() => void openPicker()}>
          <AtIcon size={16} />
        </button>
        <textarea
          rows={2}
          value={input}
          placeholder={settings.apiKey ? 'Message…  (@ to attach a page)' : 'Set an API key in Settings →'}
          disabled={busy}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button className="iconbtn iconbtn--send" onClick={() => void send()} disabled={busy || !input.trim()}>
          <SendIcon size={16} />
        </button>
      </div>

      {!settings.apiKey && (
        <button className="link-btn" onClick={onNeedSettings}>
          Go to Settings to add a key
        </button>
      )}

      {picker && (
        <div className="picker" onClick={() => setPicker(null)}>
          <div className="picker__panel" onClick={(e) => e.stopPropagation()}>
            <div className="picker__head">
              Attach a page
              <button className="iconbtn" onClick={() => setPicker(null)}>
                <CloseIcon size={14} />
              </button>
            </div>
            {picker.loading ? (
              <div className="picker__empty">Loading tabs…</div>
            ) : picker.tabs.length === 0 ? (
              <div className="picker__empty">No referenceable tabs.</div>
            ) : (
              <ul className="picker__list">
                {picker.tabs.map((t) => (
                  <li key={t.id}>
                    <button className="picker__item" onClick={() => void attach(t)}>
                      {t.favIconUrl && <img src={t.favIconUrl} alt="" width={16} height={16} />}
                      <span className="picker__t">{t.title}</span>
                      <span className="picker__u">{hostOf(t.url)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function stripPending(m: Msg): ChatTurn {
  return { role: m.role, content: m.content }
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
