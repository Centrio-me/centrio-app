'use strict'
// «Все мессенджеры»: one message drawn the way Telegram draws it — the group avatar, the coloured name, the quote with
// its colour bar, photos edge to edge with the time over them, albums laid out as Telegram lays them out, the time and
// ticks at the end of the text line, reactions, large lonely emoji, and the tail on the last bubble of a group.
const { linkParts } = require('./linkify')
const { jumboCount, mediaBox, MEDIA_MAX_W } = require('./message-shape')
const { waveBars, clock } = require('./media-player')
// the emoji set of the open chat's messenger (3.8.3): Telegram and MAX pictures from their own servers, others our font
const { emojiUrl, emojiParts, setEmojiSet, getEmojiSet } = require('./emoji-images')

/** text with every emoji as the messenger's own picture; a picture that does not load becomes the character again */
function emojiNodes(text) {
    const frag = document.createDocumentFragment()
    for (const part of emojiParts(text)) {
        if (part.text) { frag.append(document.createTextNode(part.text)); continue }
        const url = emojiUrl(part.emoji, getEmojiSet())
        if (!url) { frag.append(document.createTextNode(part.emoji)); continue }
        const img = document.createElement('img')
        img.className = 'aic-emo-img'
        img.alt = part.emoji
        img.draggable = false
        img.decoding = 'async'
        img.addEventListener('error', () => img.replaceWith(document.createTextNode(part.emoji)), { once: true })
        img.src = url
        frag.append(img)
    }
    return frag
}

const VOICE_BARS = 34

const KIND_LABEL = { voice: 'Голосовое сообщение', video: 'Видео', sticker: 'Стикер', file: 'Файл', photo: 'Фото' }

const ICON_CHECK = '<svg viewBox="0 0 16 11" width="16" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6l3.2 3.2L11 2.5"/></svg>'
const ICON_CHECKS = '<svg viewBox="0 0 18 11" width="18" height="11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6l3.2 3.2L10.5 2.5"/><path d="M7.4 8.6l.6.6L14.5 2.5"/></svg>'
const ICON_PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>'
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.3"/><rect x="13.5" y="5" width="4" height="14" rx="1.3"/></svg>'
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
        state.title = m.pending === 'failed' ? 'Не отправлено — нажмите, чтобы убрать' : 'Отправляется…'
        if (m.pending === 'failed') state.dataset.dismiss = m.id
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
        if (!part.url) { node.append(emojiNodes(part.text)); continue }
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

// a voice message that plays right here: the button, the waveform (a click on it jumps there), the time
function voice(m, ctx) {
    const box = el('div', 'aic-voice')
    box.dataset.play = m.id
    box.dataset.duration = m.duration || ''
    const btn = el('button', 'aic-voice-btn')
    btn.type = 'button'
    btn.setAttribute('aria-label', 'Слушать')
    btn.innerHTML = `<span class="aic-voice-play">${ICON_PLAY}</span><span class="aic-voice-pause">${ICON_PAUSE}</span><span class="aic-voice-spin"></span>`
    btn.addEventListener('click', (e) => { e.stopPropagation(); ctx.onVoice(m) })
    const wave = el('div', 'aic-voice-wave')
    for (const h of waveBars(m.wave, VOICE_BARS)) { const bar = el('i'); bar.style.height = `${Math.round(h * 100)}%`; wave.append(bar) }
    wave.addEventListener('click', (e) => {
        const r = wave.getBoundingClientRect()
        if (r.width) ctx.onSeek(m, (e.clientX - r.left) / r.width)
    })
    const info = el('div', 'aic-voice-info')
    info.append(wave, el('span', 'aic-voice-time', m.duration || ''))
    box.append(btn, info)
    paintVoice(box, ctx.playerState())
    return box
}

/** Shows the player's state on a drawn voice message: playing, paused, loading, how far. */
function paintVoice(box, state) {
    const mine = state.id === box.dataset.play
    const playing = mine && state.playing
    box.classList.toggle('is-playing', playing)
    box.classList.toggle('is-loading', mine && state.loading)
    box.classList.toggle('is-failed', mine && state.failed)
    const btn = box.querySelector('.aic-voice-btn')
    if (btn) btn.setAttribute('aria-label', playing ? 'Пауза' : 'Слушать')
    const part = mine && state.duration ? state.current / state.duration : 0
    const bars = box.querySelectorAll('.aic-voice-wave i')
    const lit = Math.round(part * bars.length)
    bars.forEach((b, i) => b.classList.toggle('is-on', i < lit))
    const time = box.querySelector('.aic-voice-time')
    if (time) time.textContent = mine && state.failed ? 'Не загрузилось — откроется в мессенджере' : (mine && (playing || state.current > 0) ? clock(state.current) : box.dataset.duration)
}

