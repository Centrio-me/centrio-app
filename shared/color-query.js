'use strict'
// "#5aa9ff", "5af", "rgb(90, 169, 255)", "hsl(210 100% 68%)": a colour written one way, shown all ways, with a swatch.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const hex2 = (n) => Math.round(n).toString(16).padStart(2, '0')

function rgbToHsl(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    const d = max - min
    if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
    const s = d / (1 - Math.abs(2 * l - 1))
    let h
    if (max === rn) h = ((gn - bn) / d) % 6
    else if (max === gn) h = (bn - rn) / d + 2
    else h = (rn - gn) / d + 4
    return { h: Math.round((h * 60 + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToRgb(h, s, l) {
    const sn = s / 100, ln = l / 100
    const c = (1 - Math.abs(2 * ln - 1)) * sn
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = ln - c / 2
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) }
}

/** @returns {{ r: number, g: number, b: number } | null} */
function parseColor(text) {
    const s = String(text || '').trim().toLowerCase()
    if (!s || s.length > 40) return null
    let m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
    // a bare word of letters and digits only counts as a colour when it has the # (or is six digits), so "bad" or "face" stay a search
    if (m && !s.startsWith('#') && m[1].length !== 6) m = null
    if (m && !s.startsWith('#') && !/\d/.test(m[1]) && !/[a-f]/.test(m[1])) m = null
    if (m) {
        const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1].slice(0, 6)
        return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
    }
    m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(s)
    if (m) {
        const [r, g, b] = [m[1], m[2], m[3]].map(Number)
        return r > 255 || g > 255 || b > 255 ? null : { r, g, b }
    }
    m = /^hsla?\(\s*(\d{1,3})(?:deg)?[\s,]+(\d{1,3})%?[\s,]+(\d{1,3})%?(?:[\s,/]+[\d.]+%?)?\s*\)$/.exec(s)
    if (m) {
        const h = Number(m[1]) % 360
        const sat = clamp(Number(m[2]), 0, 100)
        const lig = clamp(Number(m[3]), 0, 100)
        return hslToRgb(h, sat, lig)
    }
    return null
}

/** The colour in the ways it is written: { hex, rgb, hsl } */
function formatColor({ r, g, b }) {
    const hsl = rgbToHsl(r, g, b)
    return { hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase(), rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)` }
}

module.exports = { parseColor, formatColor }
