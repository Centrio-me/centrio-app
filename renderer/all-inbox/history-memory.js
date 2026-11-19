'use strict'
// «Все мессенджеры»: the history of the open chat is read from the messenger's page, and the page keeps only a window of it
// (Telegram drops the newest messages when earlier ones load above and the oldest when it is scrolled down). Shown as read,
// the conversation lost its newest messages, jumped and never reached further back (Oleg, 2026-11-18: «грузится не до
// конца, останавливается на вчерашнем дне, прыгает»). So what was read is remembered and each read is laid over it.

// at most this many messages are kept for one open chat
const MOST_KEPT = 1500

const hasId = (m) => !!m && typeof m.id === 'string' && m.id !== ''

/**
 * The messages of the chat now: the page's window wins for everything it holds; what was read before and lies above or
 * below the window stays.
 * @param {{ id: string }[]} prev what was shown after the last read (oldest first)
 * @param {{ id: string }[]} next what the page holds now (oldest first)
 * @returns {{ id: string }[]}
 */
function mergeHistory(prev, next) {
    if (!Array.isArray(next) || !next.length) return Array.isArray(prev) ? prev : []
    if (!Array.isArray(prev) || !prev.length) return next
    // a message with no id of its own (a read the page could not name) cannot be told from another: no memory for it
    if (!prev.every(hasId) || !next.every(hasId)) return next
    const place = new Map()
    next.forEach((m, i) => place.set(m.id, i))
    let first = -1
    let last = -1
    prev.forEach((m, i) => { if (place.has(m.id)) { if (first < 0) first = i; last = i } })
    // nothing in common: the page is somewhere else in the chat, the old reading would only be glued on wrongly
    if (first < 0) return next
    // the page reaches further back than what was read: its older messages are the truth, the old head would be a duplicate
    const head = place.get(prev[first].id) > 0 ? [] : prev.slice(0, first)
    // the page ends where the old reading did or earlier: what the page dropped at the bottom stays; if the page holds
    // newer messages, whatever the old reading had after the common part is gone
    const tail = place.get(prev[last].id) === next.length - 1 ? prev.slice(last + 1) : []
    const merged = head.concat(next, tail)
    return merged.length > MOST_KEPT ? merged.slice(merged.length - MOST_KEPT) : merged
}

module.exports = { mergeHistory, MOST_KEPT }
