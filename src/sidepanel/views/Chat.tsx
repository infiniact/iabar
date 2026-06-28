import { useEffect, useRef, useState } from 'react'
import { providerChat, type ChatTurn } from '../../harness'
import { modelLabel } from '../../lib/models'
import { recordServerDate } from '../../lib/license/trusted-time'
import {
  activeConfig,
  baseUrlFor,
  PROVIDERS,
  type Conversation,
  type ProviderId,
  type Settings,
} from '../../lib/store'
import {
  capturePageContext,
  listReferenceableTabs,
  PageContextError,
  type PageContext,
  type RefTab,
} from '../../lib/page-context'
import {
  AppsIcon,
  AtIcon,
  CloseIcon,
  ExpertIcon,
  HeroMark,
  PaperclipIcon,
  PencilIcon,
  ReadIcon,
  ScreenshotIcon,
  SendIcon,
  ShieldIcon,
  SkillIcon,
  TranslateIcon,
} from '../icons'
import { FilterSelect, type SelectOption } from '../FilterSelect'
import { useClickOutside } from '../useClickOutside'
import { useT } from '../../lib/i18n'

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
  onPickModel,
}: {
  settings: Settings
  conversation: Conversation
  onChange: (c: Conversation) => void
  onNeedSettings: () => void
  onPickModel: (provider: ProviderId, model: string) => void
}) {
  const t = useT()
  const cfg = activeConfig(settings)
  const [mode, setMode] = useState<'ask' | 'agent'>('ask')
  const [perm, setPerm] = useState<'manual' | 'auto'>('manual')
  // The composer's picker spans every configured provider, not just the active
  // one — pick any model and we switch providers under the hood. Option values
  // encode `provider<SEP>model` so the choice is unambiguous.
  const modelOptions = buildModelOptions(settings)
  const [messages, setMessages] = useState<Msg[]>(conversation.messages)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<PageContext[]>([])
  const [picker, setPicker] = useState<{ tabs: RefTab[]; loading: boolean } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close the @ picker on outside click/touch or Escape.
  useClickOutside(pickerRef, () => setPicker(null), !!picker)
  useEffect(() => {
    if (!picker) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPicker(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [picker])

  // Reset when switching conversations.
  useEffect(() => {
    setMessages(conversation.messages)
    setAttachments([])
    setError(null)
  }, [conversation.id])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [messages])

  // Auto-grow the composer textarea with its content.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`
  }, [input])

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
    if (!cfg.apiKey) {
      setError(t('chat.needKey'))
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
        apiKey: cfg.apiKey,
        provider: settings.provider,
        baseUrl: baseUrlFor(settings.provider),
        model: cfg.model,
        system,
        messages: history,
      })
      // Every model turn yields a trusted server timestamp — fold it in.
      recordServerDate(result.server_date)
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
      title: conversation.title || (firstUser ? firstUser.content.slice(0, 40) : t('chat.newChatTitle')),
      messages: msgs,
      updatedAt: Date.now(),
    })
  }

  // Quick-action: drop a starter prompt into the composer and focus it.
  function prefill(text: string) {
    setInput(text)
    requestAnimationFrame(() => {
      const el = taRef.current
      if (!el) return
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    })
  }

  const quickActions = [
    { icon: <AtIcon size={18} />, label: t('chat.quote'), run: () => void openPicker() },
    { icon: <ReadIcon size={18} />, label: t('chat.summarize'), run: () => prefill(t('chat.prefillSummarize')) },
    { icon: <TranslateIcon size={18} />, label: t('chat.translate'), run: () => prefill(t('chat.prefillTranslate')) },
    { icon: <PencilIcon size={18} />, label: t('chat.write'), run: () => prefill(t('chat.prefillWrite')) },
  ]

  return (
    <div className="view view--chat">
      <div className="chat__log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="welcome">
            <div className="welcome__brand">
              <HeroMark size={56} />
            </div>
            <h3 className="welcome__title">{t('chat.welcomeTitle')}</h3>
            <p className="welcome__sub">
              {t('chat.welcomeSubPre')}
              <b>@</b>
              {t('chat.welcomeSubPost')}
            </p>
            <div className="quick">
              {quickActions.map((q) => (
                <button key={q.label} className="quick__card" onClick={q.run}>
                  <span className="quick__icon">{q.icon}</span>
                  <span className="quick__label">{q.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble bubble--${m.role}`}>
              {m.pending ? (
                <span className="bubble__typing" aria-label="thinking">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                m.content
              )}
            </div>
          ))
        )}
      </div>

      <div className="chat__foot">
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

        <div className="composer">
          <div className="composer__top">
            <div className="composer__group">
              <button className="composer__tool" title={t('chat.toolQuote')} onClick={() => void openPicker()}>
                <AtIcon size={18} />
              </button>
              <button className="composer__tool" title={t('tool.screenshot') + t('tool.soon')}>
                <ScreenshotIcon size={18} />
              </button>
              <button className="composer__tool" title={t('tool.attach') + t('tool.soon')}>
                <PaperclipIcon size={18} />
              </button>
            </div>
            <div className="composer__group">
              <button className="composer__tool" title={t('tool.expert') + t('tool.soon')}>
                <ExpertIcon size={18} />
              </button>
              <button className="composer__tool" title={t('tool.skill') + t('tool.soon')}>
                <SkillIcon size={18} />
              </button>
              <button className="composer__tool" title={t('tool.apps') + t('tool.soon')}>
                <AppsIcon size={18} />
              </button>
            </div>
          </div>

          <textarea
            ref={taRef}
            rows={2}
            value={input}
            placeholder={cfg.apiKey ? t('chat.placeholder') : t('chat.placeholderNoKey')}
            disabled={busy}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />

          <div className="composer__bar">
            <div className="composer__modelsel">
              <FilterSelect
                variant="chip"
                up
                search
                value={`${settings.provider}${MODEL_SEP}${cfg.model}`}
                placeholder={t('chat.pickModel')}
                options={modelOptions}
                onChange={(v) => {
                  const i = v.indexOf(MODEL_SEP)
                  onPickModel(v.slice(0, i) as ProviderId, v.slice(i + MODEL_SEP.length))
                }}
              />
            </div>
            <FilterSelect
              variant="chip"
              up
              value={mode}
              options={[
                { value: 'ask', label: 'Ask' },
                { value: 'agent', label: 'Agent' },
              ]}
              onChange={(v) => setMode(v as 'ask' | 'agent')}
            />
            <FilterSelect
              variant="chip"
              up
              // 3rd+ control sits near the panel's right edge — anchor its menu
              // to the right so it grows inward instead of overflowing/clipping.
              menuAlign="right"
              leading={<ShieldIcon size={14} />}
              value={perm}
              options={[
                { value: 'manual', label: t('chat.permManual') },
                { value: 'auto', label: t('chat.permAuto') },
              ]}
              onChange={(v) => setPerm(v as 'manual' | 'auto')}
            />
            <div className="composer__grow" />
            <button
              className="composer__send"
              title={t('chat.send')}
              onClick={() => void send()}
              disabled={busy || !input.trim()}
            >
              <SendIcon size={16} />
            </button>
          </div>
        </div>

        {!cfg.apiKey && (
          <button className="link-btn" onClick={onNeedSettings}>
            {t('chat.goSettings')}
          </button>
        )}
      </div>

      {picker && (
        <div className="picker">
          <div className="picker__panel" ref={pickerRef}>
            <div className="picker__head">
              {t('chat.attachPage')}
              <button className="iconbtn" onClick={() => setPicker(null)}>
                <CloseIcon size={14} />
              </button>
            </div>
            {picker.loading ? (
              <div className="picker__empty">{t('chat.loadingTabs')}</div>
            ) : picker.tabs.length === 0 ? (
              <div className="picker__empty">{t('chat.noTabs')}</div>
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

// Separator inside a composer model option's value: `provider<SEP>model`. A NUL
// can't appear in a provider id or model name, so the split is unambiguous.
const MODEL_SEP = '\u0000'

/** Short provider name for the option badge (drops the parenthetical, e.g.
 *  "Kimi (Moonshot)" → "Kimi"). */
function shortLabel(label: string): string {
  return label.replace(/\s*\(.*\)\s*$/, '')
}

/** Union of every configured provider's models, tagged with the provider. A
 *  provider contributes its fetched list (or just its current model if it has a
 *  key but no fetched list); the active provider's current model is always
 *  included so the picker's value resolves. */
function buildModelOptions(settings: Settings): SelectOption[] {
  const opts: SelectOption[] = []
  const seen = new Set<string>()
  const add = (provider: ProviderId, model: string, badge: string) => {
    if (!model) return
    const value = `${provider}${MODEL_SEP}${model}`
    if (seen.has(value)) return
    seen.add(value)
    opts.push({ value, label: modelLabel(model), badge })
  }
  for (const p of PROVIDERS) {
    const c = settings.byProvider[p.id]
    if (!c) continue
    if (c.models?.length) {
      for (const m of c.models) add(p.id, m, shortLabel(p.label))
    } else if (c.apiKey) {
      add(p.id, c.model, shortLabel(p.label))
    }
  }
  const active = PROVIDERS.find((p) => p.id === settings.provider)
  const activeCfg = settings.byProvider[settings.provider]
  if (active && activeCfg) add(active.id, activeCfg.model, shortLabel(active.label))
  return opts
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
