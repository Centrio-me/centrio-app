'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { clampWidth, MIN_W, MAX_W, DEFAULT_W } = require('../../renderer/all-inbox/panel-resize')

test('the list keeps a width between its smallest and largest, and never more than half the window', () => {
    assert.equal(clampWidth(500, 1920), 500)
    assert.equal(clampWidth(100, 1920), MIN_W)
    assert.equal(clampWidth(5000, 1920), MAX_W)
    assert.equal(clampWidth(700, 1000), 500, 'half of a narrow window')
    assert.equal(clampWidth(700, 500), MIN_W, 'the smallest width wins over half of a tiny window')
})

test('a missing or broken saved width gives the usual one', () => {
    assert.equal(clampWidth(NaN, 1920), DEFAULT_W)
    assert.equal(clampWidth(undefined, 1920), DEFAULT_W)
    assert.equal(clampWidth('abc', 1920), DEFAULT_W)
    assert.equal(clampWidth('420', 1920), 420)
})
