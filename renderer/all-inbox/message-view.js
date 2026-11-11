'use strict'
// «Все мессенджеры»: one message drawn the way Telegram draws it — the group avatar, the coloured name, the quote with
// its colour bar, photos edge to edge with the time over them, albums laid out as Telegram lays them out, the time and
// ticks at the end of the text line, reactions, large lonely emoji, and the tail on the last bubble of a group.
const { linkParts } = require('./linkify')
const { jumboCount, mediaBox, MEDIA_MAX_W } = require('./message-shape')

const KIND_LABEL = { voice: 'Голосовое сообщение', video: 'Видео', sticker: 'Стикер', file: 'Файл', photo: 'Фото' }

const ICON_CHECK = '<svg viewBox="0 0 16 11" width="16" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6l3.2 3.2L11 2.5"/></svg>'
const ICON_CHECKS = '<svg viewBox="0 0 18 11" width="18" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l3.2 3.2L10.5 2.5"/><path d="M7.4 8.6l.6.6L14.5 2.5"/></svg>'
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>'
const ICON_REPLY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>'
const ICON_FILE ='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'

function el(tag, cls, text) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}

function initials(name) {
    const words = String(name || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
    return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase()
}

// time and ticks; inside the text it flows at the end of the last line, over a photo it floats on a dark pill
const ICON_CLOCK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>'
const ICON_FAILED = '<svg width="15" height="15" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#e5484d"/><path d="M12 7v6M12 16.5v.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>'

function meta(m, floating) {
    const box = el('span', `aic-meta${floating ? ' is-floating' : ''}`)
    box.append(el('span', 'aic-time', m.time))
    if (m.pending) {
        // being sent: a clock; not taken by the messenger: a red mark
        const state = el('span', `aic-pending is-${m.pending}`)
        state.innerHTML = m.pending === 'failed' ? ICON_FAILED : ICON_CLOCK
        state.title = m.pending === 'failed' ? 'Не отправлено' : 'Отправляется…'
        box.append(state)
    } else if (m.out) {
        const tick = el('span', `aic-check${m.read ? ' is-read' : ''}`)
        tick.innerHTML = m.read ? ICON_CHECKS : ICON_CHECK
        box.append(tick)
    }
    return box
}

function textBlock(m, onLink, withMeta = true) {
    const node = el('div', 'aic-text')
    for (const part of linkParts(m.text)) {
        if (!part.url) { node.append(document.createTextNode(part.text)); continue }
        const a = el('a', 'aic-link', part.text)
        a.href = part.url
        a.title = part.url
        a.addEventListener('click', (e) => { e.preventDefault(); onLink(part.url) })
        node.append(a)
    }
    if (withMeta) node.append(meta(m, false))
    return node
}

// a link preview under the text: a colour bar, the site, the title, a few lines and the picture; a click opens the link
function webpageCard(m, onLink) {
    const w = m.webpage
    const card = el('div', 'aic-webpage')
    if (w.site) card.append(el('div', 'aic-webpage-site', w.site))
    if (w.title) card.append(el('div', 'aic-webpage-title', w.title))
    if (w.text) card.append(el('div', 'aic-webpage-text', w.text))
    if (w.image) { const img = el('img', 'aic-webpage-img'); img.src = w.image; img.alt = ''; img.decoding = 'async'; card.append(img) }
    if (w.url) {
        card.classList.add('is-link')
        card.title = w.url
        card.addEventListener('click', () => onLink(w.url))
    }
    return card
}

function photo(m, onZoom) {
    const box = mediaBox(m.mediaW, m.mediaH)
    const wrap = el('div', 'aic-photo')
    wrap.style.width = `${box.width}px`
    wrap.style.aspectRatio = `${box.width} / ${box.height}`
    if (m.media) {
        const img = el('img')
        img.src = m.media
        img.alt = ''
        img.decoding = 'async'
        wrap.append(img)
    }
    if (m.kind === 'video') wrap.append(Object.assign(el('span', 'aic-play'), { innerHTML: ICON_PLAY }))
    if (m.kind === 'photo' && m.media) {
        wrap.classList.add('is-zoomable')
        wrap.title = 'Открыть крупно'
        wrap.addEventListener('click', () => onZoom(m, m.media, m.picture))
    }
    return wrap
}

function album(m, onZoom) {
    const ratio = m.album[0].ratio || 1
    const width = MEDIA_MAX_W
    const wrap = el('div', 'aic-album')
    wrap.style.width = `${width}px`
    wrap.style.aspectRatio = String(ratio)
    for (const item of m.album) {
        const cell = el('div', 'aic-album-item')
        cell.style.left = `${item.x * 100}%`
        cell.style.top = `${item.y * 100}%`
        cell.style.width = `${item.w * 100}%`
        cell.style.height = `${item.h * 100}%`
        if (item.src) {
            const img = el('img')
            img.src = item.src
            img.alt = ''
            img.decoding = 'async'
            cell.append(img)
            cell.classList.add('is-zoomable')
            cell.addEventListener('click', () => onZoom(m, item.src, item.picture || ''))
        }
        wrap.append(cell)
    }
    return wrap
}

function card(m, onOpenInTab) {
    const box = el('button', `aic-card kind-${m.kind}`)
    box.type = 'button'
    box.title = 'Открыть в мессенджере'
    const icon = el('span', 'aic-card-icon')
    icon.innerHTML = m.kind === 'voice' || m.kind === 'video' ? ICON_PLAY : ICON_FILE
    // a picture sent as a file shows its small preview in place of the icon
    if (m.kind === 'file' && m.media) {
        icon.replaceChildren(Object.assign(el('img'), { src: m.media, alt: '' }))
        icon.classList.add('has-thumb')
    }
    const info = el('span', 'aic-card-info')
    info.append(el('span', 'aic-card-name', m.name || KIND_LABEL[m.kind] || ''))
    const sub = [m.duration, m.size].filter(Boolean).join(' · ')
    if (m.kind === 'voice') info.append(Object.assign(el('span', 'aic-wave'), { innerHTML: '<i></i>'.repeat(28) }))
    if (sub) info.append(el('span', 'aic-card-sub', sub))
    box.append(icon, info)
    box.addEventListener('click', onOpenInTab)
    return box
}

function reactions(m) {
    const row = el('div', 'aic-reactions')
    for (const r of m.reactions) {
        const pill = el('span', `aic-reaction${r.mine ? ' is-mine' : ''}`)
        pill.append(el('span', 'aic-reaction-e', r.e))
        if (r.n && r.n !== '1') pill.append(el('span', 'aic-reaction-n', r.n))
        row.append(pill)
    }
    return row
}

/**
 * @param {object} m a row of timeline.js
 * @param {{ isGroup: boolean, onLink: Function, onZoom: Function, onOpenInTab: Function }} ctx
 */
function renderMessage(m, ctx) {
    const jumbo = m.kind === 'text' && !m.reply && !m.forwarded ? jumboCount(m.text) : 0
    const hasMedia = !!(m.album || (m.media && (m.kind === 'photo' || m.kind === 'video')))
    const sticker = m.kind === 'sticker' && m.media
    const classes = ['aic-row', m.out ? 'is-out' : 'is-in']
    if (m.groupStart) classes.push('is-first')
    if (m.groupEnd) classes.push('is-last')
    if (m.pending) classes.push('is-pending')
    const row = el('div', classes.join(' '))
    row.dataset.id = m.id

    // in group chats every group of someone else's messages has their avatar next to its last bubble
    if (ctx.isGroup && !m.out) {
        const slot = el('div', 'aic-avatar')
        if (m.groupEnd) {
            if (m.avatar) { const img = el('img'); img.src = m.avatar; img.alt = ''; slot.append(img) } else {
                slot.textContent = m.avatarText || initials(m.author)
                slot.classList.add('is-text')
                if (m.authorColor) slot.style.background = m.authorColor
            }
        }
        row.append(slot)
    }

    const kindClass = jumbo ? 'is-jumbo' : sticker ? 'is-sticker' : hasMedia ? (m.text ? 'has-media' : 'is-media-only') : `kind-${m.kind}`
    const b = el('div', `aic-bubble ${kindClass}`)
    if (jumbo) b.dataset.count = String(jumbo)
    if (m.authorColor) b.style.setProperty('--name', m.authorColor)

    if (m.author && !m.out && m.groupStart && ctx.isGroup && !jumbo && !sticker) b.append(el('div', 'aic-author', m.author))
    if (m.forwarded) b.append(el('div', 'aic-fwd', `Переслано от ${m.forwarded}`))
    if (m.reply) {
        const quote = el('div', 'aic-quote')
        // Telegram's own colour of the quote fits its theme; in your own bubbles Centrio's theme decides it
        if (m.replyColor && !m.out) quote.style.setProperty('--quote', m.replyColor)
        if (m.replyTitle) quote.append(el('div', 'aic-quote-title', m.replyTitle))
        quote.append(el('div', 'aic-quote-text', m.reply))
        b.append(quote)
    }

    // a bubble with a photo is as wide as the photo, its caption wraps under it, like in Telegram
    if (m.album) { b.append(album(m, ctx.onZoom)); b.style.width = `${MEDIA_MAX_W}px` }
    else if (hasMedia) { const media = photo(m, ctx.onZoom); b.append(media); b.style.width = media.style.width }
    else if (sticker) {
        const img = el('img', 'aic-sticker')
        img.src = m.media
        img.alt = ''
        b.append(img)
    } else if (m.kind !== 'text' && m.kind !== 'photo') b.append(card(m, ctx.onOpenInTab))

    if (jumbo) b.append(el('div', 'aic-jumbo', m.text), meta(m, true))
    else if (m.text && m.webpage) { b.classList.add('has-webpage'); b.append(textBlock(m, ctx.onLink, false), webpageCard(m, ctx.onLink), meta(m, false)) }
    else if (m.text) b.append(textBlock(m, ctx.onLink))
    else b.append(meta(m, hasMedia || sticker))

    if (m.reactions && m.reactions.length) b.append(reactions(m))
    row.append(b)

    // answer this message: the round arrow next to it on hover, or a double click on it
    if (ctx.onReply) {
        const answer = el('button', 'aic-answer')
        answer.type = 'button'
        answer.title = 'Ответить'
        answer.setAttribute('aria-label', 'Ответить')
        answer.innerHTML = ICON_REPLY
        answer.addEventListener('click', () => ctx.onReply(m))
        row.append(answer)
        b.addEventListener('dblclick', (e) => { if (!String(window.getSelection() || '').trim()) { e.preventDefault(); ctx.onReply(m) } })
    }
    return row
}

module.exports = { renderMessage }
