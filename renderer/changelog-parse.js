'use strict'
// «История изменений»: what the window does with the lists written in index.html. Pure rules only; the drawing is in
// changelog-window.js. A line is told by its first word («Новое», «Исправлено», «Улучшено»…), no extra writing is needed
// for a version: the highlights (the three big cards of a version) are optional and come from data-hl on the entry.

const KINDS = ['new', 'fix', 'change']
// (\b knows only latin letters: the label ends where a space, a colon or the end of the line follows)
const NEW_LABEL = /^(Новое|Новая|Новый|Добавлено|Добавлена|Добавлен)(?=[\s:]|$)\s*:?\s*/
const FIX_LABEL = /^(Исправлено|Исправлена|Исправлен)(?=[\s:]|$)\s*:?\s*/
const CHANGE_LABEL = /^(Улучшено|Улучшена|Изменено|Изменена|Обновлено|Обновлена)(?=[\s:]|$)\s*:?\s*/
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MAX_HIGHLIGHTS = 3

/** Coloured pictures are not drawn in this window: emoji and their joiners are taken out, arrows and letters stay. */
function stripEmoji(text) {
    return String(text || '')
        .replace(/[\p{Extended_Pictographic}‍︎️⃣]/gu, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim()
}

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

/** @returns {{ kind: 'new' | 'fix' | 'change', text: string }} the group of a line and the line without its label */
function classify(raw) {
    const line = stripEmoji(raw)
    for (const [kind, label] of [['new', NEW_LABEL], ['fix', FIX_LABEL], ['change', CHANGE_LABEL]]) {
        if (label.test(line)) return { kind, text: capital(line.replace(label, '').trim()) }
    }
    return { kind: 'change', text: line }
}

/** «icon|Title|Text; icon|Title|Text» → up to three cards. Anything that is not three parts is left out. */
function parseHighlights(source) {
    return String(source || '')
        .split(';')
        .map((part) => part.split('|').map((x) => x.trim()))
        .filter((p) => p.length === 3 && p[0] && p[1])
        .slice(0, MAX_HIGHLIGHTS)
        .map(([icon, title, text]) => ({ icon, title: stripEmoji(title), text: stripEmoji(text) }))
}

/** '2026-11-17' → '17 ноября 2026' (short: '17 ноя'); '' for anything else */
function formatDate(iso, { short = false } = {}) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''))
    if (!m) return ''
    const month = Number(m[2])
    if (month < 1 || month > 12) return ''
    const day = Number(m[3])
    return short ? `${day} ${MONTHS_SHORT[month - 1]}` : `${day} ${MONTHS[month - 1]} ${m[1]}`
}

/** «Бета 4» for the version the app is a beta of, '' otherwise */
function versionTag(version, appVersion) {
    const m = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/.exec(String(appVersion || ''))
    return m && m[1] === version ? `Бета ${m[2]}` : ''
}

function buildEntry({ version, date = '', hl = '', items = [] }) {
    const groups = []
    const counts = { new: 0, fix: 0, change: 0, all: 0 }
    const byKind = { new: [], fix: [], change: [] }
    for (const raw of items) {
        const line = classify(raw)
        if (!line.text) continue
        byKind[line.kind].push(line.text)
        counts[line.kind] += 1
        counts.all += 1
    }
    for (const kind of KINDS) if (byKind[kind].length) groups.push({ kind, items: byKind[kind] })
    return { version: String(version || '').replace(/^v/i, ''), date: String(date || ''), highlights: parseHighlights(hl), groups, counts }
}

module.exports = { classify, stripEmoji, parseHighlights, formatDate, versionTag, buildEntry, KINDS }
