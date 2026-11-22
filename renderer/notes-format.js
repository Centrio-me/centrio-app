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

/** The text as the editor shows it: the formatting on the spot, and a place to type on an empty last line. */
function toEditorHtml(text) {
    const html = toHtml(text)
    return html.endsWith('<br>') ? html + '<br>' : html
}

// the editor (a field that shows the formatting while it is typed, 2026-11-22) gives the text back as our plain marks
const MARK_OF = { b: '**', strong: '**', i: '*', em: '*', u: '++', s: '~~', strike: '~~', del: '~~' }
const BLOCKS = new Set(['div', 'p', 'li'])
const NBSP = / /g
const NEW_LINE = '\n'

function isBreak(node) { return !!node && String(node.nodeName).toLowerCase() === 'br' }

function marksOfChildren(node) {
    let out = ''
    for (const child of Array.from(node.childNodes || [])) {
        if (child.nodeType === 3) { out += String(child.nodeValue || '').replace(NBSP, ' '); continue }
        if (child.nodeType !== 1) continue
        const name = String(child.nodeName).toLowerCase()
        if (name === 'br') { out += NEW_LINE; continue }
        let inner = marksOfChildren(child)
        if (BLOCKS.has(name)) {
            // a line the browser made of its own: it starts on a new line, and its last <br> only keeps an empty line open
            if (isBreak(child.lastChild) && inner.endsWith(NEW_LINE)) inner = inner.slice(0, -1)
            out += (out && !out.endsWith(NEW_LINE) ? NEW_LINE : '') + inner
            continue
        }
        const mark = MARK_OF[name]
        if (!mark) { out += inner; continue }
        // the spaces stay outside the pair: «** word **» would not read as bold
        const lead = /^\s*/.exec(inner)[0]
        const tail = inner.length > lead.length ? /\s*$/.exec(inner)[0] : ''
        const core = inner.slice(lead.length, inner.length - tail.length)
        out += core ? lead + mark + core + mark + tail : inner
    }
    return out
}

/** @param {{ childNodes: any[], lastChild?: any }} root the editor's element */
function marksFromNode(root) {
    const text = marksOfChildren(root)
    // the browser keeps one <br> at the end so that an empty last line can be typed in: it is not a line of its own
    return isBreak(root.lastChild) && text.endsWith(NEW_LINE) ? text.slice(0, -1) : text
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

/** A note as the text of a message: its title, then its words (with our marks or without), or the items of a list with their ticks. */
function noteText(note, keepMarks) {
    if (!note) return ''
    const title = String(note.title || '').trim()
    let body = ''
    if (note.type === 'CHECKLIST') {
        const items = Array.isArray(note.items) ? note.items : []
        body = items.map((i) => `${i && i.done ? '☑' : '☐'} ${String((i && i.text) || '').trim()}`).filter((l) => l.length > 2).join('\n')
    } else {
        body = (keepMarks ? String(note.body || '') : stripMarks(String(note.body || ''))).trim()
    }
    return [title, body].filter(Boolean).join('\n\n')
}

const noteToText = (note) => noteText(note, false)
/** The same with our marks kept: the chat is chosen later and marksForService() writes them the way that chat reads them. */
const noteToMarkedText = (note) => noteText(note, true)

// how each service reads formatting typed as marks (Oleg, 2026-11-17: «при пересылке заметки форматирование не сохраняется»);
// a service not listed, and a kind with no mark of its own (underline), gets the words alone
const SERVICE_MARKS = {
    telegram: { bold: ['**', '**'], italic: ['__', '__'], strike: ['~~', '~~'] },
    whatsapp: { bold: ['*', '*'], italic: ['_', '_'], strike: ['~', '~'] }
}
const OPEN = ''
const CLOSE = ''
const MARKER = new RegExp(`${OPEN}(/?)(\\w+)${CLOSE}`, 'g')

/** Our marks rewritten for the service that will receive the message. */
function marksForService(text, service) {
    const own = SERVICE_MARKS[service] || {}
    let out = String(text)
    // every pair is first replaced by a neutral marker, so that a mark written for the service is never read again as ours
    for (const [kind, re] of PAIRS) out = out.replace(re, (_, inner) => `${OPEN}${kind}${CLOSE}${inner}${OPEN}/${kind}${CLOSE}`)
    return out.replace(MARKER, (_, closing, kind) => {
        const marks = own[kind]
        return marks ? marks[closing ? 1 : 0] : ''
    })
}

module.exports = { applyFormat, toHtml, toEditorHtml, marksFromNode, stripMarks, noteToText, noteToMarkedText, marksForService, MARKS }
