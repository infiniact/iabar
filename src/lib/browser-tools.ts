// Browser tools exposed to the wasm agent loop via the host seam.
//
// Each entry is a JSON tool definition sent to the engine (which turns it into
// a `HostTool`); `browserToolDispatch` runs the chrome-backed work by name and
// returns a string the model reads. Adding a tool is JS-only — no Rust/wasm
// change: add a definition here + a branch in the dispatcher.

import {
  activeReferenceableTab,
  capturePageContextIfGranted,
  drillDown,
  listReferenceableTabs,
  type RefTab,
} from './page-context'

/** Tool definition sent to the engine (mirrors `HostToolDef` in wasm). */
export interface BrowserToolDef {
  name: string
  description: string
  input_schema: unknown
}

export const BROWSER_TOOLS: BrowserToolDef[] = [
  {
    name: 'read_page',
    description:
      'Read the visible text of a browser tab. With no arguments, reads the page the user is ' +
      'currently looking at; pass `url` to read a specific open tab. Only pages the user has ' +
      'granted access to (by @-referencing them) are readable.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of an open tab to read; omit for the current tab.' },
      },
    },
  },
  {
    name: 'drill_down',
    description:
      'Starting from a page, follow its same-site links down several levels and read each page, ' +
      'returning the aggregated text. Use to explore a site, a docs tree, or a section. Only the ' +
      'start page origin (granted via @) is followed; reads server HTML.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Start page URL; omit for the current tab.' },
        depth: {
          type: 'integer',
          description: 'How many link levels to follow from the start page (1–3). Default 1.',
        },
        max_pages: {
          type: 'integer',
          description: 'Max total pages to read, bounding cost (1–15). Default 8.',
        },
      },
    },
  },
]

function parseArgs(argsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argsJson || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

async function tabForUrl(url: string): Promise<RefTab | null> {
  const tabs = await listReferenceableTabs()
  return tabs.find((t) => t.url === url) ?? tabs.find((t) => t.url.startsWith(url)) ?? null
}

/** Host handler for the wasm browser tools (the Rust→JS seam). Errors are
 *  returned as text (not thrown) so the agent loop keeps going. */
export async function browserToolDispatch(name: string, argsJson: string): Promise<string> {
  const args = parseArgs(argsJson)

  if (name === 'read_page') {
    const url = typeof args.url === 'string' ? args.url : undefined
    const tab = url ? await tabForUrl(url) : await activeReferenceableTab()
    if (!tab) return url ? `read_page: no open tab matches ${url}.` : 'read_page: no readable active tab.'
    const ctx = await capturePageContextIfGranted(tab)
    if (!ctx) {
      return `read_page: "${tab.url}" is not accessible yet. Ask the user to @-reference it once to grant access.`
    }
    return `# ${ctx.title}\n<${ctx.url}>\n\n${ctx.text}`
  }

  if (name === 'drill_down') {
    let url = typeof args.url === 'string' ? args.url : undefined
    if (!url) url = (await activeReferenceableTab())?.url
    if (!url) return 'drill_down: no start URL and no active tab.'
    const depth = clamp(numArg(args.depth, 1), 0, 3)
    const maxPages = clamp(numArg(args.max_pages, 8), 1, 15)
    const pages = await drillDown(url, depth, maxPages)
    if (!pages.length) {
      return `drill_down: "${url}" is not accessible (grant it via @ first) or has no readable content.`
    }
    return pages.map((p) => `# ${p.title}\n<${p.url}>\n\n${p.text}`).join('\n\n---\n\n')
  }

  return `Unknown tool: ${name}`
}

function numArg(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : dflt
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}
