'use strict'
// «Все мессенджеры»: search in the open conversation (Ctrl+F or the magnifier in the header). Every match in the
// drawn messages is marked through the CSS Highlight API — the messages themselves are not touched — and ↑/↓ or
// Enter / Shift+Enter go from one to the next, newest first, like in Telegram.

const HL_ALL = 'aic-find'
const HL_NOW = 'aic-find-now'
const MIN_QUERY = 2

const ICON_UP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>'
const ICON_DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
const ICON_CLOSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>'

/**
 * Where a query is found in a text, case-insensitively.
 * @returns {number[]} start offsets
 */
function findAll(text, query) {
    const hay = String(text || '').toLowerCase()
    const needle = String(query || '').trim().toLowerCase()
    if (needle.length < MIN_QUERY) return []
    const out = []
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) out.push(at)
    return out
}

function button(cls, icon, title) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = cls
    b.innerHTML = icon
    b.title = title
    b.setAttribute('aria-label', title)
    return b
}

/** @param {{ root: HTMLElement, list: HTMLElement, anchor: HTMLElement }} deps */
function createChatSearch({ root, list, anchor }) {
    const bar = document.createElement('div')
    bar.className = 'aic-find'
    bar.hidden = true
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'aic-find-input'
    input.placeholder = 'Поиск в переписке'
    input.spellcheck = false
    const count = document.createElement('span')
    count.className = 'aic-find-count'
    const up = button('aic-find-btn', ICON_UP, 'Раньше')
    const down = button('aic-find-btn', ICON_DOWN, 'Позже')
    const close = button('aic-find-btn', ICON_CLOSE, 'Закрыть поиск')
    bar.append(input, count, up, down, close)
    anchor.after(bar)

    const supported = typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function'
    let ranges = []
    let at = -1

    function clearMarks() {
        if (!supported) return
        CSS.highlights.delete(HL_ALL)
        CSS.highlights.delete(HL_NOW)
    }

    function collect() {
        const query = input.value
        const found = []
        for (const node of list.querySelectorAll('.aic-text, .aic-card-name, .aic-quote-text')) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
            for (let t = walker.nextNode(); t; t = walker.nextNode()) {
                for (const start of findAll(t.data, query)) {
                    const r = new Range()
                    r.setStart(t, start)
                    r.setEnd(t, start + query.trim().length)
                    found.push(r)
                }
            }
        }
        return found
    }

    function paint(scroll) {
        clearMarks()
        count.textContent = input.value.trim().length < MIN_QUERY ? '' : ranges.length ? `${ranges.length - at} из ${ranges.length}` : 'Нет совпадений'
        bar.classList.toggle('is-empty', input.value.trim().length >= MIN_QUERY && !ranges.length)
        up.disabled = at <= 0
        down.disabled = at < 0 || at >= ranges.length - 1
        if (!supported || !ranges.length) return
        CSS.highlights.set(HL_ALL, new Highlight(...ranges))
        CSS.highlights.set(HL_NOW, new Highlight(ranges[at]))
        if (scroll) ranges[at].startContainer.parentElement?.closest('.aic-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }

    // the newest match first; a new search starts there
    function run() {
        ranges = collect()
        at = ranges.length - 1
        paint(true)
    }

    function step(delta) {
        if (!ranges.length) return
        at = Math.max(0, Math.min(ranges.length - 1, at + delta))
        paint(true)
    }

    function open() {
        bar.hidden = false
        root.classList.add('is-finding')
        input.focus()
        input.select()
        if (input.value) run()
    }

    function hide() {
        bar.hidden = true
        root.classList.remove('is-finding')
        ranges = []
        at = -1
        clearMarks()
    }

    input.addEventListener('input', run)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? 1 : -1) }
        else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1) }
        else if (e.key === 'ArrowDown') { e.preventDefault(); step(1) }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide() }
    })
    up.addEventListener('click', () => step(-1))
    down.addEventListener('click', () => step(1))
    close.addEventListener('click', hide)

    return {
        open,
        hide,
        isOpen: () => !bar.hidden,
        // the conversation was drawn again: the marks are found again in the new messages, the place is kept
        refresh() {
            if (bar.hidden || input.value.trim().length < MIN_QUERY) return
            const keepFromEnd = ranges.length - at
            ranges = collect()
            at = ranges.length ? Math.max(0, ranges.length - keepFromEnd) : -1
            paint(false)
        },
        reset() { input.value = ''; hide() }
    }
}

module.exports = { createChatSearch, findAll }
