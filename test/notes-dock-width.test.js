'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { dockWidth, MIN_DOCK, MIN_CHAT } = require('../renderer/notes-dock-width')

test('with nothing saved the column takes about half of the area, as before', () => {
    assert.equal(dockWidth(null, 1000), 460)
    assert.equal(dockWidth('', 1000), 460)
    assert.equal(dockWidth('junk', 1000), 460)
})

test('the usual width stays between 420 and 760', () => {
    assert.equal(dockWidth(null, 900), 420)
    assert.equal(dockWidth(null, 3000), 760)
})

test('a saved width is used, as a number or as text', () => {
    assert.equal(dockWidth(540, 1400), 540)
    assert.equal(dockWidth('600', 1400), 600)
})

test('the column cannot be narrower than its smallest width', () => {
    assert.equal(dockWidth(100, 1400), MIN_DOCK)
})

test('the conversation always keeps room: the column cannot be wider than the area minus the chat\'s smallest width', () => {
    assert.equal(dockWidth(5000, 1200), 1200 - MIN_CHAT)
})

test('in a small area the smallest column wins over the chat\'s room', () => {
    assert.equal(dockWidth(900, 500), MIN_DOCK)
})

test('beside a chat only where the chat keeps its room', () => {
    const { canDock, MIN_DOCK, MIN_CHAT } = require('../renderer/notes-dock-width')
    assert.equal(canDock(MIN_DOCK + MIN_CHAT), true)
    assert.equal(canDock(MIN_DOCK + MIN_CHAT - 1), false)
    assert.equal(canDock(488), false)
    assert.equal(canDock(1400), true)
    assert.equal(canDock(undefined), false)
})
