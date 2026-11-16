'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const T = require('../renderer/split-tree')

const leaf = () => ({ leaf: true })
const node = (dir, a, b, ratio = 50) => ({ dir, ratio, a, b })

test('the default layout is two columns of the same width', () => {
    assert.deepEqual(T.treeRects(T.defaultTree()), [
        { left: 0, top: 0, width: 50, height: 100 },
        { left: 50, top: 0, width: 50, height: 100 }
    ])
})

test('one block takes the whole window', () => {
    assert.deepEqual(T.treeRects(leaf()), [{ left: 0, top: 0, width: 100, height: 100 }])
    assert.equal(T.countLeaves(leaf()), 1)
})

test('one on top, a big one in the middle and one below: three rows with their own heights', () => {
    const tree = node('h', leaf(), node('h', leaf(), leaf(), 75), 20)
    const rects = T.treeRects(tree)
    assert.equal(rects.length, 3)
    assert.deepEqual(rects[0], { left: 0, top: 0, width: 100, height: 20 })
    assert.deepEqual(rects[1], { left: 0, top: 20, width: 100, height: 60 })
    assert.deepEqual(rects[2], { left: 0, top: 80, width: 100, height: 20 })
})

test('blocks come in reading order: the first branch before the second', () => {
    const tree = node('v', node('h', leaf(), leaf()), leaf())
    const rects = T.treeRects(tree)
    assert.deepEqual(rects.map(r => [r.left, r.top]), [[0, 0], [0, 50], [50, 0]])
})

test('splitting a block to the right makes two columns out of it and keeps the others', () => {
    const tree = T.splitLeaf(T.defaultTree(), 1, 'v')
    assert.equal(T.countLeaves(tree), 3)
    assert.deepEqual(T.treeRects(tree).map(r => r.width), [50, 25, 25])
})

test('splitting down makes two rows inside the block', () => {
    const tree = T.splitLeaf(leaf(), 0, 'h')
    assert.deepEqual(T.treeRects(tree).map(r => [r.top, r.height]), [[0, 50], [50, 50]])
})

test('splitting never changes the tree it was given', () => {
    const before = T.defaultTree()
    const snapshot = JSON.stringify(before)
    T.splitLeaf(before, 0, 'h')
    assert.equal(JSON.stringify(before), snapshot)
})

test('no more than six blocks', () => {
    let tree = leaf()
    for (let i = 0; i < 10; i++) tree = T.splitLeaf(tree, 0, i % 2 ? 'v' : 'h')
    assert.equal(T.countLeaves(tree), T.MAX_LEAVES)
    assert.equal(T.canSplit(tree), false)
})

test('removing a block gives its room to the neighbour', () => {
    const tree = T.removeLeaf(node('v', leaf(), node('h', leaf(), leaf())), 1)
    assert.equal(T.countLeaves(tree), 2)
    assert.deepEqual(T.treeRects(tree), [
        { left: 0, top: 0, width: 50, height: 100 },
        { left: 50, top: 0, width: 50, height: 100 }
    ])
})

test('the last block cannot be removed', () => {
    assert.deepEqual(T.removeLeaf(leaf(), 0), leaf())
})

test('every divider reports the region it moves inside and where it stands', () => {
    const tree = node('v', leaf(), node('h', leaf(), leaf(), 30), 40)
    const dividers = T.treeDividers(tree)
    assert.equal(dividers.length, 2)
    assert.deepEqual(dividers[0], { path: '', dir: 'v', ratio: 40, region: { left: 0, top: 0, width: 100, height: 100 } })
    assert.deepEqual(dividers[1], { path: 'b', dir: 'h', ratio: 30, region: { left: 40, top: 0, width: 60, height: 100 } })
})

test('moving a divider changes only that divider and stays inside the limits', () => {
    const tree = node('v', leaf(), node('h', leaf(), leaf()))
    const moved = T.setRatio(tree, 'b', 70)
    assert.equal(moved.b.ratio, 70)
    assert.equal(moved.ratio, 50)
    assert.equal(T.setRatio(tree, '', 3).ratio, T.MIN_RATIO)
    assert.equal(T.setRatio(tree, '', 99).ratio, T.MAX_RATIO)
    assert.equal(tree.b.ratio, 50)
})

test('a layout read from a saved preset is checked before it is used', () => {
    assert.equal(T.normalizeTree(null), null)
    assert.equal(T.normalizeTree('x'), null)
    assert.equal(T.normalizeTree({ dir: 'z', a: leaf(), b: leaf() }), null)
    assert.equal(T.normalizeTree({ dir: 'v', ratio: 50, a: leaf() }), null)
    const seven = Array.from({ length: 7 }).reduce((t) => node('v', leaf(), t), leaf())
    assert.equal(T.normalizeTree(seven), null)
    const ok = T.normalizeTree({ dir: 'v', ratio: 500, a: { leaf: true, junk: 1 }, b: leaf() })
    assert.deepEqual(ok, node('v', leaf(), leaf(), T.MAX_RATIO))
})

test('a layout nested far too deep is refused', () => {
    let deep = leaf()
    for (let i = 0; i < 40; i++) deep = node('h', deep, leaf())
    assert.equal(T.normalizeTree(deep), null)
})
