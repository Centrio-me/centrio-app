'use strict'
// A messenger tab whose page process died — the computer slept, the graphics driver reset, Windows ran short of memory —
// used to stay black for good: no page means no right-click menu either, and the reload button only reloads the tab in
// focus (live report, 2026-11-11: left on overnight, «утром чёрный экран», the right half of a split could not be
// brought back). Such a tab is now reloaded by itself, a little later each time, and not in a loop.

const MAX_RECOVERIES = 3
const WINDOW_MS = 10 * 60 * 1000
const BASE_DELAY_MS = 1000

/**
 * @param {number[]} recent times of this tab's earlier recoveries
 * @param {string} reason Electron's render-process-gone reason
 * @param {number} now
 * @returns {number|null} in how many ms to reload, or null to leave it to the person
 */
function recoveryDelay(recent, reason, now) {
    if (reason === 'clean-exit') return null
    const inWindow = (recent || []).filter((t) => now - t < WINDOW_MS)
    if (inWindow.length >= MAX_RECOVERIES) return null
    return BASE_DELAY_MS * Math.pow(4, inWindow.length)
}

/**
 * Watches one <webview>: when its page process is gone, it is reloaded with the messenger's address.
 * @param {HTMLElement} webview
 * @param {() => void} reload
 * @param {(info: object) => void} [report]
 */
function watchTab(webview, reload, report = () => {}) {
    const recent = []
    webview.addEventListener('render-process-gone', (e) => {
        const reason = (e && e.details && e.details.reason) || (e && e.reason) || 'crashed'
        const now = Date.now()
        const delay = recoveryDelay(recent, reason, now)
        report({ reason, recovering: delay != null })
        if (delay == null) return
        recent.push(now)
        clearTimeout(webview._recoverTimer)
        webview._recoverTimer = setTimeout(() => { try { reload() } catch {} }, delay)
    })
}

/** Whether a tab's page process is gone (a crashed <webview> answers nothing). */
function isTabGone(webview) {
    try { return typeof webview.isCrashed === 'function' && webview.isCrashed() } catch { return false }
}

module.exports = { recoveryDelay, watchTab, isTabGone, MAX_RECOVERIES }
