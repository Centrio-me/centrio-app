// Run with: node --test scripts/test-team-events-client.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseSse, nextDelay } = require('../main/services/teamEventsParse')

test('an event split across two chunks is parsed once', () => {
    const first = parseSse('event: assignments\ndata: {"userId":', '')
    assert.deepEqual(first.events, [])
    const second = parseSse('"u1"}\n\n', first.carry)
    assert.deepEqual(second.events, [{ type: 'assignments', data: { userId: 'u1' } }])
    assert.equal(second.carry, '')
})

test('ping comments are ignored and several events in one chunk all arrive', () => {
    const r = parseSse(': connected\n\n: ping\n\nevent: settings\ndata: {}\n\nevent: note\ndata: {"userId":"u2"}\n\n', '')
    assert.deepEqual(r.events.map((e) => e.type), ['settings', 'note'])
})

test('a broken data line does not throw and gives empty data', () => {
    const r = parseSse('event: member\ndata: {oops\n\n', '')
    assert.deepEqual(r.events, [{ type: 'member', data: {} }])
})

test('Windows line endings are understood', () => {
    const r = parseSse('event: tasks\r\ndata: {}\r\n\r\n', '')
    assert.deepEqual(r.events.map((e) => e.type), ['tasks'])
})

test('reconnect delay grows from 2 s and stops at 60 s', () => {
    const noJitter = () => 0.5
    assert.equal(nextDelay(0, noJitter), 2000)
    assert.equal(nextDelay(1, noJitter), 4000)
    assert.equal(nextDelay(10, noJitter), 60000)
    const d = nextDelay(2, () => 1)
    assert.ok(d >= 8000 && d <= 9600)
})
