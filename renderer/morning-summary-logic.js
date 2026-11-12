// Morning summary (3.7.1, wider in 3.8.2): what came in while the person was away, built on the computer from the unread
// counters and the notification centre: who wrote, how many times and the latest message of each. Nothing here leaves
// the computer; only «Чего хотят клиенты» (PRO, on the person's click) sends the messages to the AI.
//
// A notice is stored titled «<service>: <sender>» (app-notif-bind.js), or by the service alone when the page only counts
// messages. The service name is never a sender (a customer, 2026-11-11: «телеграм рабочий: --телеграм рабочий. петр -
// привет»); a notice titled by the service alone may still carry «Имя: текст» in its text.
const MAX_SENDERS = 6
const MAX_SNIPPET = 140
const MAX_NAME = 48
const MAX_MESSAGES = 60
const FIRST_HOUR = 5
const LAST_HOUR = 13

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim()
const shorten = (text, max) => (text.length > max ? text.slice(0, max).trimEnd() + '…' : text)

/** { name, text } of a notice, or null when it names nobody (a counter, an empty title). */
function senderOf(notice, serviceName) {
    const service = oneLine(serviceName)
    let title = oneLine(notice.title)
    const prefix = `${service}: `
    if (service && title.startsWith(prefix)) title = title.slice(prefix.length).trim()
    let text = oneLine(notice.body)
    if (!title || title === service) {
        if (notice.kind === 'count') return null
        const m = text.match(/^([^:]{1,48}):\s+(.+)$/)
        if (!m) return null
        title = m[1].trim()
        text = m[2].trim()
    }
    return { name: shorten(title, MAX_NAME), text }
}

function buildMorningSummary({ messengers = [], unread = {}, notifications = [], since = 0, openTodos = 0 }) {
    const byService = new Map()
    for (const m of messengers) byService.set(m.id, { id: m.id, name: m.name, unread: Math.max(0, Number(unread[m.id]) || 0), senders: new Map() })

    const fresh = notifications
        .map((n) => ({ n, at: Date.parse(n.createdAt || '') }))
        .filter(({ n, at }) => Number.isFinite(at) && at >= since && byService.has(n.messengerId))
        .sort((a, b) => a.at - b.at)

    const messages = []
    for (const { n, at } of fresh) {
        const service = byService.get(n.messengerId)
        const who = senderOf(n, service.name)
        if (!who) continue
        const known = service.senders.get(who.name) || { name: who.name, count: 0, last: '', at: 0 }
        service.senders.set(who.name, { ...known, count: known.count + 1, last: who.text ? shorten(who.text, MAX_SNIPPET) : known.last, at })
        if (who.text) messages.push({ service: service.name, sender: who.name, text: who.text, at })
    }

    const services = [...byService.values()]
        .map((s) => {
            const senders = [...s.senders.values()]
                .sort((a, b) => b.count - a.count || b.at - a.at)
                .map(({ name, count, last }) => ({ name, count, last }))
            return { id: s.id, name: s.name, unread: s.unread, senders: senders.slice(0, MAX_SENDERS), moreSenders: Math.max(0, senders.length - MAX_SENDERS) }
        })
        .filter((s) => s.unread > 0 || s.senders.length > 0)
        .sort((a, b) => b.unread - a.unread || b.senders.length - a.senders.length)

    const totalUnread = services.reduce((sum, s) => sum + s.unread, 0)
    const todos = Math.max(0, Number(openTodos) || 0)
    return {
        services,
        totalUnread,
        openTodos: todos,
        messages: messages.slice(-MAX_MESSAGES).map(({ service, sender, text }) => ({ service, sender, text })),
        isEmpty: services.length === 0 && todos === 0
    }
}

/** Once a day, between 5:00 and 13:00, after the work day started (if a schedule is set), while the person is here. */
function shouldShowMorningSummary({ enabled, lastDay, today, hour, workStarted, userActive }) {
    if (!enabled || lastDay === today) return false
    if (hour < FIRST_HOUR || hour >= LAST_HOUR) return false
    return !!workStarted && !!userActive
}

module.exports = { buildMorningSummary, shouldShowMorningSummary, senderOf }
