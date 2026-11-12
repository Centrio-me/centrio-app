// Whether an own message can still be edited (3.8.3, owner 2026-11-12: «Изменить» showed on old messages and did
// nothing). Telegram allows 48 hours, MAX 7 days (its own setting edit-timeout). Telegram gives the exact time of a
// message; MAX gives only «14:30» under a day mark («Сегодня», «Вчера», «3 сентября»), so the time is put together.
const { parseListTime } = require('../../shared/inbox-time')

const TODAY = /^(сегодня|today)$/i

/** @returns {number} ms, or 0 when the time cannot be told */
function messageTime(m, dayLabel, now = Date.now()) {
    if (m && Number(m.at) > 0) return Number(m.at)
    const clock = String((m && m.time) || '').match(/(\d{1,2}):(\d{2})/)
    if (!clock) return 0
    const label = String(dayLabel || '').trim()
    let day
    if (!label || TODAY.test(label)) day = new Date(now)
    else {
        const parsed = parseListTime(label, now)
        if (!parsed) return 0
        day = new Date(parsed)
    }
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number(clock[1]), Number(clock[2])).getTime()
}

function canEditNow(m, dayLabel, windowMs, now = Date.now()) {
    const at = messageTime(m, dayLabel, now)
    return at > 0 && now - at <= windowMs
}

module.exports = { messageTime, canEditNow }
