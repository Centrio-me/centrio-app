// Team work hours (TEAM control, 2026-11-08). One schedule per team, judged in the team's time zone.
// A schedule is { days: [1..7] (1 = Monday), start: 'HH:MM', end: 'HH:MM' }; end <= start means the
// shift crosses midnight and its after-midnight part belongs to the day it started.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

function minutesOf(hhmm) {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
}

function localParts(timeZone, at) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', weekday: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(at)
    const get = (type) => parts.find((p) => p.type === type).value
    return {
        weekday: WEEKDAY[get('weekday')],
        year: Number(get('year')), month: Number(get('month')), day: Number(get('day')),
        minutes: Number(get('hour')) * 60 + Number(get('minute')),
        second: Number(get('second'))
    }
}

function isWithinWorkHours(schedule, timeZone, at) {
    if (!schedule) return true
    const { weekday, minutes } = localParts(timeZone, at)
    const start = minutesOf(schedule.start)
    const end = minutesOf(schedule.end)
    const works = (d) => schedule.days.includes(d)
    if (start < end) return works(weekday) && minutes >= start && minutes < end
    const previous = weekday === 1 ? 7 : weekday - 1
    return (works(weekday) && minutes >= start) || (works(previous) && minutes < end)
}

function localDay(timeZone, at) {
    const p = localParts(timeZone, at)
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// Offset of the zone at an instant, in ms (local wall clock minus UTC).
function zoneOffsetMs(timeZone, at) {
    const p = localParts(timeZone, at)
    const wall = Date.UTC(p.year, p.month - 1, p.day, Math.floor(p.minutes / 60), p.minutes % 60, p.second)
    return wall - Math.floor(at.getTime() / 1000) * 1000
}

function instantOfLocal(timeZone, year, month, day, minutes) {
    const guess = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60)
    const first = guess - zoneOffsetMs(timeZone, new Date(guess))
    return new Date(guess - zoneOffsetMs(timeZone, new Date(first)))
}

function shiftEndAt(schedule, timeZone, day) {
    const [year, month, date] = day.split('-').map(Number)
    const end = minutesOf(schedule.end)
    const crossesMidnight = end <= minutesOf(schedule.start)
    const endDay = new Date(Date.UTC(year, month - 1, date + (crossesMidnight ? 1 : 0)))
    return instantOfLocal(timeZone, endDay.getUTCFullYear(), endDay.getUTCMonth() + 1, endDay.getUTCDate(), end)
}

function isValidTimeZone(zone) {
    if (typeof zone !== 'string' || !zone) return false
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone })
        return true
    } catch {
        return false
    }
}

// Validates PATCH /:orgId/schedule. Returns { timeZone, workSchedule } or { error }.
function parseSchedule(body) {
    const timeZone = body?.timeZone
    if (!isValidTimeZone(timeZone)) return { error: 'Неизвестный часовой пояс' }
    const raw = body?.workSchedule
    if (raw === null || raw === undefined) return { timeZone, workSchedule: null }
    const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number))].sort((a, b) => a - b) : []
    if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) {
        return { error: 'Выберите рабочие дни' }
    }
    if (!TIME_RE.test(String(raw.start)) || !TIME_RE.test(String(raw.end)) || raw.start === raw.end) {
        return { error: 'Укажите начало и конец рабочего дня' }
    }
    return { timeZone, workSchedule: { days, start: raw.start, end: raw.end } }
}

// The team's work hours already live in the alert settings (Оповещения → Рабочее время,
// normalized by lib/org-alerts.js), so presence, reports and the app read them from there.
function teamScheduleOf(alertSettings) {
    const timeZone = isValidTimeZone(alertSettings?.timezone) ? alertSettings.timezone : 'Europe/Moscow'
    const wh = alertSettings?.workHours
    if (!wh || !wh.enabled || !Array.isArray(wh.days) || wh.days.length === 0) return { schedule: null, timeZone }
    return { schedule: { days: [...wh.days], start: wh.from, end: wh.to }, timeZone }
}

module.exports = { isWithinWorkHours, localDay, shiftEndAt, parseSchedule, isValidTimeZone, teamScheduleOf }
