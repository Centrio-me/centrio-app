'use strict'
// The "removed the app" mark (Windows, since 3.7.4). The uninstaller sends the install's anonymous visitorId
// (a random uuid only that computer and this server know); the desktop links that id to the account while the
// person is signed in (POST /api/visitors/link). Statistics only: who removed Centrio, after how many days.

const VISITOR_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VERSION_RE = /^\d{1,3}\.\d{1,3}\.\d{1,4}$/
const DAY_MS = 24 * 60 * 60 * 1000

/** @param {unknown} v */
function isVisitorId(v) {
    return typeof v === 'string' && VISITOR_ID_RE.test(v)
}

/** @param {unknown} v @returns {string|null} */
function cleanVersion(v) {
    return typeof v === 'string' && VERSION_RE.test(v) ? v : null
}

/** @returns {number|null} whole days from a to b, never negative */
function daysBetween(a, b) {
    if (!a || !b) return null
    return Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY_MS))
}

/**
 * What the admin profile shows about removals, from the account's linked installs.
 * @param {{ uninstalledAt?: Date|null, uninstallVersion?: string|null, lastSeenAt?: Date|null, firstSeenAt?: Date|null }[]} visitors
 * @returns {{ at: Date, version: string|null, cameBack: boolean, computers: number, daysUsed: number|null }|null}
 */
function uninstallSummary(visitors) {
    const removed = (visitors || []).filter((v) => v && v.uninstalledAt)
    if (removed.length === 0) return null
    const latest = removed.reduce((a, b) => (new Date(b.uninstalledAt) > new Date(a.uninstalledAt) ? b : a))
    // Came back: any linked install was seen after the latest removal (reinstalled or another computer)
    const at = new Date(latest.uninstalledAt)
    const cameBack = visitors.some((v) => v && v.lastSeenAt && new Date(v.lastSeenAt) > at)
    return {
        at,
        version: latest.uninstallVersion || null,
        cameBack,
        computers: visitors.length,
        daysUsed: daysBetween(latest.firstSeenAt, latest.uninstalledAt)
    }
}

module.exports = { isVisitorId, cleanVersion, daysBetween, uninstallSummary }
