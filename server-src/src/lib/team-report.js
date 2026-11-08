// Daily summary, reports and expiry notices for teams (TEAM control, 2026-11-08).
// Reaction time = from a team messenger getting unread to it being read; we never see replies,
// so it is always called «время реакции».

function formatHM(minutes) {
    const total = Math.floor(minutes)
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function clock(timeZone, at) {
    return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at))
}

// people: [{ name, daily: OrgPresenceDaily | null, signInProblems }]
function buildDailySummary(orgName, day, timeZone, people) {
    const [, month, date] = day.split('-')
    const active = people.filter((p) => p.daily && p.daily.activeMin > 0).sort((a, b) => b.daily.activeMin - a.daily.activeMin)
    const absent = people.filter((p) => !(p.daily && p.daily.activeMin > 0))
    const lines = [`<b>Команда «${escapeHtml(orgName)}» за ${date}.${month}</b>`, '']
    for (const p of active) {
        const d = p.daily
        const reaction = d.reactionCount > 0 ? `${Math.round(d.reactionSecSum / d.reactionCount / 60)} мин` : '—'
        lines.push(`<b>${escapeHtml(p.name)}</b>: на работе ${formatHM(d.activeMin)}, с ${clock(timeZone, d.firstAt)} до ${clock(timeZone, d.lastAt)}`)
        lines.push(`время реакции: ${reaction}, ждали дольше нормы: ${d.overThreshold || 0}${p.signInProblems ? `, проблемы со входом: ${p.signInProblems}` : ''}`)
    }
    for (const p of absent) lines.push(`<b>${escapeHtml(p.name)}</b>: не выходил на связь`)
    return lines.join('\n')
}

function buildReportRows(members, dailies) {
    return members.map((m) => {
        const mine = dailies.filter((d) => d.userId === m.userId)
        const sum = (k) => mine.reduce((s, d) => s + (d[k] || 0), 0)
        const count = sum('reactionCount')
        return {
            userId: m.userId,
            name: m.name,
            activeMin: Math.round(sum('activeMin')),
            avgReactionSec: count > 0 ? Math.round(sum('reactionSecSum') / count) : null,
            overThreshold: sum('overThreshold'),
            days: mine.length
        }
    })
}

const NOTICE_DAYS = [7, 3, 1, 0]

// Which reminder is due now: 7, 3, 1 days before, or 0 on the last day; null when none.
function expiryNoticeDue(expiresAt, now, alreadySent) {
    const leftMs = new Date(expiresAt) - now
    if (leftMs <= 0) return null
    // the closest reminder whose moment has come: d days before (the last day = 12 hours before)
    const reached = NOTICE_DAYS.filter((d) => leftMs <= (d === 0 ? 12 : d * 24) * 3600000)
    if (reached.length === 0) return null
    const due = Math.min(...reached)
    return alreadySent.includes(due) ? null : due
}

function reactionUpdate(waitingSince, clearedAt, thresholdMinutes) {
    if (!waitingSince) return null
    const sec = Math.max(0, Math.round((clearedAt - new Date(waitingSince)) / 1000))
    return { reactionSecSum: sec, overThreshold: sec > thresholdMinutes * 60 ? 1 : 0 }
}

module.exports = { formatHM, buildDailySummary, buildReportRows, expiryNoticeDue, reactionUpdate }
