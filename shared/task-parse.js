'use strict'
// Quick task text, Todoist style (3.7.2): the date and the priority are written right in the task text
// ("Отчёт завтра !1", "Созвон в пт", "ДР Ани 12 ноября", "Продлить домен через 3 дня") and taken out of it.
// Used by the global quick-task window, the task panel and the calendar. Dates are local calendar days 'YYYY-MM-DD',
// the format tasks already store in `dueDate`.

// Word edges that also work for Cyrillic (\b does not).
const START = '(?<=^|\\s)'
// A dot ends a word only when no digit follows: "3.7.2" (a version) and "12.50" (a price) are not dates.
const END = '(?=$|[\\s,;:!?]|\\.(?!\\d))'

const pad = (n) => String(n).padStart(2, '0')
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// Monday = 1 … Sunday = 7, like ISO weekdays
const WEEKDAYS = [
    [1, 'понедельник|пн|monday|mon'],
    [2, 'вторник|вт|tuesday|tue'],
    [3, 'среду|среда|ср|wednesday|wed'],
    [4, 'четверг|чт|thursday|thu'],
    [5, 'пятницу|пятница|пт|friday|fri'],
    [6, 'субботу|суббота|сб|saturday|sat'],
    [7, 'воскресенье|вс|sunday|sun'],
]
const MONTHS = [
    'янв(?:аря|арь)?', 'фев(?:раля|раль)?', 'мар(?:та|т)?', 'апр(?:еля|ель)?', 'ма[яй]', 'июн(?:я|ь)?',
    'июл(?:я|ь)?', 'авг(?:уста|уст)?', 'сен(?:тября|тябрь)?', 'окт(?:ября|ябрь)?', 'ноя(?:бря|брь)?', 'дек(?:абря|абрь)?',
]

function validDay(year, month, day) {
    const d = new Date(year, month, day)
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null
}

// A date without a year that already passed this year means next year.
function upcoming(today, month, day) {
    const thisYear = validDay(today.getFullYear(), month, day)
    if (!thisYear) return null
    return thisYear < today ? validDay(today.getFullYear() + 1, month, day) : thisYear
}

// Each rule: a pattern and how to turn its match into a day. The first rule that matches wins.
function dateRules(today) {
    const rules = [
        [`(?:послезавтра|day after tomorrow)`, () => addDays(today, 2)],
        [`(?:завтра|tomorrow)`, () => addDays(today, 1)],
        [`(?:сегодня|today)`, () => today],
        [`через\\s+(\\d{1,3})\\s+(?:день|дня|дней)`, (m) => addDays(today, Number(m[1]))],
        [`in\\s+(\\d{1,3})\\s+days?`, (m) => addDays(today, Number(m[1]))],
        [`через\\s+(\\d{1,2})\\s+(?:неделю|недели|недель)`, (m) => addDays(today, 7 * Number(m[1]))],
        [`через\\s+неделю|in\\s+a\\s+week|next\\s+week`, () => addDays(today, 7)],
        [`(\\d{1,2})\\.(\\d{1,2})\\.(\\d{4})`, (m) => validDay(Number(m[3]), Number(m[2]) - 1, Number(m[1]))],
        [`(\\d{1,2})\\.(\\d{1,2})`, (m) => upcoming(today, Number(m[2]) - 1, Number(m[1]))],
        ...MONTHS.map((name, month) => [`(\\d{1,2})\\s+${name}`, (m) => upcoming(today, month, Number(m[1]))]),
        ...WEEKDAYS.map(([iso, names]) => [`(?:(?:в|во|on)\\s+)?(?:${names})`, () => {
            const todayIso = ((today.getDay() + 6) % 7) + 1
            const ahead = ((iso - todayIso + 7) % 7) || 7
            return addDays(today, ahead)
        }]),
    ]
    return rules.map(([source, toDate]) => [new RegExp(`${START}${source}${END}`, 'i'), toDate])
}

const PRIORITY_RE = new RegExp(`${START}(?:!([123])|[pр]([123]))${END}`, 'i')
const PRIORITY_BY_LEVEL = { 1: 'high', 2: 'medium', 3: 'low' }

// spaces collapsed, and a lone punctuation mark left behind by a removed date ("отчёт 12.11." -> "отчёт") dropped
const tidy = (s) => s.replace(/\s{2,}/g, ' ').replace(/\s+[.,;:]+(?=\s|$)/g, '').trim()

/**
 * @param {string} input
 * @param {Date} [now]
 * @returns {{text: string, dueDate: string|null, priority: 'none'|'low'|'medium'|'high'}}
 */
function parseQuickTask(input, now = new Date()) {
    const original = tidy(String(input || ''))
    let text = original
    let priority = 'none'
    const p = PRIORITY_RE.exec(text)
    if (p) {
        priority = PRIORITY_BY_LEVEL[p[1] || p[2]]
        text = text.slice(0, p.index) + text.slice(p.index + p[0].length)
    }
    let dueDate = null
    const today = startOfDay(now)
    for (const [re, toDate] of dateRules(today)) {
        const m = re.exec(text)
        if (!m) continue
        const day = toDate(m)
        if (!day) continue
        dueDate = isoDate(day)
        text = text.slice(0, m.index) + text.slice(m.index + m[0].length)
        break
    }
    text = tidy(text)
    // "завтра" alone: keep the words as the task text rather than an empty task
    if (!text) text = original
    return { text, dueDate, priority }
}

// ── Agenda helpers for the calendar ───────────────────────────────
function tasksByDate(items) {
    const map = new Map()
    for (const t of items || []) {
        if (!t || !t.dueDate) continue
        const entry = map.get(t.dueDate) || { open: 0, done: 0 }
        if (t.done) entry.done++
        else entry.open++
        map.set(t.dueDate, entry)
    }
    return map
}

const dayTasks = (items, date) => (items || []).filter(t => t && t.dueDate === date)
const overdueTasks = (items, today) => (items || []).filter(t => t && !t.done && t.dueDate && t.dueDate < today)

module.exports = { parseQuickTask, isoDate, tasksByDate, dayTasks, overdueTasks }
