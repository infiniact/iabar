// Service worker — kept minimal. It only wires the toolbar icon to open the
// side panel. Page-context capture lives in the side panel itself (it requests
// per-origin access and injects on demand, per ADR 0009), so there is no
// message relay here anymore.

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error('[iabar] setPanelBehavior failed', err))
})
