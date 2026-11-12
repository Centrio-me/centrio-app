// «Изменить» only while the messenger allows it (owner, 2026-11-12: it showed on old messages and did nothing):
// Telegram 48 h, MAX 7 days (its own setting edit-timeout)
const test = require('node:test')
const assert = require('node:assert')
const { messageTime, canEditNow } = require('../../renderer/all-inbox/edit-window.js')

const NOW = new Date(2026, 10, 12, 12, 0).getTime()
const H = 3600000

test('an exact time wins', () => {
    assert.strictEqual(messageTime({ at: NOW - H }, '', NOW), NOW - H)
})

test('without one, the day mark and the clock make the time', () => {
    assert.strictEqual(messageTime({ time: '10:30' }, 'Сегодня', NOW), new Date(2026, 10, 12, 10, 30).getTime())
    assert.strictEqual(messageTime({ time: '10:30' }, '', NOW), new Date(2026, 10, 12, 10, 30).getTime())
    assert.strictEqual(messageTime({ time: '23:15' }, 'Вчера', NOW), new Date(2026, 10, 11, 23, 15).getTime())
    assert.strictEqual(messageTime({ time: '09:00' }, '3 сентября', NOW), new Date(2026, 8, 3, 9, 0).getTime())
})

test('editable only inside the window, unknown time is not editable', () => {
    assert.strictEqual(canEditNow({ at: NOW - 47 * H }, '', 48 * H, NOW), true)
    assert.strictEqual(canEditNow({ at: NOW - 49 * H }, '', 48 * H, NOW), false)
    assert.strictEqual(canEditNow({ time: '10:00' }, '3 сентября', 7 * 24 * H, NOW), false)
    assert.strictEqual(canEditNow({}, '', 48 * H, NOW), false)
})
