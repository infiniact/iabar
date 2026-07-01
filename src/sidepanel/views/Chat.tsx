import { useEffect, useRef, useState } from 'react'
import { agentRun, type ChatTurn } from '../../harness'
import { BROWSER_TOOLS, browserToolDispatch } from '../../lib/browser-tools'
import { modelLabel } from '../../lib/models'
import { recordServerDate } from '../../lib/license/trusted-time'
import {
  activeConfig,
  baseUrlFor,
  PROVIDERS,
  type Conversation,
  type ProviderId,
  type Settings,
  type StoredTurn,
} from '../../lib/store'
import {
  activeReferenceableTab,
  capturePageContext,
  capturePageContextIfGranted,
  listReferenceableTabs,
  PageContextError,
  type PageContext,
  type RefTab,
} from '../../lib/page-context'
import { hasOrigin } from '../../lib/origin-permission'
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
import { Markdown } from '../Markdown'

interface Msg extends StoredTurn {
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
  // Manually @-referenced pages — persist across turns (not cleared on send).
  const [attachments, setAttachments] = useState<PageContext[]>([])
  // The active browser tab, auto-referenced as the default first @ slot; it
  // tracks the current tab live and `dismissedUrl` lets the user drop it (until
  // they switch to a different page).
  const [currentTab, setCurrentTab] = useState<RefTab | null>(null)
  const [dismissedUrl, setDismissedUrl] = useState<string | null>(null)
  // Live, ephemeral agent activity for the in-flight run (compaction, tool
  // calls) — surfaced from the loop's event stream, never persisted.
  const [activity, setActivity] = useState<string[]>([])
  const [picker, setPicker] = useState<{ tabs: RefTab[]; loading: boolean } | null>(null)
  // Shell-style ↑/↓ recall of prior user turns. `histIdx` indexes the user
  // messages (null = editing a fresh draft); `draft` is the in-progress input
  // stashed when we start navigating, restored when ↓ returns past the newest.
  const [histIdx, setHistIdx] = useState<number | null>(null)
  const draftRef = useRef<{ content: string; attachments: PageContext[] }>({
    content: '',
    attachments: [],
  })
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

