'use strict'
// A team's look in the program: the theme every employee gets and the name shown instead of «Centrio» (with the team's logo).
// The same file runs in the app and on the server, so what the owner types is cleaned the same way everywhere (people type
// long names, abbreviations with quotes and dots, emoji, stray spaces, invisible characters and even markup).

// how many visible characters a name may have (a letter, a digit or a whole emoji counts as one)
const BRAND_NAME_MAX = 24

// the themes of the program that an owner can give to everyone
const THEMES = Object.freeze(['embedded', 'dock', 'light', 'adaptive', 'aurora', 'daytime'])

// invisible characters that change nothing a person sees or turn the line around (the joiner of emoji, 200D, is kept)
const INVISIBLE = /[­​‌‎‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]/g
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const ANGLES = /[<>]/g

const segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('ru', { granularity: 'grapheme' }) : null
const visibleChars = (text) => (segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text))

/** What may be shown as the team's name: tidy, at most BRAND_NAME_MAX visible characters, '' when there is nothing to show. */
function cleanBrandName(raw) {
    if (typeof raw !== 'string') return ''
    const tidy = raw
        .normalize('NFC')
        .replace(/[\s\u00A0\u2028\u2029]+/g, ' ')
        .replace(CONTROL, '')
        .replace(INVISIBLE, '')
        .replace(ANGLES, '')
        .replace(/ {2,}/g, ' ')
        .trim()
    if (!tidy) return ''
    const chars = visibleChars(tidy)
    const cut = chars.length > BRAND_NAME_MAX ? chars.slice(0, BRAND_NAME_MAX).join('') : tidy
    // never a joiner or a space left hanging at the end of a cut name
    return cut.replace(/[‍\s]+$/u, '')
}

/** The settings of a team as they may be stored: a known theme and a clean name; null when there is neither. */
function cleanOrgSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return null
    const out = {}
    if (typeof settings.theme === 'string' && THEMES.includes(settings.theme)) out.theme = settings.theme
    const name = cleanBrandName(settings.brandName)
    if (name) out.brandName = name
    return Object.keys(out).length ? out : null
}

module.exports = { cleanBrandName, cleanOrgSettings, BRAND_NAME_MAX, THEMES }
