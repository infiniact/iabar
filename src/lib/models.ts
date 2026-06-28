// Fetch a provider's model list with the user's key. Every provider exposes an
// OpenAI-compatible `GET <base>/models` returning `{data:[{id}]}` — Anthropic's
// `/v1/models` matches that shape too, it just needs different auth headers. The
// side panel can call these directly: the narrow host_permissions bypass CORS,
// and a 401/403 doubles as key validation.

import { PROVIDERS, type ProviderId } from './store'
import { recordServerDate } from './license/trusted-time'

interface ModelEntry {
  id?: string
}

/**
 * A readable label for a raw model id (the id itself stays the value we send to
 * the API). Drops noisy API prefixes — e.g. Gemini lists models as
 * `models/gemini-flash-latest`, and OpenRouter as `vendor/model` — so the UI
 * shows `gemini-flash-latest` / `model` instead of the leaked path.
 */
export function modelLabel(id: string): string {
  const cleaned = id.replace(/^models\//, '')
  const slash = cleaned.lastIndexOf('/')
  return slash === -1 ? cleaned : cleaned.slice(slash + 1)
}

export async function fetchModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  const key = apiKey.trim()
  if (!key) throw new Error('Enter an API key first.')

  const meta = PROVIDERS.find((p) => p.id === provider)
  if (!meta || !meta.base) throw new Error('Model listing is not supported for this provider yet.')

  const url = `${meta.base.replace(/\/+$/, '')}/models`
  const headers: Record<string, string> =
    meta.auth === 'anthropic'
      ? {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
      : { Authorization: `Bearer ${key}` }

  let resp: Response
  try {
    resp = await fetch(url, { headers })
  } catch (e) {
    throw new Error(`Network error: ${String(e)}`)
  }
  recordServerDate(resp.headers.get('date'))
  if (resp.status === 401 || resp.status === 403) throw new Error('Invalid API key.')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const data = (await resp.json()) as { data?: ModelEntry[] }
  const ids = (data.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x))
  if (!ids.length) throw new Error('No models returned.')
  return ids
}