  // Track the active browser tab so it can ride as the default first @ slot.
  useEffect(() => {
    let cancelled = false
    const refresh = async () => {
      const tab = await activeReferenceableTab()
      if (!cancelled) setCurrentTab(tab)
    }
    void refresh()
    const onActivated = () => void refresh()
    const onUpdated = (_id: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.url || info.status === 'complete' || info.title) void refresh()
    }
    const onFocus = () => void refresh()
    chrome.tabs?.onActivated.addListener(onActivated)
    chrome.tabs?.onUpdated.addListener(onUpdated)
    chrome.windows?.onFocusChanged.addListener(onFocus)
    return () => {
      cancelled = true
      chrome.tabs?.onActivated.removeListener(onActivated)
      chrome.tabs?.onUpdated.removeListener(onUpdated)
      chrome.windows?.onFocusChanged.removeListener(onFocus)
    }
  }, [])

  // Reset per-conversation state. Manual attachments persist across turns but
  // reset when the conversation changes.
  useEffect(() => {
    setMessages(conversation.messages)
    setAttachments([])
    setActivity([])
    setHistIdx(null)
    setError(null)
  }, [conversation.id])

  // The current tab shown as the default @ slot 0 — unless dismissed, or already
  // in the manual attachments.
  const showCurrentTab =
    currentTab && currentTab.url !== dismissedUrl && !attachments.some((a) => a.url === currentTab.url)

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

    // `base` is the committed transcript (Msg[], carrying attachments); the user
    // turn keeps its @ page contexts so they persist + show as chips. The engine
    // gets a *reconstructed* history (page context folded into each user turn)
    // plus the new prompt — but we persist the original `base`, not that.
    const base = messages.filter((m) => !m.pending)
    // Revoke is authoritative (ADR 0009): a page attached earlier whose origin
    // the user has since removed (Settings → Sites) must not be re-sent. Re-check
    // the manual @ chips against the live grants and drop any no longer allowed —
    // from both the outgoing turn and the visible composer state.
    const grants = await Promise.all(attachments.map((a) => hasOrigin(a.url)))
    const manual = attachments.filter((_, i) => grants[i])
    if (manual.length !== attachments.length) setAttachments(manual)
    setInput('')
    setActivity([])
    setHistIdx(null)
    setBusy(true)

    // Prepend the current tab as the default first @ — captured fresh, but only
    // if its origin is already granted (no prompt on send). Otherwise the chip
    // still shows; its content joins once the user @-grants that site once.
    let atts = manual
    if (showCurrentTab && currentTab) {
      const ctx = await capturePageContextIfGranted(currentTab)
      if (ctx) atts = [ctx, ...manual.filter((a) => a.url !== ctx.url)]
    }
    const userTurn: Msg = { role: 'user', content: text, attachments: atts.length ? atts : undefined }
    setMessages([...base, userTurn, { role: 'assistant', content: '', pending: true }])

    // Page context (@) must ride in the user prompt — the engine ignores
    // `system` once there's prior history (it's the cache anchor, carried by the
    // transcript), which would otherwise drop the page.
    const history: ChatTurn[] = base.map(toEngineTurn)
    const userPrompt = buildPrompt(atts, text)

    let acc = ''
    try {
      const result = await agentRun(
        {
          apiKey: cfg.apiKey,
          provider: settings.provider,
          baseUrl: baseUrlFor(settings.provider),
          model: cfg.model,
          system: SYSTEM_BASE,
          history,
          userPrompt,
          // Agent mode lets the loop iterate (tool calls); Ask keeps it short.
          maxTurns: mode === 'agent' ? 12 : 6,
          tools: BROWSER_TOOLS,
        },
        (ev) => {
          switch (ev.type) {
            // Stream assistant text into the pending bubble as it arrives.
            case 'assistant_delta':
              acc += ev.text
              setMessages((cur) => withStreamingTail(cur, acc))
              break
            // Surface the loop's compaction + tool activity live.
            case 'pre_compact':
              setActivity((a) => [...a, `${t('chat.actCompacting')} (${ev.beforeMessages})`])
              break
            case 'post_compact':
              setActivity((a) => [
                ...a,
                `${t('chat.actCompacted')} → ${ev.afterMessages}${ev.droppedMessages ? ` (-${ev.droppedMessages})` : ''}`,
              ])
              break
            case 'tool_call_start':
              if (ev.name) setActivity((a) => [...a, `${t('chat.actTool')} · ${ev.name}`])
              break
            case 'tool_call_result':
              setActivity((a) => [
                ...a,
                `${t('chat.actTool')} · ${ev.name} ${ev.isError ? t('chat.actToolFail') : t('chat.actToolDone')}`,
              ])
              break
          }
        },
        browserToolDispatch,
      )
      // Every run yields a trusted server timestamp from its last call.
      recordServerDate(result.server_date)
      const next: Msg[] = [...base, userTurn, { role: 'assistant', content: result.text || acc }]
      setMessages(next)
      // Manual @ attachments persist across turns (not cleared here).
      persist(next)
    } catch (e) {
      setMessages([...base, userTurn])
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  function persist(msgs: StoredTurn[]) {
    const firstUser = msgs.find((m) => m.role === 'user')
    onChange({
      ...conversation,
      title: conversation.title || (firstUser ? firstUser.content.slice(0, 40) : t('chat.newChatTitle')),
      messages: msgs,
      updatedAt: Date.now(),
    })
  }

  // Shell-style history: recall prior user turns (text + their @ attachments).
  // Returns true if it handled the key (so the caller suppresses the default
  // caret move). Only fires at the first/last line so multi-line edits work.
  function navHistory(dir: -1 | 1): boolean {
    const hist = messages.filter((m) => m.role === 'user')
    if (!hist.length) return false
    let idx = histIdx
    if (dir === -1) {
      if (idx === null) {
        draftRef.current = { content: input, attachments }
        idx = hist.length - 1
      } else if (idx > 0) {
        idx -= 1
      } else {
        return true // already at the oldest
      }
    } else {
      if (idx === null) return false
      if (idx < hist.length - 1) {
        idx += 1
      } else {
        // Past the newest → back to the in-progress draft.
        setHistIdx(null)
        setInput(draftRef.current.content)
        setAttachments(draftRef.current.attachments)
        return true
      }
    }
    setHistIdx(idx)
    setInput(hist[idx].content)
    setAttachments(hist[idx].attachments ?? [])
    return true
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

  // Capability cards for the empty-state hub (2×2 grid, à la Sider/Monica).
  const capabilities = [
    {
      icon: <ReadIcon size={18} />,
      label: t('chat.summarize'),
      desc: t('hub.capSummarizeDesc'),
      run: () => prefill(t('chat.prefillSummarize')),
    },
    {
      icon: <TranslateIcon size={18} />,
      label: t('chat.translate'),
      desc: t('hub.capTranslateDesc'),
      run: () => prefill(t('chat.prefillTranslate')),
    },
    {
      icon: <PencilIcon size={18} />,
      label: t('chat.write'),
      desc: t('hub.capWriteDesc'),
      run: () => prefill(t('chat.prefillWrite')),
    },
    {
      icon: <SkillIcon size={18} />,
      label: t('chat.research'),
      desc: t('hub.capResearchDesc'),
      run: () => prefill(t('chat.prefillResearch')),
    },
  ]

  // Providers with a key or a fetched model list — shown as compare chips.
  const configuredProviders = PROVIDERS.filter((p) => {
    const c = settings.byProvider[p.id]
    return c && (c.apiKey || c.models?.length)
  })

  return (
    <div className="view view--chat">
      <div className="chat__log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="hub">
            <div className="hub__head">
              <HeroMark size={44} />
              <h3 className="hub__title">{t('hub.title')}</h3>
              <p className="hub__sub">{t('hub.sub')}</p>
            </div>
            {configuredProviders.length > 0 && (
              <div className="hub__models">
                {configuredProviders.map((p) => (
                  <button
                    key={p.id}
                    className={`mchip${settings.provider === p.id ? ' mchip--on' : ''}`}
                    title={p.label}
                    onClick={() => onPickModel(p.id, settings.byProvider[p.id].model)}
                  >
                    {shortLabel(p.label)}
                  </button>
                ))}
              </div>
            )}
            <div className="hub__grid">
              {capabilities.map((c) => (
                <button key={c.label} className="cap" onClick={c.run}>
                  <span className="cap__icon">{c.icon}</span>
                  <span className="cap__text">
                    <span className="cap__label">{c.label}</span>
                    <span className="cap__desc">{c.desc}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`bubble bubble--${m.role}`}>
              {m.attachments && m.attachments.length > 0 && (
                <div className="bubble__refs">
                  {m.attachments.map((a) => (
                    <span className="chip chip--ref" key={a.url} title={a.url}>
                      @{hostOf(a.url)}
                    </span>
                  ))}
                </div>
              )}
              {m.pending && !m.content ? (
                <span className="bubble__typing" aria-label="thinking">
                  <span />
                  <span />
                  <span />
                </span>
              ) : m.role === 'assistant' ? (
                <Markdown content={m.content} />
              ) : (
                m.content
              )}
            </div>
          ))
        )}
        {activity.length > 0 && (
          <div className="activity" aria-label="agent activity">
            {activity.map((line, i) => (
              <div className="activity__line" key={i}>
                {line}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="chat__foot">
        {error && <div className="chat__error">{error}</div>}

        {(showCurrentTab || attachments.length > 0) && (
          <div className="chips">
            {showCurrentTab && currentTab && (
              <span className="chip chip--current" key="__current" title={currentTab.url}>
                @{hostOf(currentTab.url)}
                <button
                  className="chip__x"
                  onClick={() => setDismissedUrl(currentTab.url)}
                  aria-label="remove"
                >
                  <CloseIcon size={12} />
                </button>
              </span>
            )}
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
              // IME (Chinese/Japanese/…): while composing, Enter confirms the
              // candidate — never send. `isComposing`/keyCode 229 mark that the
              // keystroke belongs to the IME, so the first Enter confirms and
              // only a subsequent Enter (composition ended) sends.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
                return
              }
              const el = e.currentTarget
              // ↑ on the first line / ↓ on the last line walks input history.
              if (e.key === 'ArrowUp' && !el.value.slice(0, el.selectionStart).includes('\n')) {
                if (navHistory(-1)) e.preventDefault()
              } else if (e.key === 'ArrowDown' && !el.value.slice(el.selectionStart).includes('\n')) {
                if (navHistory(1)) e.preventDefault()
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

/** Fold a turn's @ page contexts into its text the way the model should see it. */
function buildPrompt(atts: PageContext[], text: string): string {
  if (!atts.length) return text
  const block = atts
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title} <${a.url}>\n${a.selection ? `selection: ${a.selection}\n` : ''}${a.text}`,
    )
    .join('\n\n')
  return `The user attached page context with @:\n${block}\n\n${text}`
}

/** Project a stored turn to what the engine consumes (role + content), folding
 *  a user turn's attachments into its content so context survives across turns. */
function toEngineTurn(m: Msg): ChatTurn {
  if (m.role === 'user' && m.attachments?.length) {
    return { role: 'user', content: buildPrompt(m.attachments, m.content) }
  }
  return { role: m.role, content: m.content }
}

/** Replace the trailing (pending) assistant bubble's text with the streamed
 *  accumulation so far, keeping it marked pending until the run settles. */
function withStreamingTail(cur: Msg[], content: string): Msg[] {
  const copy = cur.slice()
  const last = copy[copy.length - 1]
  if (last && last.role === 'assistant') {
    copy[copy.length - 1] = { role: 'assistant', content, pending: true }
  }
  return copy
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
