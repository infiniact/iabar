import { useEffect, useState } from 'react'
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
  type Settings,
  type ThemeMode,
} from '../lib/store'
import { useTheme } from './theme'
import { ChatView } from './views/Chat'
import { HistoryView } from './views/History'
import { SettingsView } from './views/Settings'
import { HistoryIcon, PlusIcon, SettingsIcon } from './icons'

type View = 'chat' | 'history' | 'settings'
type Boot = 'loading' | 'ready' | 'error'

export function App() {
  const [boot, setBoot] = useState<Boot>('loading')
  const [bootMsg, setBootMsg] = useState('')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [conv, setConv] = useState<Conversation>(() => newConversation())
  const [view, setView] = useState<View>('chat')

  useTheme(settings.theme)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [, s, list] = await Promise.all([initHarness(), loadSettings(), loadConversations()])
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

  return (
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
            onNeedSettings={() => setView('settings')}
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
        {boot === 'ready' && view === 'settings' && (
          <SettingsView settings={settings} onSave={onSaveSettings} onSetTheme={onSetTheme} />
        )}
      </main>

      <nav className="rail">
        <div className="rail__group">
          <button className="rail__btn" title="New chat" onClick={newChat}>
            <PlusIcon />
          </button>
          <button
            className={`rail__btn${view === 'history' ? ' rail__btn--on' : ''}`}
            title="History"
            onClick={() => setView('history')}
          >
            <HistoryIcon />
          </button>
        </div>
        <div className="rail__group">
          <button
            className={`rail__btn${view === 'settings' ? ' rail__btn--on' : ''}`}
            title="Settings"
            onClick={() => setView('settings')}
          >
            <SettingsIcon />
          </button>
        </div>
      </nav>
    </div>
  )
}
