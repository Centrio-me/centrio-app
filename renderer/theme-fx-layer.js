'use strict'
// 3.7.3: the layer behind the window for the themes with effects («Аврора», «Время суток»), see shared/theme-fx.js.
// <html data-fx="aurora|daytime" data-tod="morning|day|evening|night">; styles-themes-fx.css draws the rest.
// The animation stops while the window is hidden (no GPU work for nobody) and for «Уменьшить движение».
const { resolveTheme } = require('../shared/theme-fx')

const PHASE_CHECK_MS = 60 * 1000
const LAYER_ID = 'themeFxLayer'

let phaseTimer = null
let currentTheme = null
let onPhaseChange = null

function ensureLayer() {
    let layer = document.getElementById(LAYER_ID)
    if (layer) return layer
    layer = document.createElement('div')
    layer.id = LAYER_ID
    layer.className = 'theme-fx'
    layer.setAttribute('aria-hidden', 'true')
    // aurora: three soft lights; daytime: four skies that cross-fade, stars, the sun (the moon at night), film grain
    for (const cls of ['fx-glow g1', 'fx-glow g2', 'fx-glow g3',
        'fx-sky morning', 'fx-sky day', 'fx-sky evening', 'fx-sky night', 'fx-stars', 'fx-sun', 'fx-grain']) {
        const part = document.createElement('span')
        part.className = cls
        layer.append(part)
    }
    document.body.prepend(layer)
    // the slow cross-fades only once the first picture is on screen: the app never starts from an empty sky
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('fx-ready')))
    return layer
}

function removeLayer() {
    document.documentElement.classList.remove('fx-ready')
    document.getElementById(LAYER_ID)?.remove()
}

function stopPhaseTimer() {
    if (phaseTimer) clearInterval(phaseTimer)
    phaseTimer = null
}

/**
 * Applies the effect part of a theme and returns the base theme to put into data-theme.
 * @param {string} theme the saved (or the org-forced) theme
 * @param {(theme: string) => void} [reapply] called when the time of day moves on, to re-apply the whole theme
 * @returns {string}
 */
function applyThemeFx(theme, reapply) {
    const root = document.documentElement
    const { base, fx, phase } = resolveTheme(theme, new Date().getHours())
    currentTheme = theme
    onPhaseChange = reapply || null
    if (!fx) {
        stopPhaseTimer()
        root.removeAttribute('data-fx')
        root.removeAttribute('data-tod')
        removeLayer()
        return base
    }
    ensureLayer()
    root.setAttribute('data-fx', fx)
    if (phase) root.setAttribute('data-tod', phase)
    else root.removeAttribute('data-tod')
    if (fx === 'daytime' && !phaseTimer) {
        phaseTimer = setInterval(() => {
            const next = resolveTheme(currentTheme, new Date().getHours())
            if (next.fx !== 'daytime') { stopPhaseTimer(); return }
            if (next.phase !== root.getAttribute('data-tod') && typeof onPhaseChange === 'function') onPhaseChange(currentTheme)
        }, PHASE_CHECK_MS)
    } else if (fx !== 'daytime') {
        stopPhaseTimer()
    }
    return base
}

document.addEventListener('visibilitychange', () => {
    document.documentElement.classList.toggle('fx-paused', document.hidden)
})

module.exports = { applyThemeFx }
