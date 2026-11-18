const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../src/lib/status-logic')
const { publicStatus } = require('../src/lib/status-store')

const NOW = Date.UTC(2026, 10, 19, 12, 0, 0)

function healthy() {
    const s = L.emptyState()
    for (const c of L.COMPONENTS) for (let i = 0; i < 5; i++) L.addCheck(s, c.id, { at: NOW - (5 - i) * 60000, ok: true, ms: 100 })
    s.lastRunAt = NOW
    return s
}

test('all services answering: the page says everything works, with 90 bars each', () => {
    const p = publicStatus(healthy(), [], NOW)
    assert.equal(p.overall, 'operational')
    assert.equal(p.components.length, L.COMPONENTS.length)
    assert.equal(p.components[0].days.length, 90)
    assert.equal(p.components[0].uptime30, 100)
    assert.equal(p.components[0].latencyMs, 100)
})

test('one service down makes the whole page red and lists the incident', () => {
    const s = healthy()
    for (let i = 0; i < 3; i++) L.addCheck(s, 'api', { at: NOW + i * 60000, ok: false, ms: 8000 })
    L.trackIncident(s, 'api', L.componentState(s.recent.api), NOW)
    const p = publicStatus(s, [], NOW + 180000)
    assert.equal(p.overall, 'outage')
    assert.equal(p.components.find((c) => c.id === 'api').state, 'outage')
    assert.equal(p.incidents.length, 1)
})

test('an open notice of the owner turns a quiet page into a warning, a closed one does not', () => {
    const open = [{ id: 'n1', title: 'Плановые работы с базой', status: 'investigating', createdAt: NOW - 1000 }]
    assert.equal(publicStatus(healthy(), open, NOW).overall, 'degraded')
    const closed = [{ id: 'n1', title: 'x', status: 'resolved', createdAt: NOW - 5000, resolvedAt: NOW - 1000 }]
    assert.equal(publicStatus(healthy(), closed, NOW).overall, 'operational')
})
