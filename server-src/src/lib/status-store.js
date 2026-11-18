'use strict'
// File store of the status monitor and the public answer made of it. The state is one small JSON file (90 days of
// daily counts per service, the last checks, the incidents); the owner's own notices are in status-notices.json.
const fs = require('fs')
const path = require('path')
const L = require('./status-logic')

const DIR = process.env.STATUS_DATA_DIR || path.join(__dirname, '..', '..', 'data')
const STATE_FILE = path.join(DIR, 'status-state.json')
const NOTICES_FILE = path.join(DIR, 'status-notices.json')

function loadState() {
    try {
        const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
        return { ...L.emptyState(), ...s }
    } catch {
        return L.emptyState()
    }
}

function saveState(state) {
    const tmp = `${STATE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(state))
    fs.renameSync(tmp, STATE_FILE)
}

// [{ id, title, body, status: 'investigating' | 'identified' | 'monitoring' | 'resolved' | 'maintenance', createdAt, resolvedAt? }]
function loadNotices() {
    try {
        const list = JSON.parse(fs.readFileSync(NOTICES_FILE, 'utf8'))
        return Array.isArray(list) ? list : []
    } catch {
        return []
    }
}

function average(list) {
    const ok = (list || []).filter((c) => c.ok).slice(-10)
    return ok.length ? Math.round(ok.reduce((s, c) => s + c.ms, 0) / ok.length) : null
}

/** What the page shows. */
function publicStatus(state, notices, now = Date.now()) {
    const components = L.COMPONENTS.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        state: L.componentState(state.recent[c.id]),
        uptime30: L.uptimePercent(state.days[c.id], now, 30),
        uptime90: L.uptimePercent(state.days[c.id], now, 90),
        latencyMs: average(state.recent[c.id]),
        days: L.dailySeries(state.days[c.id], now)
    }))
    const hasOpenNotice = notices.some((n) => n.status !== 'resolved' && n.status !== 'maintenance')
    let overall = L.overallState(components.map((c) => c.state))
    if (overall === 'operational' && hasOpenNotice) overall = 'degraded'
    const since = now - 30 * L.DAY
    const incidents = state.incidents.filter((i) => (i.resolvedAt || now) > since).sort((a, b) => b.startedAt - a.startedAt).slice(0, 30)
    const recentNotices = notices.filter((n) => (n.resolvedAt || now) > since || n.status !== 'resolved').sort((a, b) => b.createdAt - a.createdAt).slice(0, 20)
    return { overall, updatedAt: state.lastRunAt || null, components, incidents, notices: recentNotices }
}

module.exports = { loadState, saveState, loadNotices, publicStatus }
