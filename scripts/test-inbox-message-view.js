'use strict'
// «Все мессенджеры»: how a message is drawn — the parts that decide the look
const test = require('node:test')
const assert = require('node:assert/strict')
const { jumboCount, mediaBox } = require('../renderer/all-inbox/message-shape')

test('one to three emoji with nothing else are drawn large, like Telegram', () => {
    assert.equal(jumboCount('😂'), 1)
    assert.equal(jumboCount('👍❤️'), 2)
    assert.equal(jumboCount(' 🎉🎉🎉 '), 3)
    assert.equal(jumboCount('👨‍👩‍👧'), 1)
    assert.equal(jumboCount('🇷🇺'), 1)
    assert.equal(jumboCount('😂😂😂😂'), 0)
    assert.equal(jumboCount('ок 👍'), 0)
    assert.equal(jumboCount('123'), 0)
    assert.equal(jumboCount(''), 0)
})

test('a photo keeps its shape and fits the bubble: not wider than 420, not narrower than 160', () => {
    assert.deepEqual(mediaBox(417, 233), { width: 417, height: 233 })
    assert.deepEqual(mediaBox(1000, 500), { width: 420, height: 210 })
    assert.deepEqual(mediaBox(100, 400), { width: 160, height: 400 })
    assert.deepEqual(mediaBox(300, 1200), { width: 160, height: 420 })
    assert.deepEqual(mediaBox(0, 0), { width: 320, height: 240 })
})
