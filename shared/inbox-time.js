'use strict'
// «Все мессенджеры» (3.8): the time of the last message as each messenger shows it in its chat list («16:05»,
// «Вчера», «Пн», «8 нояб.», «10.11.2026»), turned into one sortable timestamp. 0 means «unknown» and sorts last.

const DAY_MS = 24 * 60 * 60 * 1000
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'ма', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
// Monday = 0 … Sunday = 6, short and long forms
const WEEKDAYS = [['пн', 'понедельник'], ['вт', 'вторник'], ['ср', 'среда'], ['чт', 'четверг'], ['пт', 'пятница'], ['сб', 'суббота'], ['вс', 'воскресенье']]

function startOfDay(ms) {
    const d = new Date(ms)
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function monthIndex(word) {
    const w = word.toLowerCase().replace(/\.$/, '')
    if (w.startsWith('мая') || w === 'май' || w === 'ма') return 4
    for (let i = 0; i < MONTHS.length; i++) if (i !== 4 && w.startsWith(MONTHS[i])) return i
    return -1
}

function fullYear(y) {
    const n = Number(y)
    return n < 100 ? 2000 + n : n
}

/**
 * @param {string|null|undefined} label the time as the chat list shows it
 * @param {number} now ms
 * @returns {number} ms, or 0 when it is not a time
 */
function parseListTime(label, now) {
    const s = String(label || '').trim().toLowerCase()
    if (!s) return 0
    const today = startOfDay(now)
    const nowDate = new Date(now)

    let m = s.match(/^(\d{1,2}):(\d{2})$/)
    if (m) {
        const t = today + (Number(m[1]) * 60 + Number(m[2])) * 60000
        return t > now + 5 * 60000 ? t - DAY_MS : t
    }
    if (s === 'вчера' || s === 'yesterday') return today - DAY_MS

    const dayIndex = WEEKDAYS.findIndex((names) => names.includes(s.replace(/\.$/, '')))
    if (dayIndex >= 0) {
        const todayIndex = (nowDate.getDay() + 6) % 7
        let back = (todayIndex - dayIndex + 7) % 7
        if (back === 0) back = 7
        return today - back * DAY_MS
    }

    m = s.match(/^(\d{1,2})\s+([а-яё]+)\.?(?:\s+(\d{2,4}))?/)
    if (m) {
        const month = monthIndex(m[2])
        if (month >= 0) {
            const year = m[3] ? fullYear(m[3]) : nowDate.getFullYear()
            let t = new Date(year, month, Number(m[1])).getTime()
            if (!m[3] && t > now) t = new Date(year - 1, month, Number(m[1])).getTime()
            return t
        }
    }

    m = s.match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?$/)
    if (m) {
        const year = m[3] ? fullYear(m[3]) : nowDate.getFullYear()
        let t = new Date(year, Number(m[2]) - 1, Number(m[1])).getTime()
        if (!m[3] && t > now) t = new Date(year - 1, Number(m[2]) - 1, Number(m[1])).getTime()
        return t
    }
    return 0
}

module.exports = { parseListTime }
