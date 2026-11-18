'use strict'
// Every minute: the services answer or they do not. The answers go to the status page (routes/status.js).
const cron = require('node-cron')
const L = require('../lib/status-logic')
const store = require('../lib/status-store')

const TIMEOUT_MS = 8000
let state = null
let running = false
let lastPruneAt = 0

async function probe(component) {
    const started = Date.now()
    try {
        const res = await fetch(component.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'user-agent': 'centrio-status-monitor' } })
        await res.arrayBuffer().catch(() => {})
        return { ok: res.status < component.okBelow, ms: Date.now() - started }
    } catch {
        return { ok: false, ms: Date.now() - started }
    }
}

async function runChecks(now = Date.now()) {
    if (running) return
    running = true
    try {
        if (!state) state = store.loadState()
        L.fillGap(state, now)
        const results = await Promise.all(L.COMPONENTS.map((c) => probe(c).then((r) => [c.id, r])))
        for (const [id, r] of results) {
            L.addCheck(state, id, { at: now, ok: r.ok, ms: r.ms })
            L.trackIncident(state, id, L.componentState(state.recent[id]), now)
        }
        state.lastRunAt = now
        if (now - lastPruneAt > 60 * 60 * 1000) { L.prune(state, now); lastPruneAt = now }
        store.saveState(state)
    } catch (e) {
        console.error('[status] check failed:', e.message)
    } finally {
        running = false
    }
}

function getState() {
    if (!state) state = store.loadState()
    return state
}

function startStatusMonitorCron() {
    cron.schedule('* * * * *', () => { runChecks().catch((e) => console.error('[status]', e.message)) })
    runChecks().catch(() => {})
    console.log('[status] monitor scheduled (every minute)')
}

module.exports = { startStatusMonitorCron, runChecks, getState }
