'use strict'
// «Все мессенджеры»: the list's width is the person's — its edge next to the page is dragged wider or narrower, the
// width is kept on this computer, a double click on the edge brings back the usual one.

const WIDTH_KEY = 'centrio-all-inbox-width'
const DEFAULT_W = 340
const MIN_W = 280
const MAX_W = 640

/**
 * A width the list may take: between its smallest and largest, and not more than half the window.
 * @param {*} value a width (a saved one may be text, or broken)
 * @param {number} windowWidth
 * @returns {number}
 */
function clampWidth(value, windowWidth) {
    const n = Number(value)
    if (value == null || value === '' || !Number.isFinite(n)) return DEFAULT_W
    const most = Math.max(MIN_W, Math.min(MAX_W, Math.floor(windowWidth / 2)))
    return Math.round(Math.max(MIN_W, Math.min(most, n)))
}

function read() { try { return localStorage.getItem(WIDTH_KEY) } catch { return null } }
function save(w) { try { localStorage.setItem(WIDTH_KEY, String(w)) } catch {} }

/**
 * @param {{ panel: HTMLElement, contentOf: () => HTMLElement | null }} deps — contentOf: the page area next to the list
 */
function attachPanelResize({ panel, contentOf }) {
    const edge = document.createElement('div')
    edge.className = 'ai-resize'
    edge.setAttribute('role', 'separator')
    edge.setAttribute('aria-orientation', 'vertical')
    edge.setAttribute('aria-label', 'Ширина списка')
    edge.title = 'Потяните, чтобы изменить ширину; двойной щелчок — как было'
    edge.tabIndex = 0
    panel.append(edge)

    let width = clampWidth(read(), window.innerWidth)
    const apply = () => { panel.style.width = `${width}px`; edge.setAttribute('aria-valuenow', String(width)) }
    apply()

    // the edge is on the side of the page: the list can stand left or right of it
    const pageIsAfter = () => {
        const content = contentOf()
        return !content || !!(panel.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING)
    }
    function placeEdge() { edge.classList.toggle('is-left', !pageIsAfter()) }
    placeEdge()

    edge.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return
        e.preventDefault()
        placeEdge()
        const startX = e.clientX
        const startW = width
        const sign = pageIsAfter() ? 1 : -1
        edge.setPointerCapture(e.pointerId)
        document.body.classList.add('ai-resizing')
        const move = (ev) => { width = clampWidth(startW + (ev.clientX - startX) * sign, window.innerWidth); apply() }
        const up = () => {
            edge.removeEventListener('pointermove', move)
            edge.removeEventListener('pointerup', up)
            edge.removeEventListener('pointercancel', up)
            document.body.classList.remove('ai-resizing')
            save(width)
        }
        edge.addEventListener('pointermove', move)
        edge.addEventListener('pointerup', up)
        edge.addEventListener('pointercancel', up)
    })
    edge.addEventListener('dblclick', () => { width = DEFAULT_W; apply(); save(width) })
    // the keyboard: ←/→ by 20 px
    edge.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const step = (e.key === 'ArrowRight' ? 20 : -20) * (pageIsAfter() ? 1 : -1)
        width = clampWidth(width + step, window.innerWidth)
        apply()
        save(width)
    })
    window.addEventListener('resize', () => { const next = clampWidth(width, window.innerWidth); if (next !== width) { width = next; apply() } })

    return { placeEdge }
}

module.exports = { clampWidth, attachPanelResize, MIN_W, MAX_W, DEFAULT_W }
