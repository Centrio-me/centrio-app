// A reaction shows the moment it is pressed, like in the messengers (owner, 2026-11-12: «реакция появляется спустя время»)
const test = require('node:test')
const assert = require('node:assert')
const { toggleReaction, settles, overlayReactions } = require('../../renderer/all-inbox/quick-reactions.js')

test('a new reaction is added as yours, your earlier one goes (one reaction per person)', () => {
    const before = [{ e: '❤️', n: '2', mine: true }, { e: '😂', n: '1', mine: false }]
    assert.deepStrictEqual(toggleReaction(before, '👍'), [{ e: '❤️', n: '1', mine: false }, { e: '😂', n: '1', mine: false }, { e: '👍', n: '1', mine: true }])
})

test('the same reaction again takes yours off, a count of others stays', () => {
    assert.deepStrictEqual(toggleReaction([{ e: '👍', n: '3', mine: true }], '👍'), [{ e: '👍', n: '2', mine: false }])
    assert.deepStrictEqual(toggleReaction([{ e: '👍', n: '1', mine: true }], '👍'), [])
})

test('joining a reaction others already put raises its count', () => {
    assert.deepStrictEqual(toggleReaction([{ e: '🔥', n: '4', mine: false }], '🔥'), [{ e: '🔥', n: '5', mine: true }])
})

test('the messenger has caught up when your reaction there is the expected one', () => {
    assert.strictEqual(settles([{ e: '👍', n: '1', mine: true }], '👍'), true)
    assert.strictEqual(settles([], '👍'), false)
    assert.strictEqual(settles([], ''), true)
    // MAX gives pictures, not emoji: yours being there (or gone) is enough
    assert.strictEqual(settles([{ e: '', img: 'data:image/png;base64,x', n: '1', mine: true }], '👍'), true)
})

test('the pressed state stands over older data until it settles or ten seconds pass', () => {
    const pending = new Map([['m1', { list: [{ e: '👍', n: '1', mine: true }], mine: '👍', at: 1000 }]])
    const rows = [{ type: 'msg', id: 'm1', reactions: [] }, { type: 'msg', id: 'm2', reactions: [] }]
    const shown = overlayReactions(rows, pending, 2000)
    assert.deepStrictEqual(shown[0].reactions, [{ e: '👍', n: '1', mine: true }])
    assert.strictEqual(shown[1], rows[1])
    assert.strictEqual(pending.has('m1'), true)
    overlayReactions([{ type: 'msg', id: 'm1', reactions: [{ e: '👍', n: '1', mine: true }] }], pending, 2500)
    assert.strictEqual(pending.has('m1'), false)
    pending.set('m3', { list: [], mine: '', at: 0 })
    overlayReactions([{ type: 'msg', id: 'm3', reactions: [{ e: '👍', n: '1', mine: true }] }], pending, 20000)
    assert.strictEqual(pending.has('m3'), false)
})
