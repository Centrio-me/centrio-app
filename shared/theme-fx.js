'use strict'
// Themes with their own effects (3.7.3). Each rides on an existing base theme, so every screen keeps its finished
// light or dark look; the effect is a layer behind the window plus see-through panels (styles-themes-fx.css).
//   aurora  — the dark base, a slow northern light behind glass panels
//   daytime — follows the local time: light in the morning and the day, dark in the evening and the night

const FX_THEMES = Object.freeze(['aurora', 'daytime'])

/** @param {number} hour 0..23 local time @returns {'morning'|'day'|'evening'|'night'} */
function dayPhase(hour) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) return 'day'
    if (hour >= 6 && hour < 11) return 'morning'
    if (hour >= 11 && hour < 17) return 'day'
    if (hour >= 17 && hour < 22) return 'evening'
    return 'night'
}

/**
 * @param {string} theme the saved theme
 * @param {number} hour 0..23 local time
 * @returns {{ base: string, fx: string|null, phase: string|null }}
 */
function resolveTheme(theme, hour) {
    if (theme === 'aurora') return { base: 'embedded', fx: 'aurora', phase: null }
    if (theme === 'daytime') {
        const phase = dayPhase(hour)
        return { base: phase === 'morning' || phase === 'day' ? 'light' : 'embedded', fx: 'daytime', phase }
    }
    return { base: theme || 'embedded', fx: null, phase: null }
}

// Base themes a separate window knows how to paint (main/services/detached/detachedWindow.html)
const WINDOW_PALETTES = Object.freeze(['embedded', 'dock', 'light', 'adaptive', 'dark', 'midnight'])

/**
 * The whole look of a separate window (3.7.4): which palette, light or dark, and the effect with its time of day.
 * @param {string} theme the saved theme of the main window
 * @param {number} hour 0..23 local time
 * @returns {{ mode: 'light'|'dark', palette: string, fx: string|null, phase: string|null }}
 */
function windowLook(theme, hour) {
    const { base, fx, phase } = resolveTheme(theme, hour)
    const palette = WINDOW_PALETTES.includes(base) ? base : 'embedded'
    return { mode: palette === 'light' ? 'light' : 'dark', palette, fx, phase }
}

module.exports = { FX_THEMES, dayPhase, resolveTheme, windowLook }
