'use strict'
// In-app windows from the owner (announcements): what the app does with the list the server sends.
// Pure rules only; the drawing and the network are in announcements.js and main/services/announcements.js.

const THEMES = ['plain', 'newyear', 'sale']
const LOGO_STYLES = ['none', 'santa']
const ACTIONS = ['link', 'pricing']

/** An address the app may open or show: https only. */
function safeLink(value) {
    const s = typeof value === 'string' ? value.trim() : ''
    return /^https:\/\/\S+$/.test(s) && s.length <= 500 ? s : ''
}

function cleanButton(b) {
    if (!b || typeof b !== 'object' || typeof b.label !== 'string' || !b.label.trim()) return null
    const action = ACTIONS.includes(b.action) ? b.action : 'link'
    if (action === 'pricing') return { label: b.label.trim().slice(0, 40), action }
    const url = safeLink(b.url)
    return url ? { label: b.label.trim().slice(0, 40), action, url } : null
}

/** Whatever the server sent, reduced to windows the app can draw safely. */
function cleanItems(list) {
    const out = []
    for (const it of Array.isArray(list) ? list : []) {
        if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !it.id || typeof it.title !== 'string' || !it.title.trim()) continue
        out.push({
            id: it.id.slice(0, 40),
            version: typeof it.version === 'string' ? it.version : '',
            title: it.title.trim().slice(0, 120),
            body: typeof it.body === 'string' ? it.body.slice(0, 1500) : '',
            imageUrl: safeLink(it.imageUrl),
            button: cleanButton(it.button),
            promoCode: typeof it.promoCode === 'string' && /^[A-Z0-9_-]{2,32}$/.test(it.promoCode) ? it.promoCode : '',
            theme: THEMES.includes(it.theme) ? it.theme : 'plain',
            logoStyle: LOGO_STYLES.includes(it.logoStyle) ? it.logoStyle : 'none'
        })
    }
    return out
}

/** The first window the person has not closed yet (a changed window counts as a new one). */
function pickToShow(items, seen) {
    const known = seen && typeof seen === 'object' ? seen : {}
    return items.find((it) => known[it.id] !== it.version) || null
}

/** The remembered closes, with the windows that no longer exist forgotten (the list stays small). */
function markSeen(seen, item, items) {
    const next = { ...(seen && typeof seen === 'object' ? seen : {}), [item.id]: item.version }
    if (!Array.isArray(items)) return next
    const alive = new Set(items.map((it) => it.id))
    return Object.fromEntries(Object.entries(next).filter(([id]) => alive.has(id)))
}

/** The window whose style puts a hat on the logo, the newest of them (the server sends the newest first). */
function hatItem(items) {
    return items.find((it) => it.logoStyle === 'santa') || null
}

module.exports = { cleanItems, pickToShow, markSeen, hatItem, safeLink }
