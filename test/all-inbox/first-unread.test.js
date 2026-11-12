// Oleg, 2026-11-12: a chat opened at its very bottom, the messenger itself opens where the unread messages begin
const test = require('node:test')
const assert = require('node:assert')
const { firstUnreadId } = require('../../renderer/all-inbox/first-unread.js')

const msg = (id, out = false) => ({ type: 'msg', id, out })
const day = { type: 'day', label: 'Сегодня' }

test('the first of the last N incoming messages is where reading starts', () => {
    const rows = [msg('a'), msg('b', true), day, msg('c'), msg('d'), msg('e')]
    assert.strictEqual(firstUnreadId(rows, 2), 'd')
    assert.strictEqual(firstUnreadId(rows, 3), 'c')
})

test('own messages and day marks are not counted', () => {
    const rows = [msg('a'), msg('b'), msg('mine', true), msg('c')]
    assert.strictEqual(firstUnreadId(rows, 2), 'b')
})

test('more unread than loaded: reading starts at the first incoming message loaded', () => {
    assert.strictEqual(firstUnreadId([msg('a', true), msg('b'), msg('c')], 10), 'b')
})

test('nothing unread or nothing incoming: no place to start', () => {
    assert.strictEqual(firstUnreadId([msg('a')], 0), '')
    assert.strictEqual(firstUnreadId([msg('a', true)], 3), '')
})
