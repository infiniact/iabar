// Fetch a provider's model list with the user's key (OpenAI-compatible /models
// for DeepSeek, /v1/models for Anthropic). The side panel can call these
// directly — the narrow host_permissions bypass CORS. A 401/403 also doubles
// as key validation.

import type { ProviderId } from './store'

interface ModelEntry {
  id?: string
}

export async function fetchModels(provider: ProviderId, apiKey: string): Promise<string[]> {
  const key = apiKey.trim()
  if (!key) throw new Error('Enter an API key first.')

  let url: string
  let headers: Record<string, string>
  if (provider === 'deepseek') {
    url = 'https://api.deepseek.com/models'
    headers = { Authorization: `Bearer ${key}` }
  } else if (provider === 'anthropic') {
    url = 'https://api.anthropic.com/v1/models'
    headers = {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  } else {
    throw new Error('Model listing is not supported for this provider yet.')
  }

  let resp: Response
  try {
    resp = await fetch(url, { headers })
  } catch (e) {
    throw new Error(`Network error: ${String(e)}`)
  }
  if (resp.status === 401 || resp.status === 403) throw new Error('Invalid API key.')
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)

  const data = (await resp.json()) as { data?: ModelEntry[] }
  const ids = (data.data ?? []).map((m) => m.id).filter((x): x is string => Boolean(x))
  if (!ids.length) throw new Error('No models returned.')
  return ids
}
