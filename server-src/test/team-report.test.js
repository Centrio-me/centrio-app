const test = require('node:test')
const assert = require('node:assert/strict')
const { formatHM, buildDailySummary, buildReportRows, expiryNoticeDue, reactionUpdate } = require('../src/lib/team-report')

test('formatHM writes minutes as Ч:ММ', () => {
    assert.equal(formatHM(0), '0:00')
    assert.equal(formatHM(7), '0:07')
    assert.equal(formatHM(487.5), '8:07')
})

test('the daily summary lists active people first and inactive ones last', () => {
    const text = buildDailySummary('Ромашка', '2026-11-10', 'Europe/Moscow', [
        { name: 'Борис', daily: null, signInProblems: 0 },
        { name: 'Анна', daily: { activeMin: 412, firstAt: new Date('2026-11-10T06:02:00Z'), lastAt: new Date('2026-11-10T15:01:00Z'), overThreshold: 2, reactionSecSum: 1800, reactionCount: 6, longestWaitMin: 34 }, signInProblems: 1 }
    ])
    assert.match(text, /Ромашка/)
    assert.match(text, /10\.11/)
    assert.ok(text.indexOf('Анна') < text.indexOf('Борис'))
    assert.match(text, /Анна[\s\S]*6:52[\s\S]*09:02[\s\S]*18:01/)
    assert.match(text, /время реакции[^\n]*5 мин/)
    assert.match(text, /ждали дольше нормы: 2/)
    assert.match(text, /проблемы со входом: 1/)
    assert.match(text, /Борис[^\n]*не выходил на связь/)
    assert.doesNotMatch(text, /время ответа/)
})

test('report rows sum the days and average reaction is sum over count, null when there was none', () => {
    const rows = buildReportRows(
        [{ userId: 'a', name: 'Анна' }, { userId: 'b', name: 'Борис' }],
        [
            { userId: 'a', activeMin: 400, reactionSecSum: 600, reactionCount: 3, overThreshold: 1 },
            { userId: 'a', activeMin: 300, reactionSecSum: 300, reactionCount: 1, overThreshold: 0 }
        ]
    )
    assert.deepEqual(rows[0], { userId: 'a', name: 'Анна', activeMin: 700, avgReactionSec: 225, overThreshold: 1, days: 2 })
    assert.deepEqual(rows[1], { userId: 'b', name: 'Борис', activeMin: 0, avgReactionSec: null, overThreshold: 0, days: 0 })
})

test('expiry notices go out 7, 3 and 1 day before and on the last day, once each', () => {
    const exp = new Date('2026-11-20T12:00:00Z')
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-13T13:00:00Z'), []), 7)
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-13T13:00:00Z'), [7]), null)
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-17T13:00:00Z'), [7]), 3)
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-19T13:00:00Z'), [7, 3]), 1)
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-20T08:00:00Z'), [7, 3, 1]), 0)
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-21T08:00:00Z'), []), null)
    assert.equal(expiryNoticeDue(exp, new Date('2026-11-01T08:00:00Z'), []), null)
})

test('clearing a wait adds the reaction time, and counts it as over the norm past the threshold', () => {
    const since = new Date('2026-11-10T10:00:00Z')
    assert.deepEqual(reactionUpdate(since, new Date('2026-11-10T10:05:00Z'), 15), { reactionSecSum: 300, overThreshold: 0 })
    assert.deepEqual(reactionUpdate(since, new Date('2026-11-10T10:20:00Z'), 15), { reactionSecSum: 1200, overThreshold: 1 })
    assert.equal(reactionUpdate(null, new Date(), 15), null)
})
