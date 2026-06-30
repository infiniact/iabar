// Typed persistence over chrome.storage.local: user settings + saved
// conversations.

import type { ChatTurn } from '../harness'
import type { PageContext } from './page-context'

export type ProviderId =
  | 'anthropic'
  | 'openai'
  | 'deepseek'
  | 'openrouter'
  | 'kimi'
  | 'zai'
  | 'qwen'
  | 'minimax'
  | 'doubao'
  | 'gemini'
export type ThemeMode = 'system' | 'light' | 'dark'
export type Language = 'zh' | 'en'

/** How the side panel authenticates to a provider's REST API. Anthropic uses
 *  its own header scheme; everyone else is OpenAI-compatible bearer auth. */
export type AuthStyle = 'bearer' | 'anthropic'

/** A provider the wasm engine can talk to. All but Anthropic are OpenAI
 *  Chat-Completions compatible and share one generic provider in wasm; the
 *  only thing that varies is `base`. */
export interface ProviderMeta {
  id: ProviderId
  label: string
  /** OpenAI-compatible base URL. Chat = `${base}/chat/completions`,
   *  model list = `${base}/models`. (Anthropic uses `${base}/messages` +
   *  `${base}/models` with its own headers, handled specially.) */
  base: string
  auth: AuthStyle
  defaultModel: string
  /** Where to obtain an API key (the "获取" guided link). */
  keyUrl: string
  enabled: boolean
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    base: 'https://api.anthropic.com/v1',
    auth: 'anthropic',
    defaultModel: 'claude-opus-4-8',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    enabled: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    base: 'https://api.deepseek.com',
    auth: 'bearer',
    defaultModel: 'deepseek-chat',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    enabled: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    base: 'https://api.openai.com/v1',
    auth: 'bearer',
    defaultModel: 'gpt-4o',
    keyUrl: 'https://platform.openai.com/api-keys',
    enabled: true,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    auth: 'bearer',
    defaultModel: 'openai/gpt-4o-mini',
    keyUrl: 'https://openrouter.ai/keys',
    enabled: true,
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    base: 'https://api.moonshot.cn/v1',
    auth: 'bearer',
    defaultModel: 'moonshot-v1-8k',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    enabled: true,
  },
  {
    id: 'zai',
    label: 'Z.AI (GLM)',
    base: 'https://api.z.ai/api/paas/v4',
    auth: 'bearer',
    defaultModel: 'glm-4.6',
    keyUrl: 'https://z.ai/manage-apikey/apikey-list',
    enabled: true,
  },
  {
    id: 'qwen',
    label: '通义千问 (Qwen)',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    auth: 'bearer',
    defaultModel: 'qwen-plus',
    keyUrl: 'https://bailian.console.aliyun.com/',
    enabled: true,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    base: 'https://api.minimaxi.com/v1',
    auth: 'bearer',
    defaultModel: 'MiniMax-Text-01',
    keyUrl: 'https://platform.minimaxi.com/user-center/basic-information/interface-key',
    enabled: true,
  },
  {
    id: 'doubao',
    label: '豆包 (火山引擎)',
    base: 'https://ark.cn-beijing.volces.com/api/v3',
    auth: 'bearer',
    defaultModel: 'doubao-pro-32k',
    keyUrl: 'https://console.volcengine.com/ark',
    enabled: true,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    auth: 'bearer',
    defaultModel: 'gemini-2.0-flash',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    enabled: true,
  },
]

/** The OpenAI-compatible base URL for a provider (passed to the wasm chat
 *  call as `baseUrl`). Anthropic ignores it. */
export function baseUrlFor(id: ProviderId): string {
  return PROVIDERS.find((p) => p.id === id)?.base ?? ''
}

/** Per-provider credentials/model — each provider remembers its own, so
 *  switching providers never loses what you already entered. */
export interface ProviderConfig {
  apiKey: string
  model: string
  /** Models fetched ("checked") for this provider — powers the inline picker. */
  models?: string[]
}

export interface Settings {
  provider: ProviderId
  theme: ThemeMode
  language: Language
  byProvider: Record<ProviderId, ProviderConfig>
}

/** A fresh, empty config map seeded with each provider's default model. */
function blankByProvider(): Record<ProviderId, ProviderConfig> {
  return Object.fromEntries(
    PROVIDERS.map((p) => [p.id, { apiKey: '', model: p.defaultModel }]),
  ) as Record<ProviderId, ProviderConfig>
}

export const DEFAULT_SETTINGS: Settings = {
  // DeepSeek by default (OpenAI-compatible, easy to obtain a key); switch to
  // Anthropic in Settings when a Claude key is available.
  provider: 'deepseek',
  theme: 'system',
  language: 'zh',
  byProvider: blankByProvider(),
}

/** The credentials/model for the currently selected provider. */
export function activeConfig(s: Settings): ProviderConfig {
  const meta = PROVIDERS.find((p) => p.id === s.provider)
  return s.byProvider[s.provider] ?? { apiKey: '', model: meta?.defaultModel ?? '' }
}

const SETTINGS_KEY = 'iabar.settings'
const CONV_KEY = 'iabar.conversations'

// Old shape stored provider/apiKey/model flat. Keep reading it.
interface LegacySettings {
  provider?: ProviderId
  apiKey?: string
  model?: string
  theme?: ThemeMode
  language?: Language
  byProvider?: Record<ProviderId, ProviderConfig>
}

export async function loadSettings(): Promise<Settings> {
  const v = await chrome.storage?.local.get(SETTINGS_KEY)
  const stored = v?.[SETTINGS_KEY] as LegacySettings | undefined
  if (!stored) return { ...DEFAULT_SETTINGS, byProvider: blankByProvider() }

  const byProvider = { ...blankByProvider(), ...(stored.byProvider ?? {}) }
  // Migrate a legacy flat key/model into the active provider's slot.
  if (stored.apiKey !== undefined || stored.model !== undefined) {
    const p = stored.provider ?? DEFAULT_SETTINGS.provider
    byProvider[p] = {
      // Keep already-migrated fields (notably the fetched `models` list) — only
      // overlay the legacy flat key/model on top.
      ...byProvider[p],
      apiKey: stored.apiKey ?? byProvider[p].apiKey,
      model: stored.model ?? byProvider[p].model,
    }
  }
  return {
    provider: stored.provider ?? DEFAULT_SETTINGS.provider,
    theme: stored.theme ?? DEFAULT_SETTINGS.theme,
    language: stored.language ?? DEFAULT_SETTINGS.language,
    byProvider,
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage?.local.set({ [SETTINGS_KEY]: s })
}

/** A persisted chat turn. User turns keep the page contexts (@) attached when
 *  sent, so they survive reloads, show as chips on the bubble, and can be
 *  recalled (with their attachments) from input history. */
export interface StoredTurn extends ChatTurn {
  attachments?: PageContext[]
}

export interface Conversation {
  id: string
  title: string
  messages: StoredTurn[]
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
