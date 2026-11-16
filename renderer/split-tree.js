'use strict'
// A free split layout is a tree of cuts. A leaf is one block (one messenger); a node cuts its area in two:
//   dir 'v' — a vertical divider, the first branch on the left and the second on the right;
//   dir 'h' — a horizontal divider, the first branch on top and the second below.
// `ratio` is the share (in %) of the first branch. Every function returns a new tree and never changes its argument.

const MAX_LEAVES = 6
const MAX_DEPTH = 5
const MIN_RATIO = 15
const MAX_RATIO = 85

const leaf = () => ({ leaf: true })
const isLeaf = (n) => !!n && n.leaf === true
const clampRatio = (v) => Math.max(MIN_RATIO, Math.min(MAX_RATIO, v))

function defaultTree () {
    return { dir: 'v', ratio: 50, a: leaf(), b: leaf() }
}

function countLeaves (tree) {
    return isLeaf(tree) ? 1 : countLeaves(tree.a) + countLeaves(tree.b)
}

const canSplit = (tree) => countLeaves(tree) < MAX_LEAVES

function _rects (node, area, out) {
    if (isLeaf(node)) { out.push(area); return }
    const share = node.ratio / 100
    if (node.dir === 'v') {
        const w = area.width * share
        _rects(node.a, { ...area, width: w }, out)
        _rects(node.b, { ...area, left: area.left + w, width: area.width - w }, out)
    } else {
        const h = area.height * share
        _rects(node.a, { ...area, height: h }, out)
        _rects(node.b, { ...area, top: area.top + h, height: area.height - h }, out)
    }
}

// The blocks in reading order, each as { left, top, width, height } in % of the whole window.
function treeRects (tree) {
    const out = []
    _rects(tree, { left: 0, top: 0, width: 100, height: 100 }, out)
    return out
}

function _dividers (node, area, path, out) {
    if (isLeaf(node)) return
    out.push({ path, dir: node.dir, ratio: node.ratio, region: area })
    const share = node.ratio / 100
    if (node.dir === 'v') {
        const w = area.width * share
        _dividers(node.a, { ...area, width: w }, path + 'a', out)
        _dividers(node.b, { ...area, left: area.left + w, width: area.width - w }, path + 'b', out)
    } else {
        const h = area.height * share
        _dividers(node.a, { ...area, height: h }, path + 'a', out)
        _dividers(node.b, { ...area, top: area.top + h, height: area.height - h }, path + 'b', out)
    }
}

// Every divider with the path to its node and the region of the window it moves inside.
function treeDividers (tree) {
    const out = []
    _dividers(tree, { left: 0, top: 0, width: 100, height: 100 }, '', out)
    return out
}

// Rebuilds the tree, replacing the leaf with this reading-order index by whatever `change` returns for it.
function _mapLeaf (tree, index, change) {
    let seen = 0
    const walk = (node) => {
        if (isLeaf(node)) return seen++ === index ? change(node) : node
        const a = walk(node.a)
        const b = walk(node.b)
        return a === node.a && b === node.b ? node : { ...node, a, b }
    }
    return walk(tree)
}

function splitLeaf (tree, index, dir) {
    if (!canSplit(tree) || (dir !== 'v' && dir !== 'h')) return tree
    return _mapLeaf(tree, index, () => ({ dir, ratio: 50, a: leaf(), b: leaf() }))
}

function removeLeaf (tree, index) {
    if (isLeaf(tree)) return tree
    let seen = 0
    const walk = (node) => {
        if (isLeaf(node)) { seen++; return node }
        const firstLeafIndex = seen
        const leavesInA = countLeaves(node.a)
        if (isLeaf(node.a) && firstLeafIndex === index) { seen += 1 + countLeaves(node.b); return node.b }
        if (isLeaf(node.b) && firstLeafIndex + leavesInA === index) { seen += leavesInA + 1; return node.a }
        const a = walk(node.a)
        const b = walk(node.b)
        return a === node.a && b === node.b ? node : { ...node, a, b }
    }
    return walk(tree)
}

function setRatio (tree, path, ratio) {
    const walk = (node, rest) => {
        if (isLeaf(node)) return node
        if (rest === '') return { ...node, ratio: clampRatio(ratio) }
        return rest[0] === 'a' ? { ...node, a: walk(node.a, rest.slice(1)) } : { ...node, b: walk(node.b, rest.slice(1)) }
    }
    return walk(tree, path)
}

// A layout coming from a saved preset, the store or the cloud: returns a clean copy, or null if it cannot be trusted.
function normalizeTree (input) {
    let leaves = 0
    const walk = (node, depth) => {
        if (depth > MAX_DEPTH || !node || typeof node !== 'object') return null
        if (node.leaf === true) { leaves++; return leaf() }
        if ((node.dir !== 'v' && node.dir !== 'h') || typeof node.ratio !== 'number' || !Number.isFinite(node.ratio)) return null
        const a = walk(node.a, depth + 1)
        const b = a && walk(node.b, depth + 1)
        if (!a || !b) return null
        return { dir: node.dir, ratio: clampRatio(node.ratio), a, b }
    }
    const tree = walk(input, 0)
    return tree && leaves <= MAX_LEAVES ? tree : null
}

module.exports = {
    MAX_LEAVES, MIN_RATIO, MAX_RATIO,
    defaultTree, countLeaves, canSplit, treeRects, treeDividers, splitLeaf, removeLeaf, setRatio, normalizeTree
}
