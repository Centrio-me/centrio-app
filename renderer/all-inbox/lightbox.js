'use strict'
// «Все мессенджеры»: photos of the open conversation on the whole window, like Telegram's viewer — ←/→ through every
// photo of the chat, the wheel zooms, a zoomed photo is dragged, a double click zooms in and out, Esc closes.

const MIN_SCALE = 1
const MAX_SCALE = 5
const WHEEL_STEP = 1.15
const DOUBLE_SCALE = 2.2

const ICON_PREV = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>'
const ICON_NEXT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>'
const ICON_CLOSE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'

/**
 * Every photo of the drawn conversation, oldest first: single photos and each photo of an album.
 * @param {object[]} rows rows of timeline.js
 * @returns {{ src: string, picture: string, author: string, time: string, out: boolean }[]}
 */
function galleryOf(rows) {
    const out = []
    for (const r of rows || []) {
        if (r.type !== 'msg') continue
        const who = { author: r.out ? '' : r.author, time: r.time, out: r.out }
        if (r.album) for (const a of r.album) { if (a.src) out.push({ src: a.src, picture: a.picture || '', ...who }) }
        else if (r.kind === 'photo' && r.media) out.push({ src: r.media, picture: r.picture || '', ...who })
    }
    return out
}

function el(tag, cls, html) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (html) node.innerHTML = html
    return node
}

/**
 * @param {{ root: HTMLElement, onPicture: (key: string) => Promise<string>, label?: (who: object) => string }} deps
 */
function createLightbox({ root, onPicture }) {
    const box = el('div', 'aic-lightbox')
    box.tabIndex = -1
    box.hidden = true
    const stage = el('div', 'aic-lb-stage')
    const img = document.createElement('img')
    img.alt = ''
    img.draggable = false
    // a video of the conversation plays here too, with the player's own controls
    const video = document.createElement('video')
    video.controls = true
    video.playsInline = true
    video.hidden = true
    stage.append(img, video)
    let videoUrl = ''
    function dropVideo() {
        video.pause()
        video.removeAttribute('src')
        video.load()
        video.hidden = true
        box.classList.remove('is-video', 'is-round')
        if (videoUrl) { URL.revokeObjectURL(videoUrl); videoUrl = '' }
    }
    const top = el('div', 'aic-lb-top')
    const who = el('div', 'aic-lb-who')
    const counter = el('div', 'aic-lb-count')
    const close = el('button', 'aic-lb-btn aic-lb-close', ICON_CLOSE)
    close.type = 'button'
    close.title = 'Закрыть'
    top.append(who, counter, close)
    const prev = el('button', 'aic-lb-nav is-prev', ICON_PREV)
    const next = el('button', 'aic-lb-nav is-next', ICON_NEXT)
    prev.type = next.type = 'button'
    prev.title = 'Предыдущее фото'
    next.title = 'Следующее фото'
    box.append(stage, top, prev, next)
    root.append(box)

    let items = []
    let at = 0
    let scale = 1
    let dx = 0
    let dy = 0
    let shownToken = 0
    let fallbackName = ''

    function apply() {
        img.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
        box.classList.toggle('is-zoomed', scale > 1)
    }
    function resetZoom() { scale = 1; dx = 0; dy = 0; apply() }

    async function show(index) {
        if (!items.length) return
        at = (index + items.length) % items.length
        const item = items[at]
        const token = ++shownToken
        dropVideo()
        img.hidden = false
        resetZoom()
        img.src = item.src
        who.textContent = [item.out ? 'Вы' : (item.author || fallbackName), item.time].filter(Boolean).join(' · ')
        counter.textContent = items.length > 1 ? `${at + 1} из ${items.length}` : ''
        prev.hidden = next.hidden = items.length < 2
        // the small copy at once, the full one as soon as the page gives it
        const full = item.picture ? await onPicture(item.picture).catch(() => '') : ''
        if (full && token === shownToken && !box.hidden) img.src = full
    }

    /** @param {string} [name] who the photos are from when a message names no author (a private chat, a channel) */
    function open(gallery, src, name = '') {
        fallbackName = name
        items = gallery.length ? gallery : [{ src, picture: '', author: '', time: '', out: false }]
        const start = Math.max(0, items.findIndex((g) => g.src === src))
        box.hidden = false
        box.focus()
        show(start)
    }
    function hide() { box.hidden = true; img.removeAttribute('src'); dropVideo(); items = []; shownToken++ }

    /** A video (a blob: address made by our window): plays at once; the address is given back on close. */
    function openVideo(url, label, round = false) {
        shownToken++
        dropVideo()
        videoUrl = url
        items = []
        img.hidden = true
        img.removeAttribute('src')
        who.textContent = label || ''
        counter.textContent = ''
        prev.hidden = next.hidden = true
        box.classList.add('is-video')
        box.classList.toggle('is-round', round)
        video.hidden = false
        video.src = url
        box.hidden = false
        box.focus()
        video.play().catch(() => {})
    }

    close.addEventListener('click', hide)
    prev.addEventListener('click', (e) => { e.stopPropagation(); show(at - 1) })
    next.addEventListener('click', (e) => { e.stopPropagation(); show(at + 1) })
    // a click on the dark around the photo closes it, a click on the photo does not
    box.addEventListener('click', (e) => { if (e.target === box || e.target === stage) hide() })
    box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide() }
        else if (!video.hidden) { if (e.key === ' ' && e.target !== video) { e.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause() } }
        else if (e.key === 'ArrowLeft') show(at - 1)
        else if (e.key === 'ArrowRight') show(at + 1)
    })
    box.addEventListener('wheel', (e) => {
        e.preventDefault()
        if (!video.hidden) return
        const k = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * k))
        if (scale === 1) { dx = 0; dy = 0 }
        apply()
    }, { passive: false })
    img.addEventListener('dblclick', () => { if (scale > 1) resetZoom(); else { scale = DOUBLE_SCALE; apply() } })
    let drag = null
    img.addEventListener('pointerdown', (e) => {
        if (scale <= 1) return
        drag = { x: e.clientX - dx, y: e.clientY - dy }
        img.setPointerCapture(e.pointerId)
    })
    img.addEventListener('pointermove', (e) => { if (drag) { dx = e.clientX - drag.x; dy = e.clientY - drag.y; apply() } })
    img.addEventListener('pointerup', () => { drag = null })

    return { open, openVideo, hide, isOpen: () => !box.hidden }
}

module.exports = { createLightbox, galleryOf }