function votesWord(n) {
    const a = n % 10, b = n % 100
    if (a === 1 && b !== 11) return `${n} голос`
    if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return `${n} голоса`
    return `${n} голосов`
}

const POLL_TYPE_LABEL = { anon: 'Анонимный опрос', public: 'Опрос', quiz: 'Викторина' }

// a poll as the messenger shows it: the question, the options to vote in (one tap, or several and «Голосовать»),
// and once you voted or it is closed, each option's share with a bar and your choice ticked
function pollCard(m, ctx) {
    const p = m.poll
    const box = el('div', `aic-poll${p.showResults ? ' is-results' : ''}${ctx.isVoting && ctx.isVoting(m.id) ? ' is-sending' : ''}`)
    box.append(el('div', 'aic-poll-q', p.question))
    const sub = [p.closed ? 'Опрос завершён' : POLL_TYPE_LABEL[p.type], p.multiple && !p.showResults ? 'можно несколько' : ''].filter(Boolean).join(' · ')
    box.append(el('div', 'aic-poll-type', sub))
    const list = el('div', 'aic-poll-options')
    const picked = new Set()
    const canVote = !p.showResults && typeof ctx.onVote === 'function'
    let send = null
    p.options.forEach((o) => {
        const i = o.index
        if (p.showResults) {
            const row = el('div', `aic-poll-opt is-result${o.chosen ? ' is-chosen' : ''}${o.correct ? ' is-correct' : ''}`)
            row.style.setProperty('--pct-n', String(o.pct / 100))
            const head = el('div', 'aic-poll-line')
            head.append(el('span', 'aic-poll-pct', `${o.pct}%`), el('span', 'aic-poll-text', o.text))
            if (o.chosen) head.append(Object.assign(el('span', 'aic-poll-mine'), { innerHTML: ICON_CHECK }))
            row.append(head, el('div', 'aic-poll-bar'))
            list.append(row)
            return
        }
        const btn = el('button', 'aic-poll-opt')
        btn.type = 'button'
        btn.disabled = !canVote
        btn.append(el('span', 'aic-poll-dot'), el('span', 'aic-poll-text', o.text))
        btn.addEventListener('click', () => {
            if (!p.multiple) { box.classList.add('is-sending'); ctx.onVote(m, [i]); return }
            if (picked.has(i)) picked.delete(i); else picked.add(i)
            btn.classList.toggle('is-picked', picked.has(i))
            if (send) send.disabled = !picked.size
        })
        list.append(btn)
    })
    box.append(list)
    if (canVote && p.multiple) {
        send = el('button', 'aic-poll-send', 'Голосовать')
        send.type = 'button'
        send.disabled = true
        send.addEventListener('click', () => { box.classList.add('is-sending'); ctx.onVote(m, [...picked]) })
        box.append(send)
    }
    box.append(el('div', 'aic-poll-total', p.total ? votesWord(p.total) : 'Пока нет голосов'))
    return box
}

