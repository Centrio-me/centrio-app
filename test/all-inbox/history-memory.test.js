const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeHistory, MOST_KEPT } = require('../../renderer/all-inbox/history-memory')

const m = (...ids) => ids.map((id) => ({ id: String(id), text: 't' + id }))
const ids = (list) => list.map((x) => x.id)

test('the first read is taken as it is', () => {
    assert.deepEqual(ids(mergeHistory([], m(5, 6, 7))), ['5', '6', '7'])
})

test('earlier messages the page loaded are put above and the ones already read stay', () => {
    assert.deepEqual(ids(mergeHistory(m(5, 6, 7), m(3, 4, 5, 6))), ['3', '4', '5', '6', '7'])
})

test('when the page drops the newest while loading older ones, the newest stay', () => {
    const prev = m(10, 11, 12, 13, 14)
    const next = m(6, 7, 8, 9, 10, 11)
    assert.deepEqual(ids(mergeHistory(prev, next)), ['6', '7', '8', '9', '10', '11', '12', '13', '14'])
})

test('when the page forgets the oldest, the oldest already read stay above', () => {
    assert.deepEqual(ids(mergeHistory(m(1, 2, 3, 4), m(3, 4, 5, 6))), ['1', '2', '3', '4', '5', '6'])
})

test('a new message at the bottom is added and the page wins for text it holds', () => {
    const next = [{ id: '3', text: 'edited' }, { id: '4', text: 't4' }]
    const merged = mergeHistory(m(1, 2, 3), next)
    assert.deepEqual(ids(merged), ['1', '2', '3', '4'])
    assert.equal(merged[2].text, 'edited')
})

test('a message gone from the middle of what the page shows is gone', () => {
    assert.deepEqual(ids(mergeHistory(m(1, 2, 3, 4, 5), m(2, 4, 5))), ['1', '2', '4', '5'])
})

test('a read with nothing in common starts over', () => {
    assert.deepEqual(ids(mergeHistory(m(1, 2, 3), m(50, 51))), ['50', '51'])
})

test('messages without an id are not merged', () => {
    const next = [{ text: 'a' }, { text: 'b' }]
    assert.deepEqual(mergeHistory(m(1, 2), next), next)
})

test('an empty read keeps what was read', () => {
    assert.deepEqual(ids(mergeHistory(m(1, 2), [])), ['1', '2'])
})

test('no more than the limit is kept, the newest of them', () => {
    const many = Array.from({ length: MOST_KEPT + 50 }, (_, i) => ({ id: String(i), text: '' }))
    const merged = mergeHistory(many.slice(0, MOST_KEPT), many.slice(MOST_KEPT - 10))
    assert.equal(merged.length, MOST_KEPT)
    assert.equal(merged[merged.length - 1].id, String(MOST_KEPT + 49))
})
