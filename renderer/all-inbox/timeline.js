'use strict'
// «Все мессенджеры» (3.8): the messages read from a page, cleaned and with day separators where the page gives exact
// times (Telegram); MAX brings its own day «capsules» as service rows.

const DAY_NAMES_RU = ['Сегодня', 'Вчера']
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const KINDS = new Set(['text', 'photo', 'video', 'voice', 'sticker', 'file', 'service'])

const RGB = /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/
const PICTURE = /^(data:image\/|https:)/
const MAX_ALBUM = 10
const MAX_REACTIONS = 8

const colour = (v) => (typeof v === 'string' && RGB.test(v) ? v : '')
const picture = (v) => (typeof v === 'string' && PICTURE.test(v) ? v : '')
const share = (v) => Math.min(1, Math.max(0, Number(v) || 0))

function cleanAlbum(album) {
    if (!Array.isArray(album) || album.length < 2) return null
    return album.slice(0, MAX_ALBUM).map((a) => ({
        src: picture(a && a.src), x: share(a && a.x), y: share(a && a.y), w: share(a && a.w), h: share(a && a.h),
        ratio: Number(a && a.ratio) > 0 ? Number(a.ratio) : 1
    }))
}

function cleanReactions(list) {
    if (!Array.isArray(list)) return []
    return list.filter((r) => r && typeof r.e === 'string' && r.e).slice(0, MAX_REACTIONS)
        .map((r) => ({ e: r.e.slice(0, 8), n: String(r.n || '').slice(0, 6), mine: r.mine === true }))
}

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
            media: picture(m.media),
            mediaW: Math.max(0, Math.round(Number(m.mediaW) || 0)),
            mediaH: Math.max(0, Math.round(Number(m.mediaH) || 0)),
            album: cleanAlbum(m.album),
            // how Telegram draws the person: the colour of their name and the avatar of their group of messages
            authorColor: colour(m.authorColor),
            avatar: picture(m.avatar),
            avatarText: String(m.avatarText || '').slice(0, 2),
            group: String(m.group || '').slice(0, 40),
            replyTitle: String(m.replyTitle || '').slice(0, 80),
            replyColor: colour(m.replyColor),
            reactions: cleanReactions(m.reactions),
            size: String(m.size || '').slice(0, 20),
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
        // the messenger's own grouping wins when it gives one
        if (r.group) { who[i] = `group:${r.group}`; return }
        who[i] = !r.out && !r.author && prev && prev.type === 'msg' && !prev.out ? who[i - 1] : `${r.out ? 'out' : 'in'}:${r.author}`
    })
    const same = (i, j) => who[i] != null && who[j] != null && who[i] === who[j]
    return rows.map((r, i) => (r.type !== 'msg' ? r : { ...r, groupStart: !same(i - 1, i), groupEnd: !same(i, i + 1) }))
}

/** A short string that changes whenever what is shown changes. */
function signature(rows) {
    return rows.map((r) => {
        if (r.type === 'day') return `#${r.label}`
        const album = r.album ? r.album.filter((a) => a.src).length : 0
        const reacts = (r.reactions || []).map((x) => x.e + x.n + (x.mine ? '*' : '')).join(',')
        return `${r.id}|${r.read ? 1 : 0}|${r.text.length}|${r.media ? 1 : 0}|${r.avatar ? 1 : 0}|${album}|${reacts}`
    }).join(';')
}

module.exports = { buildTimeline, signature, dayLabel }
