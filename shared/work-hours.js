// Work hours (3.7.1). The same rules as the server's lib/team-schedule.js: a schedule is
// { days: [1..7] (1 = Monday), start: 'HH:MM', end: 'HH:MM' }; end <= start means the shift crosses midnight and its
// after-midnight part belongs to the day it started. Used for the team schedule (in the team's time zone) and for the
// person's own schedule (in the computer's time zone).
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/
const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
const MINUTE_MS = 60 * 1000
const WEEK_MINUTES = 7 * 24 * 60

const minutesOf = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
}

function normalizeSchedule(raw) {
    if (!raw || typeof raw !== 'object') return null
    const days = Array.isArray(raw.days) ? [...new Set(raw.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b) : []
    if (!days.length) return null
    if (!TIME_RE.test(String(raw.start)) || !TIME_RE.test(String(raw.end)) || raw.start === raw.end) return null
    return { days, start: raw.start, end: raw.end }
}

const formatters = new Map()
function formatterFor(timeZone) {
    const key = timeZone || ''
    if (!formatters.has(key)) {
        formatters.set(key, new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' }))
    }
    return formatters.get(key)
}

function localParts(timeZone, at) {
    const parts = formatterFor(timeZone).formatToParts(at)
    const get = (type) => parts.find((p) => p.type === type).value
    return { weekday: WEEKDAY[get('weekday')], minutes: Number(get('hour')) * 60 + Number(get('minute')) }
}

function isWithinWorkHours(schedule, at, timeZone) {
    const s = normalizeSchedule(schedule)
    if (!s) return true
    let parts
    try { parts = localParts(timeZone || undefined, at) } catch { parts = localParts(undefined, at) }
    const { weekday, minutes } = parts
    const start = minutesOf(s.start)
    const end = minutesOf(s.end)
    const works = (d) => s.days.includes(d)
    if (start < end) return works(weekday) && minutes >= start && minutes < end
    const previous = weekday === 1 ? 7 : weekday - 1
    return (works(weekday) && minutes >= start) || (works(previous) && minutes < end)
}

/** The next moment the schedule switches (work starts or ends), searched minute by minute within a week. */
function nextChange(schedule, at, timeZone) {
    const s = normalizeSchedule(schedule)
    if (!s) return null
    const startMs = Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS
    const now = isWithinWorkHours(s, at, timeZone)
    for (let i = 1; i <= WEEK_MINUTES; i++) {
        const probe = new Date(startMs + i * MINUTE_MS)
        if (isWithinWorkHours(s, probe, timeZone) !== now) return probe
    }
    return null
}

/**
 * Why a service is quiet right now: 'team' (a team messenger outside the team schedule), 'personal' (one of the person's
 * work services outside their own schedule), 'workTime' (one of their personal services during work hours) or null.
 */
function quietReason(messenger, { team, personal, now = new Date(), localTimeZone } = {}) {
    if (!messenger) return null
    if (messenger.orgAssigned && team && normalizeSchedule(team.schedule)) {
        if (!isWithinWorkHours(team.schedule, now, team.timeZone)) return 'team'
        return null
    }
    if (!personal || !personal.enabled) return null
    const has = (list) => Array.isArray(list) && list.includes(messenger.id)
    if (has(personal.workIds)) {
        if (!isWithinWorkHours(personal.schedule, now, localTimeZone)) return 'personal'
        return null
    }
    // a personal service (11.2026, asked by a customer): quiet during work hours, heard in the evening and on days off
    if (has(personal.personalIds) && isWithinWorkHours(personal.schedule, now, localTimeZone)) return 'workTime'
    return null
}

module.exports = { isWithinWorkHours, nextChange, normalizeSchedule, quietReason, TIME_RE }
