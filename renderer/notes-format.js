'use strict'
// The text of a note keeps its formatting as plain marks, so older notes, the site and the phone read it as it is:
//   **bold**   *italic*   ++underline++   ~~strikethrough~~
// A mark pair counts when the first mark is followed by a word character and the last is preceded by one, on one line:
// «5 * 3 * 2» and «C++ and C++» stay plain text (Oleg, 2026-11-13: «нужно базовое форматирование текста заметки»).

const MARKS = { bold: '**', italic: '*', underline: '++', strike: '~~' }
const TAGS = { bold: 'b', italic: 'i', underline: 'u', strike: 's' }

// a mark pair on one line, with no space just inside it; italic must not be half of a bold pair
const PAIRS = [
    ['strike', /~~(?!\s)([^\n]+?)(?<!\s)~~/g],
    ['underline', /\+\+(?!\s)([^\n]+?)(?<!\s)\+\+/g],
    ['bold', /\*\*(?!\s)([^\n]+?)(?<!\s)\*\*(?!\*)/g],
    ['italic', /(?<![*\w])\*(?![\s*])([^\n*]+?)(?<![\s*])\*(?![*\w])/g]
]

function escapeHtml(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The text as safe HTML: only our own tags, everything typed is escaped. */
function toHtml(text) {
    let html = escapeHtml(text)
    for (const [kind, re] of PAIRS) html = html.replace(re, (_, inner) => `<${TAGS[kind]}>${inner}</${TAGS[kind]}>`)
    return html.replace(/\n/g, '<br>')
}

/** The words of a formatted text without the marks (for the list and the search of notes). */
function stripMarks(text) {
    let out = String(text)
    for (const [, re] of PAIRS) out = out.replace(re, (_, inner) => inner)
    return out
}

function isWrapped(text, start, end, kind) {
    const m = MARKS[kind]
    const before = text.slice(start - m.length, start)
    const after = text.slice(end, end + m.length)
    if (before !== m || after !== m) return false
    // a single star next to another star is bold, not italic
    if (kind === 'italic') return text[start - 2] !== '*' && text[end + 1] !== '*'
    return true
}

/**
 * Puts a mark around the selection, or takes it off when it is already there.
 * @returns {{ text: string, start: number, end: number }} the new text and the selection to put back
 */
function applyFormat(text, start, end, kind) {
    const m = MARKS[kind]
    if (!m) return { text, start, end }
    const from = Math.max(0, Math.min(start, end))
    const to = Math.min(text.length, Math.max(start, end))
    if (from === to) {
        const next = text.slice(0, from) + m + m + text.slice(to)
        return { text: next, start: from + m.length, end: from + m.length }
    }
    // the marks stand just outside the selection: take them off
    if (isWrapped(text, from, to, kind)) {
        const next = text.slice(0, from - m.length) + text.slice(from, to) + text.slice(to + m.length)
        return { text: next, start: from - m.length, end: to - m.length }
    }
    // the selection itself starts and ends with the mark: take them off
    const selected = text.slice(from, to)
    if (selected.length > m.length * 2 && selected.startsWith(m) && selected.endsWith(m) && !(kind === 'italic' && selected.startsWith('**'))) {
        const inner = selected.slice(m.length, selected.length - m.length)
        return { text: text.slice(0, from) + inner + text.slice(to), start: from, end: from + inner.length }
    }
    return { text: text.slice(0, from) + m + selected + m + text.slice(to), start: from + m.length, end: to + m.length }
}

/** A note as the text of a message: its title, then its words without marks, or the items of a list with their ticks. */
function noteToText(note) {
    if (!note) return ''
    const title = String(note.title || '').trim()
    let body = ''
    if (note.type === 'CHECKLIST') {
        const items = Array.isArray(note.items) ? note.items : []
        body = items.map((i) => `${i && i.done ? '☑' : '☐'} ${String((i && i.text) || '').trim()}`).filter((l) => l.length > 2).join('\n')
    } else {
        body = stripMarks(String(note.body || '')).trim()
    }
    return [title, body].filter(Boolean).join('\n\n')
}

module.exports = { applyFormat, toHtml, stripMarks, noteToText, MARKS }