function photo(m, onZoom, ctx = {}) {
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
    if (m.kind === 'video') {
        wrap.append(Object.assign(el('span', 'aic-play'), { innerHTML: ICON_PLAY }))
        if (m.duration) wrap.append(el('span', 'aic-video-time', m.duration))
        if (m.round) wrap.classList.add('is-round')
        if (ctx.onVideo) {
            wrap.classList.add('is-zoomable')
            wrap.title = 'Смотреть'
            wrap.addEventListener('click', () => ctx.onVideo(m, wrap))
        }
    }
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

const ICON_PHONE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>'

// a shared contact, like Telegram's: the picture, the name, the number — copied with a click on it
function contactCard(m, onOpenInTab) {
    const box = el('div', 'aic-contact')
    const ava = el('span', 'aic-contact-ava')
    if (m.media) ava.append(Object.assign(el('img'), { src: m.media, alt: '' }))
    else ava.textContent = initials(m.name)
    const info = el('span', 'aic-contact-info')
    info.append(el('span', 'aic-contact-name', m.name || 'Контакт'))
    const isNumber = /\d{5,}/.test(m.phone.replace(/\D/g, ''))
    if (m.phone) info.append(el('span', `aic-contact-phone${isNumber ? ' is-number' : ''}`, m.phone))
    box.append(ava, info)
    const actions = el('div', 'aic-contact-actions')
    if (isNumber) {
        const copy = el('button', 'aic-contact-btn')
        copy.type = 'button'
        copy.innerHTML = ICON_PHONE
        copy.append(el('span', '', 'Скопировать номер'))
        copy.addEventListener('click', () => {
            navigator.clipboard.writeText(m.phone).then(() => { copy.lastChild.textContent = 'Скопировано'; setTimeout(() => { copy.lastChild.textContent = 'Скопировать номер' }, 1500) }).catch(() => {})
        })
        actions.append(copy)
    }
    const open = el('button', 'aic-contact-btn')
    open.type = 'button'
    open.textContent = 'Открыть в мессенджере'
    open.addEventListener('click', onOpenInTab)
    actions.append(open)
    const wrap = el('div', 'aic-contact-wrap')
    wrap.append(box, actions)
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
        // MAX gives the reaction as a picture (taken off its canvas), Telegram as an emoji
        if (r.img && /^data:image\/png;base64,/.test(r.img)) { const pic = el('img', 'aic-reaction-img'); pic.src = r.img; pic.alt = ''; pill.append(pic) }
        else { const e = el('span', 'aic-reaction-e'); e.append(emojiNodes(r.e)); pill.append(e) }
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

    if (m.author && !m.out && m.groupStart && ctx.isGroup && !jumbo && !sticker) {
        const name = el('div', 'aic-author', m.author)
        if (m.authorBadge) { const st = el('img', 'aic-author-status'); st.src = m.authorBadge; st.alt = ''; name.append(st) }
        b.append(name)
    }
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
    else if (hasMedia) { const media = photo(m, ctx.onZoom, ctx); b.append(media); b.style.width = media.style.width }
    else if (sticker) {
        const img = el('img', 'aic-sticker')
        img.src = m.media
        img.alt = ''
        b.append(img)
    } else if (m.kind === 'contact') { b.classList.add('has-contact'); b.append(contactCard(m, ctx.onOpenInTab)) }
    else if (m.kind === 'poll' && m.poll) { b.classList.add('has-poll'); b.append(pollCard(m, ctx)) }
    else if (m.kind === 'voice' && ctx.onVoice) { b.classList.add('has-voice'); b.append(voice(m, ctx)) }
    else if (m.kind !== 'text' && m.kind !== 'photo') b.append(card(m, ctx.onOpenInTab))
    // a photo whose picture has not come (not loaded yet in the tab, or forwarded): its place, not a bubble of a lone
    // time sticking out of it (3.8.3 check)
    const emptyPhoto = m.kind === 'photo' && !hasMedia && !m.album
    if (emptyPhoto) {
        b.classList.add('has-empty-photo')
        const ph = el('div', 'aic-photo is-empty')
        ph.innerHTML = '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/></svg>'
        ph.append(el('span', '', 'Фото загружается в мессенджере'))
        b.append(ph)
    }

    if (jumbo) { const big = el('div', 'aic-jumbo'); big.append(emojiNodes(m.text)); b.append(big, meta(m, true)) }
    // a link preview; a shared post may come with no words of its own — then just its card
    else if (m.webpage) { b.classList.add('has-webpage'); if (m.text) b.append(textBlock(m, ctx.onLink, false)); b.append(webpageCard(m, ctx.onLink), meta(m, false)) }
    else if (m.text) b.append(textBlock(m, ctx.onLink))
    else b.append(meta(m, hasMedia || sticker || emptyPhoto))

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

/** Only the reactions of one drawn message, put in place at once (3.8.3: a pressed reaction shows instantly) */
function patchReactions(listEl, id, list) {
    const row = [...listEl.querySelectorAll('.aic-row[data-id]')].find((r) => r.dataset.id === String(id))
    const bubble = row && row.querySelector('.aic-bubble')
    if (!bubble) return false
    const old = bubble.querySelector(':scope > .aic-reactions')
    const next = list && list.length ? reactions({ reactions: list }) : null
    if (old && next) old.replaceWith(next)
    else if (old) old.remove()
    else if (next) bubble.append(next)
    return true
}

module.exports = { renderMessage, paintVoice, setEmojiSet, emojiNodes, patchReactions }
