// Morning summary (3.7.1): what came in while the person was away, built on the computer from the unread counters and
// the notification centre. Only who wrote and how many times; message text never goes into the summary.
const MAX_SENDERS = 5
const FIRST_HOUR = 5
const LAST_HOUR = 13

function buildMorningSummary({ messengers = [], unread = {}, notifications = [], since = 0, openTodos = 0 }) {
    const byService = new Map()
    for (const m of messengers) byService.set(m.id, { id: m.id, name: m.name, unread: Math.max(0, Number(unread[m.id]) || 0), senders: new Map() })

    for (const n of notifications) {
        const at = Date.parse(n.createdAt || '')
        if (!Number.isFinite(at) || at < since) continue
        const service = byService.get(n.messengerId)
        const who = String(n.title || '').trim()
        if (!service || !who) continue
        service.senders.set(who, (service.senders.get(who) || 0) + 1)
    }

    const services = [...byService.values()]
        .map((s) => {
            const senders = [...s.senders.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
            return { id: s.id, name: s.name, unread: s.unread, senders: senders.slice(0, MAX_SENDERS), moreSenders: Math.max(0, senders.length - MAX_SENDERS) }
        })
        .filter((s) => s.unread > 0 || s.senders.length > 0)
        .sort((a, b) => b.unread - a.unread || b.senders.length - a.senders.length)

    const totalUnread = services.reduce((sum, s) => sum + s.unread, 0)
    const todos = Math.max(0, Number(openTodos) || 0)
    return { services, totalUnread, openTodos: todos, isEmpty: services.length === 0 && todos === 0 }
}

/** Once a day, between 5:00 and 13:00, after the work day started (if a schedule is set), while the person is here. */
function shouldShowMorningSummary({ enabled, lastDay, today, hour, workStarted, userActive }) {
    if (!enabled || lastDay === today) return false
    if (hour < FIRST_HOUR || hour >= LAST_HOUR) return false
    return !!workStarted && !!userActive
}

module.exports = { buildMorningSummary, shouldShowMorningSummary }
