'use strict'
// «Все мессенджеры» (3.8): the messages read from a page, cleaned and with day separators where the page gives exact
// times (Telegram); MAX brings its own day «capsules» as service rows.

const DAY_NAMES_RU = ['Сегодня', 'Вчера']
const MONTHS_RU = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const KINDS = new Set(['text', 'photo', 'video', 'voice', 'sticker', 'file', 'contact', 'service'])

const { decodeWave } = require('./media-player')

const RGB = /^rgb\(\d{1,3}, \d{1,3}, \d{1,3}\)$/
const PICTURE = /^(data:image\/|https:)/
const MAX_ALBUM = 10
const MAX_REACTIONS = 8

const colour = (v) => (typeof v === 'string' && RGB.test(v) ? v : '')
const picture = (v) => (typeof v === 'string' && PICTURE.test(v) ? v : '')
const MAX_WAVE = 128
// a voice message's loudness, 0..31 per point: values (VK) or Telegram's packed bytes
function cleanWave(m, kind) {
    if (kind !== 'voice') return []
    const values = Array.isArray(m.wave) ? m.wave : decodeWave(Array.isArray(m.waveBytes) ? m.waveBytes.slice(0, 200) : null)
    return values.filter((v) => typeof v === 'number' && Number.isFinite(v)).slice(0, MAX_WAVE).map((v) => Math.max(0, Math.min(31, Math.round(v))))
}
const share = (v) => Math.min(1, Math.max(0, Number(v) || 0))

function cleanAlbum(album) {
    if (!Array.isArray(album) || album.length < 2) return null
    return album.slice(0, MAX_ALBUM).map((a) => ({
        src: picture(a && a.src), x: share(a && a.x), y: share(a && a.y), w: share(a && a.w), h: share(a && a.h),
        // the page's own key of the picture: a click asks for it in full size
        picture: a && typeof a.picture === 'string' ? a.picture.slice(0, 240) : '',
        ratio: Number(a && a.ratio) > 0 ? Number(a.ratio) : 1
    }))
}

// a link preview: the site, the title, a little text, a picture from a safe source, the address only if it is a web one
function cleanWebpage(w) {
    if (!w || typeof w !== 'object' || !(w.title || w.text || w.site)) return null
    const cut = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n)
    const url = typeof w.url === 'string' && /^https?:\/\//i.test(w.url) ? w.url.slice(0, 500) : ''
    return { site: cut(w.site, 60), title: cut(w.title, 140), text: cut(w.text, 280), image: picture(w.image), url }
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
            if (!text) continue
            // an event in the chat (someone joined, a gift, a pinned message) is a small note; a date divides the days
            if (m.note === true) { rows.push({ type: 'note', text: text.slice(0, 300), id: String(m.id) }); continue }
            rows.push({ type: 'day', label: text, id: m.id })
            lastDay = text
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
            at: Number(m.at) || 0,
            out: m.out === true,
            read: m.read === true,
            kind,
            author: String(m.author || ''),
            forwarded: String(m.forwarded || ''),
            reply: String(m.reply || ''),
            text,
            name: String(m.name || '').slice(0, 120),
            // a shared contact: its number, or the messenger's note under the name («Новый контакт»)
            phone: String(m.phone || '').slice(0, 40),
            duration: String(m.duration || '').trim().slice(0, 12),
            wave: cleanWave(m, kind),
            // Telegram's round video message
            round: kind === 'video' && m.round === true,
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
            // Telegram writes «0 Б / 25 КБ» while a file is not downloaded: only the file's own size is shown
            size: String(m.size || '').split('/').pop().trim().slice(0, 20),
            webpage: cleanWebpage(m.webpage),
            // the page's own key for this picture: a click asks the page for it in full size
            picture: typeof m.picture === 'string' ? m.picture.slice(0, 240) : '',
            time: String(m.time || '')
        })
    }
    return markGroups(mergePhotoRuns(rows))
}

const ALBUM_GAP_MS = 3 * 60 * 1000

