'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createPending, withPending } = require('../../renderer/all-inbox/pending')

const out = (id, text, kind = 'text') => ({ type: 'msg', id, out: true, kind, text })
const NOW = 1_800_000_000_000

test('a message being sent shows at the end with its clock until the real one comes', () => {
    const p = createPending()
    p.add({ text: 'привет', files: [], knownIds: ['1'], now: NOW })
    const rows = withPending([out('1', 'старое')], p, NOW + 500)
    assert.equal(rows.length, 2)
    assert.equal(rows[1].pending, 'sending')
    assert.equal(rows[1].text, 'привет')
    assert.equal(rows[1].out, true)
})

test('the real message replaces the one being sent', () => {
    const p = createPending()
    p.add({ text: 'привет  мир', files: [], knownIds: ['1'], now: NOW })
    const rows = withPending([out('1', 'старое'), out('2', 'привет мир')], p, NOW + 900)
    assert.deepEqual(rows.map((r) => r.id), ['1', '2'])
    assert.equal(p.size(), 0)
})

test('an old message with the same text does not count as the new one', () => {
    const p = createPending()
    p.add({ text: 'ок', files: [], knownIds: ['1'], now: NOW })
    const rows = withPending([out('1', 'ок')], p, NOW + 500)
    assert.equal(rows.length, 2)
})

test('files: any new message of your own after it settles the files being sent', () => {
    const p = createPending()
    p.add({ text: '', files: [{ name: 'a.png' }, { name: 'b.png' }], knownIds: ['1'], now: NOW })
    const before = withPending([out('1', 'x')], p, NOW + 100)
    assert.equal(before[1].kind, 'file')
    assert.equal(before[1].name, 'a.png и ещё 1')
    const after = withPending([out('1', 'x'), out('3', '', 'photo')], p, NOW + 2000)
    assert.equal(after.length, 2)
    assert.equal(p.size(), 0)
})

test('a send that failed, or that never showed up, is marked as not sent', () => {
    const p = createPending()
    const id = p.add({ text: 'a', files: [], knownIds: [], now: NOW })
    p.fail(id)
    assert.equal(withPending([], p, NOW + 100)[0].pending, 'failed')
    const q = createPending()
    q.add({ text: 'b', files: [], knownIds: [], now: NOW })
    assert.equal(withPending([], q, NOW + 60_000)[0].pending, 'failed')
})

test('a failed one can be dropped', () => {
    const p = createPending()
    const id = p.add({ text: 'a', files: [], knownIds: [], now: NOW })
    p.fail(id)
    p.drop(id)
    assert.equal(withPending([], p, NOW).length, 0)
})

test('the message being sent carries the tail of your group of messages', () => {
    const p = createPending()
    p.add({ text: 'новое', files: [], knownIds: ['1'], now: NOW })
    const rows = withPending([{ ...out('1', 'старое'), groupStart: true, groupEnd: true }], p, NOW + 100)
    assert.equal(rows[0].groupEnd, false)
    assert.equal(rows[1].groupEnd, true)
    assert.equal(rows[1].groupStart, false)
})
