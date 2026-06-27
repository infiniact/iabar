// On-demand page-context capture (ADR 0009).
//
// IABar holds no `<all_urls>` content script and no broad host permission.
// When the user `@`-references a tab, we ask for that origin at runtime (a
// per-origin prompt inside the user gesture) and then inject a one-shot
// extractor with `chrome.scripting.executeScript`. Nothing runs on a page
// until the user references it and grants access.

/** A snapshot of a page the user referenced. */
export interface PageContext {
  url: string
  title: string
  selection: string
  /** Truncated visible text of the document body. */
  text: string
}

/** A tab the `@`-picker can offer. */
export interface RefTab {
  id: number
  title: string
  url: string
  favIconUrl?: string
}

/**
 * Runs **in the target page** (injected via `executeScript`). Must be fully
 * self-contained — it cannot close over anything from this module.
 */
function extractPageContext(): PageContext {
  const selection = window.getSelection()?.toString() ?? ''
  const bodyText = document.body?.innerText ?? ''
  return {
    url: location.href,
    title: document.title,
    selection,
    text: bodyText.slice(0, 20_000),
  }
}

/** Origins we can never inject into (and shouldn't prompt for). */
function isRestricted(url: string): boolean {
  return (
    /^(chrome|edge|about|chrome-extension|devtools|view-source):/.test(url) ||
    url.startsWith('https://chromewebstore.google.com') ||
    url.startsWith('https://chrome.google.com/webstore')
  )
}

/** Tabs the user can `@`-reference (needs the `tabs` permission for title/url). */
export async function listReferenceableTabs(): Promise<RefTab[]> {
  const tabs = await chrome.tabs.query({})
  return tabs
    .filter((t): t is chrome.tabs.Tab & { id: number; url: string } =>
      Boolean(t.id && t.url && !isRestricted(t.url)),
    )
    .map((t) => ({
      id: t.id,
      title: t.title || t.url,
      url: t.url,
      favIconUrl: t.favIconUrl,
    }))
}

/** The active tab, as a `@`-reference candidate (the fast path). */
export async function activeReferenceableTab(): Promise<RefTab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url || isRestricted(tab.url)) return null
  return { id: tab.id, title: tab.title || tab.url, url: tab.url, favIconUrl: tab.favIconUrl }
}

export class PageContextError extends Error {}

/**
 * Capture a tab's context. Requests the tab's origin at runtime (per ADR 0009),
 * then injects the extractor. **Must be called from a user gesture** so the
 * permission prompt is allowed. Throws `PageContextError` on deny / restricted.
 */
export async function capturePageContext(tab: RefTab): Promise<PageContext> {
  if (isRestricted(tab.url)) {
    throw new PageContextError('This page type cannot be read (browser-restricted).')
  }
  const origin = `${new URL(tab.url).origin}/*`
  const granted = await chrome.permissions.request({ origins: [origin] })
  if (!granted) {
    throw new PageContextError('Access to this site was not granted.')
  }
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageContext,
    })
    if (!result?.result) throw new PageContextError('Could not read the page.')
    return result.result
  } catch (e) {
    throw new PageContextError(
      e instanceof PageContextError ? e.message : `Injection failed: ${String(e)}`,
    )
  }
}
