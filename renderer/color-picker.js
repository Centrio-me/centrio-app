'use strict'
// The eyedropper: «Пипетка» in the right-click menu of a page and in the quick switcher. The person points at any pixel of the screen,
// and the colour is copied (HEX) and shown as HEX, RGB and HSL with a swatch. Uses the EyeDropper of Chromium.
const { parseColor, formatColor } = require('../shared/color-query')
const { showSaveToast } = require('./save-toast')

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
}

const SHOW_DELAY_MS = 20
const COPIED_MS = 1400
const LOUPE_PX = 132 // the round magnifier
const GRID = 11 // pixels shown across it (an odd number: the middle one is the one taken)
const MENU_CLOSE_MS = 140

/**
 * @param {{ tGet: (key: string, params?: object) => string }} deps
 */
function createColorPicker({ tGet, invokeIpc }) {
    let card = null

    function close() {
        if (card) card.remove()
        card = null
    }

    async function copy(value, button) {
        try { await navigator.clipboard.writeText(value) } catch { return }
        if (!button) return
        const was = button.textContent
        button.textContent = tGet('vext.answers.copied')
        setTimeout(() => { button.textContent = was }, COPIED_MS)
    }

    function show(rgb) {
        close()
        const f = formatColor(rgb)
        card = el('section', 'tr-card cp-card')
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-label', tGet('vext.color.pickTitle'))
        const head = el('div', 'tr-head')
        const closeBtn = el('button', 'tr-x', '×')
        closeBtn.type = 'button'
        closeBtn.setAttribute('aria-label', tGet('vext.answers.close'))
        closeBtn.addEventListener('click', close)
        head.append(el('span', 'tr-title', tGet('vext.color.pickTitle')), closeBtn)
        const swatch = el('div', 'cp-swatch')
        swatch.style.background = f.hex
        const rows = el('div', 'cp-rows')
        for (const value of [f.hex, f.rgb, f.hsl]) {
            const row = el('div', 'cp-row')
            const button = el('button', 'tr-btn', tGet('vext.answers.copyShort'))
            button.type = 'button'
            button.addEventListener('click', () => copy(value, button))
            row.append(el('span', 'cp-value', value), button)
            rows.append(row)
        }
        const again = el('button', 'tr-btn', tGet('vext.color.again'))
        again.type = 'button'
        again.addEventListener('click', () => { close(); pick() })
        const actions = el('div', 'tr-actions')
        actions.append(again)
        card.append(head, swatch, rows, actions)
        document.body.append(card)
        requestAnimationFrame(() => setTimeout(() => card && card.classList.add('show'), SHOW_DELAY_MS))
    }

    // Our own loupe: a picture of the window is taken once, the colour under the pointer is read from it, and a round magnifier
    // with the pixel grid and the colour name follows the pointer. Esc or a right click gives up.
    function loadImage(src) {
        return new Promise((resolve) => {
            const image = new Image()
            image.onload = () => resolve(image)
            image.onerror = () => resolve(null)
            image.src = src
        })
    }

    async function pickWithLoupe() {
        const shot = await Promise.resolve(invokeIpc('eyedropper:capture')).catch(() => null)
        const image = shot && await loadImage(shot.dataUrl)
        if (!image) return false
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const source = canvas.getContext('2d', { willReadFrequently: true })
        source.drawImage(image, 0, 0)
        const scale = image.width / window.innerWidth

        return new Promise((resolve) => {
            const overlay = el('div', 'cp-overlay')
            const loupe = el('div', 'cp-loupe')
            const view = document.createElement('canvas')
            view.width = LOUPE_PX
            view.height = LOUPE_PX
            const viewCtx = view.getContext('2d')
            viewCtx.imageSmoothingEnabled = false
            const centre = el('span', 'cp-centre')
            const label = el('div', 'cp-label')
            const chip = el('span', 'cp-chip')
            const code = el('span', 'cp-code', '')
            label.append(chip, code)
            loupe.append(view, centre, label)
            overlay.append(loupe)
            document.body.append(overlay)
            let current = null

            const onKey = (e) => {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null) }
            }
            const finish = (rgb) => {
                document.removeEventListener('keydown', onKey, true)
                overlay.remove()
                resolve(rgb)
            }
            const update = (e) => {
                const sx = Math.min(image.width - 1, Math.max(0, Math.round(e.clientX * scale)))
                const sy = Math.min(image.height - 1, Math.max(0, Math.round(e.clientY * scale)))
                const pixel = source.getImageData(sx, sy, 1, 1).data
                current = { r: pixel[0], g: pixel[1], b: pixel[2] }
                const hex = formatColor(current).hex
                viewCtx.clearRect(0, 0, LOUPE_PX, LOUPE_PX)
                const half = (GRID - 1) / 2
                viewCtx.drawImage(canvas, sx - half, sy - half, GRID, GRID, 0, 0, LOUPE_PX, LOUPE_PX)
                chip.style.background = hex
                code.textContent = hex
                loupe.style.transform = 'translate(' + (e.clientX - LOUPE_PX / 2) + 'px,' + (e.clientY - LOUPE_PX / 2) + 'px)'
                loupe.style.opacity = '1'
            }
            overlay.addEventListener('mousemove', update)
            overlay.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation() })
            overlay.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); update(e); finish(current) })
            overlay.addEventListener('contextmenu', (e) => { e.preventDefault(); finish(null) })
            document.addEventListener('keydown', onKey, true)
        })
    }

    /** The person points at a pixel; Esc gives up */
    async function pick() {
        await new Promise((resolve) => setTimeout(resolve, MENU_CLOSE_MS)) // the right-click menu goes away before the picture is taken
        let rgb = await pickWithLoupe()
        if (rgb === null) return
        if (rgb === false) {
            // no picture of the window: the system eyedropper of Chromium does the same job
            if (typeof window.EyeDropper !== 'function') {
                showSaveToast({ kind: 'error', text: tGet('vext.color.unsupported') })
                return
            }
            let result
            try { result = await new window.EyeDropper().open() } catch { return }
            rgb = parseColor(result && result.sRGBHex)
            if (!rgb) return
        }
        try { await navigator.clipboard.writeText(formatColor(rgb).hex) } catch { /* the card still shows it */ }
        show(rgb)
    }

    document.addEventListener('centrio-eyedropper', pick)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) close() }, true)
    document.addEventListener('mousedown', (e) => { if (card && !card.contains(e.target)) close() }, true)
    return { pick, close }
}

module.exports = { createColorPicker }
