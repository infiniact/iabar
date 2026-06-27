// Typed persistence over chrome.storage.local: user settings + saved
// conversations.

import type { ChatTurn } from '../harness'

export type ProviderId = 'anthropic' | 'openai' | 'deepseek'
export type ThemeMode = 'system' | 'light' | 'dark'

/** Providers the wasm engine can talk to today. Only Anthropic is wired; the
 *  others are listed so the UI shows the roadmap but are disabled. */
export interface ProviderMeta {
  id: ProviderId
  label: string
  defaultModel: string
  /** Where to obtain an API key (the "获取" guided link). */
  keyUrl: string
  enabled: boolean
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-opus-4-8',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    enabled: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    enabled: true,
  },
  { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o', keyUrl: 'https://platform.openai.com/api-keys', enabled: false },
]

export interface Settings {
  provider: ProviderId
  model: string
  apiKey: string
  theme: ThemeMode
}

export const DEFAULT_SETTINGS: Settings = {
  // DeepSeek by default (OpenAI-compatible, easy to obtain a key); switch to
  // Anthropic in Settings when a Claude key is available.
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: '',
  theme: 'system',
}

const SETTINGS_KEY = 'iabar.settings'
const CONV_KEY = 'iabar.conversations'

export async function loadSettings(): Promise<Settings> {
  const v = await chrome.storage?.local.get(SETTINGS_KEY)
  return { ...DEFAULT_SETTINGS, ...(v?.[SETTINGS_KEY] as Partial<Settings> | undefined) }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage?.local.set({ [SETTINGS_KEY]: s })
}

export interface Conversation {
  id: string
  title: string
  messages: ChatTurn[]
  updatedAt: number
}

export function newConversation(): Conversation {
  return { id: crypto.randomUUID(), title: '', messages: [], updatedAt: Date.now() }
}

export async function loadConversations(): Promise<Conversation[]> {
  const v = await chrome.storage?.local.get(CONV_KEY)
  const list = (v?.[CONV_KEY] as Conversation[] | undefined) ?? []
  return list.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveConversation(c: Conversation): Promise<void> {
  const list = await loadConversations()
  const next = [c, ...list.filter((x) => x.id !== c.id)]
  await chrome.storage?.local.set({ [CONV_KEY]: next })
}

export async function deleteConversation(id: string): Promise<void> {
  const list = await loadConversations()
  await chrome.storage?.local.set({ [CONV_KEY]: list.filter((x) => x.id !== id) })
}