// photos sent one after another by one person, without captions, become one album — the way messengers show them
function canJoin(a, b) {
    const lone = (r) => r && r.type === 'msg' && r.kind === 'photo' && r.media && !r.album && !r.text && !r.reply && !r.forwarded
    if (!lone(a) || !lone(b) || a.out !== b.out || a.author !== b.author || a.group !== b.group) return false
    if (a.at && b.at) return Math.abs(b.at - a.at) <= ALBUM_GAP_MS
    // only «18:41» from the page (MAX): the minutes of the day, within the same gap
    const ma = clockMinutes(a.time)
    const mb = clockMinutes(b.time)
    if (ma >= 0 && mb >= 0) return Math.abs(mb - ma) * 60000 <= ALBUM_GAP_MS
    return a.time === b.time
}

function clockMinutes(time) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim())
    return m ? Number(m[1]) * 60 + Number(m[2]) : -1
}

function mergePhotoRuns(rows) {
    const out = []
    for (let i = 0; i < rows.length; i++) {
        let j = i
        while (j + 1 < rows.length && j - i + 1 < MAX_ALBUM && canJoin(rows[j], rows[j + 1])) j++
        if (j === i) { out.push(rows[i]); continue }
        const run = rows.slice(i, j + 1)
        const last = run[run.length - 1]
        out.push({ ...last, id: `${run[0].id}+${run.length}`, media: '', picture: '', album: layoutAlbum(run) })
        i = j
    }
    return out
}

// the grid of an album: 2 side by side, 3 as one big and two under it, 4 as a square, more in rows of 2 and 3
function layoutAlbum(run) {
    const n = run.length
    const cell = (r, x, y, w, h) => ({ src: r.media, picture: r.picture || '', x, y, w, h, ratio: 1 })
    let items
    let ratio
    if (n === 2) { items = run.map((r, k) => cell(r, k / 2, 0, 0.5, 1)); ratio = 1.6 }
    else if (n === 3) { items = [cell(run[0], 0, 0, 1, 0.62), cell(run[1], 0, 0.62, 0.5, 0.38), cell(run[2], 0.5, 0.62, 0.5, 0.38)]; ratio = 1.1 }
    else if (n === 4) { items = run.map((r, k) => cell(r, (k % 2) / 2, Math.floor(k / 2) / 2, 0.5, 0.5)); ratio = 1 }
    else {
        const sizes = []
        for (let left = n; left > 0;) { const take = left === 4 ? 2 : Math.min(3, left); sizes.push(take); left -= take }
        items = []
        let k = 0
        sizes.forEach((count, row) => {
            for (let c = 0; c < count; c++, k++) items.push(cell(run[k], c / count, row / sizes.length, 1 / count, 1 / sizes.length))
        })
        ratio = 3 / (sizes.length * 1.15)
    }
    return items.map((a) => ({ ...a, ratio }))
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

// a short fingerprint of a picture's data: address: its length and evenly spread characters — a placeholder that
// became the photo changes it; hashing every byte of every picture each poll would not pay (texts are compared whole)
const PRINT_POINTS = 48
function print(value) {
    const s = String(value || '')
    if (s.length <= PRINT_POINTS * 2) return s
    let out = `${s.length}:`
    for (let i = 0; i < PRINT_POINTS; i++) out += s[Math.floor((i * (s.length - 1)) / (PRINT_POINTS - 1))]
    return out + s.slice(-16)
}

/** A string that changes whenever anything a bubble shows changes: the conversation is drawn again then. */
function signature(rows) {
    return rows.map((r) => {
        if (r.type === 'day') return `#${r.label}`
        const album = r.album ? r.album.map((a) => print(a.src)).join(',') : ''
        const reacts = (r.reactions || []).map((x) => x.e + x.n + (x.mine ? '*' : '')).join(',')
        return [r.id, r.read ? 1 : 0, r.kind, r.text || '', print(r.media), print(r.avatar), album, reacts, r.pending || '',
            r.name || '', r.size || '', r.duration || '', r.author || '', r.reply || '', r.forwarded || '', r.phone || '',
            r.webpage ? print(r.webpage.image) + (r.webpage.title || '') : '', (r.wave || []).length].join('|')
    }).join(';')
}

module.exports = { buildTimeline, signature, dayLabel }
