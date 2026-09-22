// main/services/orgAssignedPartitions.js
//
// BUGFIX (2026-09-21, live report — "Сайты у сотрудников то открываются, то
// белое окно показывает всегда"): main/bootstrap/registerAppEvents.js's
// `will-attach-webview` handler only ever allows a <webview> to attach if
// its `persist:<id>` partition matches an id in store.get('messengers') —
// the user's OWN, locally-persisted messenger list. Org-assigned messengers
// (renderer.js's addOrgAssignedMessenger, ids like `org:<assignmentId>`)
// are deliberately NEVER written there — they're re-injected fresh from the
// server on every sync tick instead (see renderer/org-team.js), precisely
// so a stale local copy never drifts from what the owner currently has
// configured. That correct design choice had an unintended side effect:
// every org-assigned webview's very first attach attempt failed the
// `isKnownPartition` check and was silently blocked — a permanently blank
// (white) webview, since Electron only calls will-attach-webview once per
// guest and never retries on its own.
//
// This is a second, narrower allowlist for exactly this case: the renderer
// registers an org-assigned messenger's id here (via IPC, awaited BEFORE
// creating its <webview> — same ordering fix already used for personal
// messengers' saveData()-before-addWebview() race, see renderer.js) instead
// of writing it into the real messengers store. Intentionally in-memory
// only (a plain Set, not persisted to disk) — it exists only to bridge the
// gap between "renderer decided to show this org-assigned tab" and
// "main process's security check needs to already know about it", and is
// naturally rebuilt every session as the sync tick re-adds each assignment.

const registeredIds = new Set()

function register(id) {
    if (typeof id === 'string' && id) registeredIds.add(id)
}

function isRegisteredPartition(partition) {
    if (typeof partition !== 'string') return false
    for (const id of registeredIds) {
        if (`persist:${id}` === partition) return true
    }
    return false
}

module.exports = { register, isRegisteredPartition }
