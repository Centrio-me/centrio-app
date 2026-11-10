'use strict'
// «Все мессенджеры» (3.8): the messages read from a page, cleaned and with day separators where the page gives exact
// times (Telegram); MAX brings its own day «capsules» as service rows.

const DAY_NAMES_RU = ['Сегодня', 'Вчера']
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const KINDS = new Set(['text', 'photo', 'video', 'voice', 'sticker', 'file', 'service'])

function dayLabel(at, now) {
    const d = new Date(at)
    const today = new Date(now)
    const start = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const diff = Math.round((start(today) - start(d)) / 86400000)
    if (diff === 0) return DAY_NAMES_RU[0]
    if (diff === 1) return DAY_NAMES_RU[1]
    return `${d.getDate()} ${MONTHS_RU[d.getMonth()]}${d.getFullYear() !== today.getFullYear() ? ` ${d.getFullYear()}` : ''}`
}

/**
 * @param {object[]} raw messages from chat-adapters.js CHAT
 * @param {number} now ms
 * @returns {object[]} rows: { type: 'day', label } | { type: 'msg', ...message }
 */
function buildTimeline(raw, now) {
    const rows = []
    let lastDay = ''
    for (const m of raw || []) {
        if (!m || !m.id) continue
        const kind = KINDS.has(m.kind) ? m.kind : 'text'
        if (kind === 'service') {
            const text = String(m.text || '').trim()
            if (text) rows.push({ type: 'day', label: text, id: m.id })
            if (text) lastDay = text
            continue
        }
        if (m.at) {
            const label = dayLabel(m.at, now)
            if (label !== lastDay) { rows.push({ type: 'day', label, id: `d${label}` }); lastDay = label }
        }
        const text = String(m.text || '').trim()
        if (!text && kind === 'text') continue
        rows.push({
            type: 'msg',
            id: String(m.id),
            out: m.out === true,
            read: m.read === true,
            kind,
            author: String(m.author || ''),
            forwarded: String(m.forwarded || ''),
            reply: String(m.reply || ''),
            text,
            name: String(m.name || ''),
            duration: String(m.duration || ''),
            media: typeof m.media === 'string' && /^(data:image\/|https:)/.test(m.media) ? m.media : '',
            // the page's own key for this picture: a click asks the page for it in full size
            picture: typeof m.picture === 'string' ? m.picture.slice(0, 80) : '',
            time: String(m.time || '')
        })
    }
    return markGroups(rows)
}

// Messages in a row from the same person (same side, same author, no day between) make one group, like in messengers:
// the name only on the first one, the bubbles closer together.
// Telegram itself leaves the name off the second and later messages of a group: an incoming message without a name
// continues the group above it.
function markGroups(rows) {
    const who = []
    rows.forEach((r, i) => {
        if (r.type !== 'msg') { who[i] = null; return }
        const prev = rows[i - 1]
        who[i] = !r.out && !r.author && prev && prev.type === 'msg' && !prev.out ? who[i - 1] : `${r.out ? 'out' : 'in'}:${r.author}`
    })
    const same = (i, j) => who[i] != null && who[j] != null && who[i] === who[j]
    return rows.map((r, i) => (r.type !== 'msg' ? r : { ...r, groupStart: !same(i - 1, i), groupEnd: !same(i, i + 1) }))
}

/** A short string that changes whenever what is shown changes. */
function signature(rows) {
    return rows.map((r) => r.type === 'day' ? `#${r.label}` : `${r.id}|${r.read ? 1 : 0}|${r.text.length}|${r.media ? 1 : 0}`).join(';')
}

module.exports = { buildTimeline, signature, dayLabel }
