// Content script: extracts a lightweight snapshot of the current page so the
// harness in the side panel has real context to reason about (title, URL,
// selected text, and the main visible text). Kept deliberately small; richer
// DOM tooling arrives with the browser tool backends (see ROADMAP.md).

export interface PageContext {
  url: string
  title: string
  selection: string
  /** Truncated visible text of the document body. */
  text: string
}

function collectPageContext(): PageContext {
  const selection = window.getSelection()?.toString() ?? ''
  const bodyText = document.body?.innerText ?? ''
  return {
    url: location.href,
    title: document.title,
    selection,
    // Cap to keep messages small; the harness can request more later.
    text: bodyText.slice(0, 20_000),
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'iabar:collect-page-context') {
    sendResponse(collectPageContext())
  }
  return undefined
})
