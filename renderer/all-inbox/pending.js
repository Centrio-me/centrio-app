'use strict'
// «Все мессенджеры»: what was just sent shows in the conversation at once, with a clock, like in Telegram — until the
// messenger draws the real message. A send that failed, or never showed up, stays marked as not sent.

const GIVE_UP_MS = 45 * 1000

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()

function createPending() {
    let items = []
    let seq = 0
    return {
        /** @returns {string} id of the message being sent */
        add({ text, files = [], knownIds = [], now = Date.now() }) {
            const id = `pending-${++seq}`
            items = [...items, { id, text: norm(text), files: files.map((f) => String(f && f.name || '')), known: new Set(knownIds.map(String)), at: now, failed: false }]
            return id
        },
        fail(id) { items = items.map((p) => (p.id === id ? { ...p, failed: true } : p)) },
        drop(id) { items = items.filter((p) => p.id !== id) },
        clear() { items = [] },
        size: () => items.length,
        list: () => items,
        settle(ids) { items = items.filter((p) => !ids.has(p.id)) }
    }
}

function fileLabel(names) {
    if (!names.length) return ''
    return names.length === 1 ? names[0] : `${names[0]} и ещё ${names.length - 1}`
}

/**
 * The conversation with the messages being sent at its end; those the messenger now shows itself are settled.
 * @param {object[]} rows rows of timeline.js
 * @param {ReturnType<typeof createPending>} pending
 * @param {number} now
 */
function withPending(rows, pending, now) {
    const settled = new Set()
    const fresh = rows.filter((r) => r.type === 'msg' && r.out)
    const used = new Set()
    for (const p of pending.list()) {
        const match = fresh.find((r) => !p.known.has(String(r.id)) && !used.has(r.id) &&
            (p.files.length ? true : norm(r.text) === p.text))
        if (match) { used.add(match.id); settled.add(p.id) }
    }
    pending.settle(settled)
    const tail = pending.list().map((p) => ({
        type: 'msg',
        id: p.id,
        out: true,
        kind: p.files.length ? 'file' : 'text',
        name: fileLabel(p.files),
        text: p.text,
        at: p.at,
        time: new Date(p.at).toTimeString().slice(0, 5),
        pending: p.failed || now - p.at > GIVE_UP_MS ? 'failed' : 'sending'
    }))
    if (!tail.length) return rows
    // the messages being sent join the group of your own last messages: the tail moves to the newest one
    const last = rows[rows.length - 1]
    const joins = last && last.type === 'msg' && last.out
    const head = joins ? [...rows.slice(0, -1), { ...last, groupEnd: false }] : rows
    return [...head, ...tail.map((r, i) => ({ ...r, groupStart: i === 0 && !joins, groupEnd: i === tail.length - 1 }))]
}

module.exports = { createPending, withPending }
