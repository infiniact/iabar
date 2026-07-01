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
import { RailAccount } from './RailAccount'
import { AccountModal } from './views/AccountModal'
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
  // Settings + Account are overlay popups (close on outside click / Esc).
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'provider' | 'language' | 'theme'>('provider')
  const [accountOpen, setAccountOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  function openSettings(tab: 'provider' | 'language' | 'theme' = 'provider') {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  useTheme(settings.theme)

  useClickOutside(settingsRef, () => setSettingsOpen(false), settingsOpen)
  useClickOutside(accountRef, () => setAccountOpen(false), accountOpen)
  useEffect(() => {
    if (!settingsOpen && !accountOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSettingsOpen(false)
        setAccountOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [settingsOpen, accountOpen])

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
              initialTab={settingsTab}
            />
          </div>
        </div>
      )}

      {boot === 'ready' && accountOpen && (
        <div className="modal">
          <div className="modal__panel" ref={accountRef}>
            <button
              className="modal__close"
              title={t('common.close')}
              aria-label={t('common.close')}
              onClick={() => setAccountOpen(false)}
            >
              <CloseIcon size={16} />
            </button>
            <AccountModal />
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
            onClick={() => setView(view === 'history' ? 'chat' : 'history')}
          >
            <HistoryIcon />
          </button>
        </div>
        <div className="rail__group rail__group--end">
          <button
            className={`rail__btn${settingsOpen ? ' rail__btn--on' : ''}`}
            title={t('rail.settings')}
            onClick={() => openSettings('provider')}
          >
            <SettingsIcon />
          </button>
          {boot === 'ready' && <RailAccount onOpen={() => setAccountOpen(true)} />}
        </div>
      </nav>
    </div>
    </LangContext.Provider>
  )
}
