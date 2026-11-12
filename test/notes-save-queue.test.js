'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { createSaveQueue } = require('../renderer/notes-save-queue')

function fakeClock() {
    let now = 0
    let seq = 0
    const timers = new Map()
    return {
        setTimeout(fn, ms) { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id },
        clearTimeout(id) { timers.delete(id) },
        tick(ms) {
            now += ms
            for (const [id, t] of [...timers]) if (t.at <= now) { timers.delete(id); t.fn() }
        }
    }
}

test('two quick edits of one note go out together as one save', () => {
    const clock = fakeClock()
    const sent = []
    const q = createSaveQueue({ delay: 500, send: (id, patch) => sent.push([id, patch]), ...clock })
    q.add('a', { title: 'T' })
    clock.tick(200)
    q.add('a', { body: 'B' })
    clock.tick(500)
    assert.deepEqual(sent, [['a', { title: 'T', body: 'B' }]])
})

test('switching to another note saves the first one right away', () => {
    const clock = fakeClock()
    const sent = []
    const q = createSaveQueue({ delay: 500, send: (id, patch) => sent.push([id, patch]), ...clock })
    q.add('a', { title: 'A' })
    q.add('b', { title: 'B' })
    assert.deepEqual(sent, [['a', { title: 'A' }]])
    clock.tick(500)
    assert.deepEqual(sent, [['a', { title: 'A' }], ['b', { title: 'B' }]])
})

test('flush sends what is waiting and reports whether there was anything', () => {
    const clock = fakeClock()
    const sent = []
    const q = createSaveQueue({ delay: 500, send: (id, patch) => sent.push([id, patch]), ...clock })
    assert.equal(q.flush(), false)
    q.add('a', { body: 'x' })
    assert.equal(q.flush(), true)
    clock.tick(1000)
    assert.deepEqual(sent, [['a', { body: 'x' }]])
})

test('pending tells what has not been sent yet for a note', () => {
    const clock = fakeClock()
    const q = createSaveQueue({ delay: 500, send: () => {}, ...clock })
    q.add('a', { body: 'x' })
    assert.deepEqual(q.pending('a'), { body: 'x' })
    assert.deepEqual(q.pending('b'), {})
    clock.tick(500)
    assert.deepEqual(q.pending('a'), {})
})
