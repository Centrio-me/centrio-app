'use strict'
// Bold, italic, strikethrough and underline in the «Все мессенджеры» field (owner 2026-11-13). The field keeps one set of
// marks; on sending they become what the messenger itself understands: Telegram reads its markdown, WhatsApp its single
// marks; underline has no mark in either and goes as plain words, as does everything in a messenger with no marks.

const FORMATS = Object.freeze({
    bold: '**',
    italic: '__',
    strike: '~~',
    underline: '++'
})

const BY_SERVICE = {
    telegram: { '**': '**', '__': '__', '~~': '~~', '++': '' },
    whatsapp: { '**': '*', '__': '_', '~~': '~', '++': '' }
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// a mark counts only around words: «2 ** 3» is arithmetic, not bold
const markRe = (mark) => new RegExp(`${escape(mark)}(?=\\S)([\\s\\S]*?\\S)${escape(mark)}`, 'g')

/** the field's text in the marks of a messenger */
function toMessenger(text, service) {
    const map = BY_SERVICE[service] || {}
    let out = String(text || '')
    for (const mark of Object.values(FORMATS)) {
        const to = map[mark] || ''
        out = out.replace(markRe(mark), (_, inner) => `${to}${inner}${to}`)
    }
    return out
}

/**
 * The text cut into runs with their marks: Telegram and MAX are typed run by run, each mark turned on and off with the
 * messenger's own key (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+Shift+X) — real formatting, underline included.
 * @returns {{ text: string, marks: string[] }[]}
 */
function runsOf(text) {
    const src = String(text || '')
    // where each mark opens and closes: [index] -> { name, len, open }
    const at = new Map()
    for (const [name, mark] of Object.entries(FORMATS)) {
        for (const m of src.matchAll(markRe(mark))) {
            const open = m.index
            const close = m.index + m[0].length - mark.length
            if (at.has(open) || at.has(close)) continue
            at.set(open, { name, len: mark.length, open: true })
            at.set(close, { name, len: mark.length, open: false })
        }
    }
    const order = Object.keys(FORMATS)
    const runs = []
    const active = new Set()
    let buf = ''
    const flush = () => { if (buf) runs.push({ text: buf, marks: order.filter((n) => active.has(n)) }); buf = '' }
    for (let i = 0; i < src.length;) {
        const tok = at.get(i)
        if (tok) { flush(); if (tok.open) active.add(tok.name); else active.delete(tok.name); i += tok.len; continue }
        buf += src[i++]
    }
    flush()
    return runs
}

/**
 * Wraps the selection in a mark, or takes the mark off a selection that has it.
 * @returns {{ text: string, start: number, end: number }} the new text and selection
 */
function wrapSelection(text, start, end, mark) {
    const before = text.slice(0, start)
    const inner = text.slice(start, end)
    const after = text.slice(end)
    if (before.endsWith(mark) && after.startsWith(mark)) {
        return { text: before.slice(0, -mark.length) + inner + after.slice(mark.length), start: start - mark.length, end: end - mark.length }
    }
    return { text: before + mark + inner + mark + after, start: start + mark.length, end: end + mark.length }
}

// WhatsApp's marks (*bold* _italic_ ~strike~) as ours; a mark counts only around words, at a word's edge
const WA_MARKS = [['*', FORMATS.bold], ['_', FORMATS.italic], ['~', FORMATS.strike]]
function fromWhatsApp(text) {
    let out = String(text || '')
    for (const [wa, ours] of WA_MARKS) {
        const m = escape(wa)
        const re = new RegExp('(^|[\\s(«"\'])' + m + '(?=\\S)([^' + m + '\\n]*?\\S)' + m + '(?=$|[\\s.,!?:;)»"\'])', 'g')
        out = out.replace(re, (_, pre, inner) => `${pre}${ours}${inner}${ours}`)
    }
    return out
}

/** a marked text is shown only if its words are exactly the plain text's (else the plain text is shown) */
function markedFor(marked, plain) {
    if (typeof marked !== 'string' || !marked) return ''
    const runs = runsOf(marked)
    if (!runs.some((r) => r.marks.length)) return ''
    return runs.map((r) => r.text).join('') === plain ? marked : ''
}

module.exports = { FORMATS, toMessenger, wrapSelection, runsOf, fromWhatsApp, markedFor }
