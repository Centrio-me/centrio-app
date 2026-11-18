const test = require('node:test')
const assert = require('node:assert/strict')
const L = require('../src/lib/status-logic')

const T0 = Date.UTC(2026, 10, 19, 12, 0, 0)
const ok = (at, ms = 120) => ({ at, ok: true, ms })
const bad = (at) => ({ at, ok: false, ms: 8000 })

test('a component with good checks works, with one failure it is degraded, with three in a row it is down', () => {
    const s = L.emptyState()
    for (let i = 0; i < 5; i++) L.addCheck(s, 'site', ok(T0 + i * 60000))
    assert.equal(L.componentState(s.recent.site), 'operational')
    L.addCheck(s, 'site', bad(T0 + 5 * 60000))
    assert.equal(L.componentState(s.recent.site), 'degraded')
    L.addCheck(s, 'site', bad(T0 + 6 * 60000))
    L.addCheck(s, 'site', bad(T0 + 7 * 60000))
    assert.equal(L.componentState(s.recent.site), 'outage')
})

test('slow answers make a component degraded, no checks mean unknown', () => {
    const s = L.emptyState()
    assert.equal(L.componentState(s.recent.site), 'unknown')
    for (let i = 0; i < 3; i++) L.addCheck(s, 'api', ok(T0 + i * 60000, 6000))
    assert.equal(L.componentState(s.recent.api), 'degraded')
})

test('the worst component decides the overall state', () => {
    assert.equal(L.overallState(['operational', 'operational']), 'operational')
    assert.equal(L.overallState(['operational', 'degraded']), 'degraded')
    assert.equal(L.overallState(['degraded', 'outage', 'operational']), 'outage')
    assert.equal(L.overallState([]), 'operational')
})

test('an incident opens when a component goes down and closes when it is back', () => {
    const s = L.emptyState()
    L.trackIncident(s, 'api', 'outage', T0)
    L.trackIncident(s, 'api', 'outage', T0 + 60000)
    assert.equal(s.incidents.length, 1)
    assert.equal(s.incidents[0].status, 'open')
    L.trackIncident(s, 'api', 'degraded', T0 + 120000)
    assert.equal(s.incidents[0].status, 'open')
    L.trackIncident(s, 'api', 'operational', T0 + 180000)
    assert.equal(s.incidents[0].status, 'resolved')
    assert.equal(s.incidents[0].resolvedAt, T0 + 180000)
})

test('a long silence of the monitor counts as downtime and leaves a notice', () => {
    const s = L.emptyState()
    s.lastRunAt = T0
    for (const c of L.COMPONENTS) L.addCheck(s, c.id, ok(T0))
    const minutes = L.fillGap(s, T0 + 30 * 60000)
    assert.equal(minutes, 30)
    const day = L.dayKey(T0)
    assert.equal(s.days.site[day].total, 31)
    assert.equal(s.days.site[day].ok, 1)
    assert.equal(s.incidents.length, 1)
    assert.equal(s.incidents[0].component, 'all')
    s.lastRunAt = T0 + 30 * 60000 // the monitor notes its run, so the next minute is no gap
    assert.equal(L.fillGap(s, T0 + 31 * 60000), 0)
})

test('the first run and a normal minute do not make a gap', () => {
    const s = L.emptyState()
    assert.equal(L.fillGap(s, T0), 0)
    s.lastRunAt = T0
    assert.equal(L.fillGap(s, T0 + 61000), 0)
    assert.equal(s.incidents.length, 0)
})

test('uptime is the share of good checks over the days asked, rounded to two places', () => {
    const s = L.emptyState()
    for (let i = 0; i < 99; i++) L.addCheck(s, 'site', ok(T0 + i * 1000))
    L.addCheck(s, 'site', bad(T0 + 100000))
    assert.equal(L.uptimePercent(s.days.site, T0 + 200000, 30), 99)
    assert.equal(L.uptimePercent({}, T0, 30), null)
})

test('the daily bars are 90, oldest first, with null where there is no data', () => {
    const s = L.emptyState()
    L.addCheck(s, 'site', ok(T0))
    const bars = L.dailySeries(s.days.site, T0)
    assert.equal(bars.length, 90)
    assert.equal(bars[89].date, L.dayKey(T0))
    assert.equal(bars[89].uptime, 100)
    assert.equal(bars[0].uptime, null)
})

test('old days and old incidents are dropped', () => {
    const s = L.emptyState()
    L.addCheck(s, 'site', ok(T0 - 100 * L.DAY))
    L.addCheck(s, 'site', ok(T0))
    s.incidents.push({ id: 'old', component: 'site', status: 'resolved', startedAt: T0 - 120 * L.DAY, resolvedAt: T0 - 119 * L.DAY })
    s.incidents.push({ id: 'new', component: 'site', status: 'open', startedAt: T0 - 1000, resolvedAt: null })
    L.prune(s, T0)
    assert.equal(Object.keys(s.days.site).length, 1)
    assert.deepEqual(s.incidents.map((i) => i.id), ['new'])
})
