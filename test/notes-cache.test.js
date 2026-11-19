const test = require('node:test')
const assert = require('node:assert/strict')
const { staleAction, sameNotes } = require('../renderer/notes-cache')

test('a list that is on screen is refreshed quietly, never wiped', () => {
    assert.equal(staleAction(true), 'refresh')
})

test('a list nobody looks at is dropped and read again at the next opening', () => {
    assert.equal(staleAction(false), 'drop')
})

test('the same notes are told from changed ones, so the list is not drawn again for nothing', () => {
    const a = [{ id: '1', title: 'x', updatedAt: 't1', folderId: null }]
    assert.equal(sameNotes(a, [{ id: '1', title: 'x', updatedAt: 't1', folderId: null }]), true)
    assert.equal(sameNotes(a, [{ id: '1', title: 'x', updatedAt: 't2', folderId: null }]), false)
    assert.equal(sameNotes(a, []), false)
    assert.equal(sameNotes([], []), true)
})
