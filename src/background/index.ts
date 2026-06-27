// Service worker: opens the side panel on toolbar-icon click and relays
// page-context requests from the panel to the active tab's content script.
//
// The wasm harness runs in the side panel page (where WebAssembly is
// permitted), not here — MV3 service workers can't reliably host a long-lived
// wasm agent loop. This worker stays a thin message router.

chrome.runtime.onInstalled.addListener(() => {
  // Clicking the toolbar icon toggles the side panel open for the tab.
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[iabar] setPanelBehavior failed', err))
})

// Relay: side panel asks for the current page's context; we forward to the
// content script of the active tab and pipe the reply back.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'iabar:get-page-context') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0]
      if (!tab?.id) {
        sendResponse({ ok: false, error: 'no active tab' })
        return
      }
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'iabar:collect-page-context' },
        (reply) => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message })
          } else {
            sendResponse({ ok: true, context: reply })
          }
        },
      )
    })
    return true // async sendResponse
  }
  return undefined
})
