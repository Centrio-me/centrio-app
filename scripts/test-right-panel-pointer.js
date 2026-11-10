'use strict'
// 3.7.4: in Аврора / Время суток the right panel is a card with a little pointer towards the button it came from
const test = require('node:test')
const assert = require('node:assert/strict')
const { pointerY } = require('../renderer/right-panel-pointer-logic')

test('the pointer sits at the middle of the active button, measured from the top of the button column', () => {
    assert.equal(pointerY({ top: 47, height: 41 }, { top: 38, height: 896 }), 30)
})

test('no active button or a button scrolled out of the column: no pointer', () => {
    assert.equal(pointerY(null, { top: 38, height: 896 }), null)
    assert.equal(pointerY({ top: 2000, height: 41 }, { top: 38, height: 896 }), null)
    assert.equal(pointerY({ top: -100, height: 41 }, { top: 38, height: 896 }), null)
})

test('the pointer never leaves the rounded part of the card', () => {
    assert.equal(pointerY({ top: 38, height: 10 }, { top: 38, height: 896 }), 28)
})
