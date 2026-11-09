const test = require('node:test')
const assert = require('node:assert/strict')
const { buildMorningSummary, shouldShowMorningSummary } = require('../renderer/morning-summary-logic')

const H = 60 * 60 * 1000
const now = new Date('2026-11-10T09:30:00+03:00').getTime()
const messengers = [{ id: 'tg', name: 'Telegram' }, { id: 'wa', name: 'WhatsApp' }, { id: 'todo', name: 'Todoist' }]

test('groups unread and the people who wrote since the last session, busiest first', () => {
    const summary = buildMorningSummary({
        messengers,
        unread: { tg: 5, wa: 2, todo: 0 },
        notifications: [
            { messengerId: 'tg', title: 'Иван', createdAt: new Date(now - 2 * H).toISOString() },
            { messengerId: 'tg', title: 'Иван', createdAt: new Date(now - 3 * H).toISOString() },
            { messengerId: 'tg', title: 'Ольга', createdAt: new Date(now - 4 * H).toISOString() },
            { messengerId: 'wa', title: '+7 900 000-00-00', createdAt: new Date(now - 1 * H).toISOString() },
            { messengerId: 'tg', title: 'Старое', createdAt: new Date(now - 40 * H).toISOString() }
        ],
        since: now - 14 * H,
        openTodos: 3
    })
    assert.equal(summary.totalUnread, 7)
    assert.deepEqual(summary.services.map((s) => s.id), ['tg', 'wa'])
    assert.deepEqual(summary.services[0].senders, [{ name: 'Иван', count: 2 }, { name: 'Ольга', count: 1 }])
    assert.equal(summary.openTodos, 3)
    assert.equal(summary.isEmpty, false)
})

test('nothing new means an empty summary', () => {
    const summary = buildMorningSummary({ messengers, unread: {}, notifications: [], since: now - 14 * H, openTodos: 0 })
    assert.equal(summary.isEmpty, true)
})

test('senders are capped and their text is never part of the summary', () => {
    const notifications = Array.from({ length: 9 }, (_, i) => ({ messengerId: 'tg', title: `P${i}`, body: 'secret', createdAt: new Date(now - H).toISOString() }))
    const summary = buildMorningSummary({ messengers, unread: { tg: 9 }, notifications, since: now - 2 * H, openTodos: 0 })
    assert.equal(summary.services[0].senders.length, 5)
    assert.equal(summary.services[0].moreSenders, 4)
    assert.equal(JSON.stringify(summary).includes('secret'), false)
})

test('shown once a day, from the morning on, after the work day started, only when the person is at the computer', () => {
    const base = { enabled: true, lastDay: '2026-11-09', today: '2026-11-10', hour: 9, workStarted: true, userActive: true }
    assert.equal(shouldShowMorningSummary(base), true)
    assert.equal(shouldShowMorningSummary({ ...base, lastDay: '2026-11-10' }), false)
    assert.equal(shouldShowMorningSummary({ ...base, hour: 4 }), false)
    assert.equal(shouldShowMorningSummary({ ...base, hour: 15 }), false, 'too late for a morning summary')
    assert.equal(shouldShowMorningSummary({ ...base, workStarted: false }), false)
    assert.equal(shouldShowMorningSummary({ ...base, userActive: false }), false)
    assert.equal(shouldShowMorningSummary({ ...base, enabled: false }), false)
})
