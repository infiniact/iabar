import { useEffect, useRef, useState } from 'react'
import { initHarness } from '../harness'
import {
  DEFAULT_SETTINGS,
  deleteConversation,
  loadConversations,
  loadSettings,
  newConversation,
  saveConversation,
  saveSettings,
  type Conversation,
  type Language,
  type ProviderId,
  type Settings,
  type ThemeMode,
} from '../lib/store'
import { LangContext, translate } from '../lib/i18n'
import { initTrustedTime } from '../lib/license/trusted-time'
import { useTheme } from './theme'
import { ChatView } from './views/Chat'
import { HistoryView } from './views/History'
import { SettingsView } from './views/Settings'
import { CloseIcon, HistoryIcon, PlusIcon, SettingsIcon } from './icons'
import { useClickOutside } from './useClickOutside'

type View = 'chat' | 'history'
type Boot = 'loading' | 'ready' | 'error'

export function App() {
  const [boot, setBoot] = useState<Boot>('loading')
  const [bootMsg, setBootMsg] = useState('')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conv, setConv] = useState<Conversation>(() => newConversation())
  const [view, setView] = useState<View>('chat')
  // Settings is an overlay popup over the chat (closes on outside click / Esc).
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useTheme(settings.theme)

  useClickOutside(settingsRef, () => setSettingsOpen(false), settingsOpen)
  useEffect(() => {
    if (!settingsOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [, s, list] = await Promise.all([
          initHarness(),
          loadSettings(),
          loadConversations(),
          initTrustedTime(),
        ])
        if (cancelled) return
        setSettings(s)
        setConversations(list)
        setBoot('ready')
      } catch (e) {
        if (cancelled) return
        setBootMsg(String(e))
        setBoot('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function newChat() {
    setConv(newConversation())
    setView('chat')
  }

  function openConv(c: Conversation) {
    setConv(c)
    setView('chat')
  }

  function onConvChange(c: Conversation) {
    setConv(c)
    setConversations((list) => [c, ...list.filter((x) => x.id !== c.id)])
    void saveConversation(c)
  }

  async function onDeleteConv(id: string) {
    await deleteConversation(id)
    setConversations(await loadConversations())
    if (id === conv.id) newChat()
  }

  function onSaveSettings(next: Settings) {
    setSettings(next)
    void saveSettings(next)
  }

  function onSetTheme(mode: ThemeMode) {
    const next = { ...settings, theme: mode }
    setSettings(next)
    void saveSettings(next)
  }

  function onSetLanguage(language: Language) {
    const next = { ...settings, language }
    setSettings(next)
    void saveSettings(next)
  }

  // Pick a model from the composer's inline picker. The list spans every
  // configured provider, so a pick may also switch the active provider.
  function onPickModel(provider: ProviderId, model: string) {
    const cfg = settings.byProvider[provider]
    const next = {
      ...settings,
      provider,
      byProvider: { ...settings.byProvider, [provider]: { ...cfg, model } },
    }
    setSettings(next)
    void saveSettings(next)
  }

  const t = (key: Parameters<typeof translate>[1]) => translate(settings.language, key)

  return (
    <LangContext.Provider value={settings.language}>
    <div className="app">
      <main className="app__main">
        {boot === 'loading' && <div className="boot">Loading engine…</div>}
        {boot === 'error' && (
          <div className="boot boot--error">
            <strong>Engine failed to load</strong>
            <pre>{bootMsg}</pre>
          </div>
        )}
        {boot === 'ready' && view === 'chat' && (
          <ChatView
            settings={settings}
            conversation={conv}
            onChange={onConvChange}
            onNeedSettings={() => setSettingsOpen(true)}
            onPickModel={onPickModel}
          />
        )}
        {boot === 'ready' && view === 'history' && (
          <HistoryView
            conversations={conversations}
            activeId={conv.id}
            onOpen={openConv}
            onDelete={(id) => void onDeleteConv(id)}
          />
        )}
      </main>

      {boot === 'ready' && settingsOpen && (
        <div className="modal">
          <div className="modal__panel" ref={settingsRef}>
            <button
              className="modal__close"
              title={t('common.close')}
              aria-label={t('common.close')}
              onClick={() => setSettingsOpen(false)}
            >
              <CloseIcon size={16} />
            </button>
            <SettingsView
              settings={settings}
              onSave={onSaveSettings}
              onSetTheme={onSetTheme}
              onSetLanguage={onSetLanguage}
              onDone={() => setSettingsOpen(false)}
            />
          </div>
        </div>
      )}

      <nav className="rail">
        <div className="rail__group">
          <button className="rail__btn" title={t('rail.new')} onClick={newChat}>
            <PlusIcon />
          </button>
          <button
            className={`rail__btn${view === 'history' ? ' rail__btn--on' : ''}`}
            title={t('rail.history')}
            onClick={() => setView('history')}
          >
            <HistoryIcon />
          </button>
        </div>
        <div className="rail__group rail__group--end">
          <button
            className={`rail__btn${settingsOpen ? ' rail__btn--on' : ''}`}
            title={t('rail.settings')}
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon />
          </button>
        </div>
      </nav>
    </div>
    </LangContext.Provider>
  )
}
