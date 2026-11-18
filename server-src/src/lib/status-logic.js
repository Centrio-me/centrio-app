'use strict'
// Public status page (2026-11-19): what we check every minute, how a check turns into «works / slow / down», the
// 90-day bars and the uptime numbers. Pure functions: the file store, the timer and the requests are in
// status-store.js and cron/statusMonitor.js.

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const KEEP_DAYS = 90
const KEEP_RECENT = 60
const GAP_AFTER_MS = 150 * 1000 // the monitor did not run for this long: the server (or the monitor) was down
const MAX_GAP_MS = 7 * DAY
const SLOW_MS = 4000
const MOSCOW_MS = 3 * 60 * MINUTE

const COMPONENTS = [
    { id: 'site', name: 'Сайт', description: 'centrio.me: страницы, блог, личный кабинет', url: 'https://centrio.me/', okBelow: 400 },
    { id: 'api', name: 'Аккаунты и синхронизация', description: 'Вход, облако, оплата, уведомления приложения', url: 'https://api.centrio.me/health', okBelow: 400 },
    { id: 'downloads', name: 'Скачивание и обновления', description: 'Установщики и автообновление приложения', url: 'https://download.centrio.me/latest.yml', okBelow: 400 }
]

const dayKey = (at) => new Date(at + MOSCOW_MS).toISOString().slice(0, 10)

function emptyState() {
    return { lastRunAt: 0, days: {}, recent: {}, incidents: [] }
}

function bump(state, id, at, ok) {
    const day = dayKey(at)
    const days = (state.days[id] = state.days[id] || {})
    const d = (days[day] = days[day] || { ok: 0, total: 0 })
    d.total += 1
    if (ok) d.ok += 1
}

/** One answered (or not) check. */
function addCheck(state, id, { at, ok, ms }) {
    bump(state, id, at, ok)
    const list = (state.recent[id] = state.recent[id] || [])
    list.push({ at, ok: !!ok, ms: Math.max(0, Math.round(ms || 0)) })
    if (list.length > KEEP_RECENT) list.splice(0, list.length - KEEP_RECENT)
}

/** works / degraded (one or two failures, or slow) / outage (three failures in a row). */
function componentState(recent) {
    const list = recent || []
    if (!list.length) return 'unknown'
    const last3 = list.slice(-3)
    if (last3.length === 3 && last3.every((c) => !c.ok)) return 'outage'
    const last5 = list.slice(-5)
    const failed = last5.filter((c) => !c.ok).length
    if (!list[list.length - 1].ok || failed >= 2) return 'degraded'
    const avg = last3.reduce((s, c) => s + c.ms, 0) / last3.length
    return avg > SLOW_MS ? 'degraded' : 'operational'
}

const ORDER = { unknown: 0, operational: 0, degraded: 1, outage: 2 }
const overallState = (states) => states.reduce((worst, s) => (ORDER[s] > ORDER[worst] ? s : worst), 'operational')

/** The monitor was not running (the server was down): the missing minutes count as down, and one notice says so. */
function fillGap(state, now) {
    const gap = state.lastRunAt ? now - state.lastRunAt : 0
    if (gap <= GAP_AFTER_MS) return 0
    const from = state.lastRunAt
    const span = Math.min(gap, MAX_GAP_MS)
    const minutes = Math.floor(span / MINUTE)
    for (const c of COMPONENTS) {
        for (let i = 1; i <= minutes; i++) bump(state, c.id, now - span + i * MINUTE, false)
    }
    state.incidents.push({ id: `gap-${from}`, component: 'all', title: 'Сервисы были недоступны', status: 'resolved', startedAt: from, resolvedAt: now, auto: true })
    return minutes
}

/** Opens an incident when a component goes down and closes it when it is back. */
function trackIncident(state, id, newState, at) {
    const open = state.incidents.find((i) => i.component === id && i.status === 'open')
    if (newState === 'outage' && !open) {
        const name = (COMPONENTS.find((c) => c.id === id) || {}).name || id
        state.incidents.push({ id: `${id}-${at}`, component: id, title: `${name}: недоступно`, status: 'open', startedAt: at, resolvedAt: null, auto: true })
    } else if (newState === 'operational' && open) {
        open.status = 'resolved'
        open.resolvedAt = at
    }
}

function prune(state, now) {
    const oldest = dayKey(now - KEEP_DAYS * DAY)
    for (const id of Object.keys(state.days)) for (const day of Object.keys(state.days[id])) if (day < oldest) delete state.days[id][day]
    state.incidents = state.incidents.filter((i) => (i.resolvedAt || now) > now - KEEP_DAYS * DAY)
}

function uptimePercent(days, now, n) {
    let ok = 0, total = 0
    for (let i = 0; i < n; i++) {
        const d = (days || {})[dayKey(now - i * DAY)]
        if (d) { ok += d.ok; total += d.total }
    }
    return total ? Math.round((ok / total) * 10000) / 100 : null
}

/** The bars, oldest first: one per day with the share of good checks (null: no data that day). */
function dailySeries(days, now, n = KEEP_DAYS) {
    const out = []
    for (let i = n - 1; i >= 0; i--) {
        const date = dayKey(now - i * DAY)
        const d = (days || {})[date]
        out.push({ date, uptime: d && d.total ? Math.round((d.ok / d.total) * 10000) / 100 : null })
    }
    return out
}

module.exports = { COMPONENTS, MINUTE, DAY, GAP_AFTER_MS, dayKey, emptyState, addCheck, componentState, overallState, fillGap, trackIncident, prune, uptimePercent, dailySeries }
