const test = require('node:test')
const assert = require('node:assert/strict')
const { moveFolder } = require('../shared/folder-order')

const F = (...ids) => ids.map((id, i) => ({ id, name: id, position: i }))
const ids = (list) => list.map((f) => f.id)

// Oleg 2026-11-22: folders of notes could not be dragged up and down.
test('a folder dragged onto another takes its place, before or after it', () => {
    assert.deepEqual(ids(moveFolder(F('a', 'b', 'c', 'd'), 'd', 'b', false)), ['a', 'd', 'b', 'c'])
    assert.deepEqual(ids(moveFolder(F('a', 'b', 'c', 'd'), 'a', 'c', true)), ['b', 'c', 'a', 'd'])
    assert.deepEqual(ids(moveFolder(F('a', 'b', 'c'), 'c', 'a', false)), ['c', 'a', 'b'])
})

test('positions follow the new order and only changed folders are listed', () => {
    const r = moveFolder(F('a', 'b', 'c', 'd'), 'd', 'b', false)
    assert.deepEqual(r.map((f) => f.position), [0, 1, 2, 3])
    assert.deepEqual(r.changed.map((f) => f.id), ['d', 'b', 'c'])
})

test('a move that changes nothing, or names an unknown folder, leaves the order alone', () => {
    const base = F('a', 'b', 'c')
    assert.deepEqual(ids(moveFolder(base, 'b', 'b', false)), ['a', 'b', 'c'])
    assert.deepEqual(ids(moveFolder(base, 'a', 'b', false)), ['a', 'b', 'c'])
    assert.deepEqual(ids(moveFolder(base, 'x', 'b', false)), ['a', 'b', 'c'])
    assert.equal(moveFolder(base, 'a', 'b', false).changed.length, 0)
})
