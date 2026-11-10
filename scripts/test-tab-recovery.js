'use strict'
// A messenger tab whose page process died (sleep, a GPU reset, low memory) comes back by itself instead of staying black
const test = require('node:test')
const assert = require('node:assert/strict')
const { recoveryDelay, MAX_RECOVERIES } = require('../renderer/tab-recovery')

test('a tab that crashed is reloaded soon, a little later each time', () => {
    assert.equal(recoveryDelay([], 'crashed', 0), 1000)
    assert.equal(recoveryDelay([0], 'oom', 5000), 4000)
    assert.equal(recoveryDelay([0, 5000], 'killed', 10000), 16000)
})

test('a tab closed on purpose is left alone', () => {
    assert.equal(recoveryDelay([], 'clean-exit', 0), null)
})

test('a tab that keeps crashing is not reloaded in a loop: a few times in ten minutes, then it waits for the person', () => {
    const recent = Array.from({ length: MAX_RECOVERIES }, (_, i) => i * 1000)
    assert.equal(recoveryDelay(recent, 'crashed', 60000), null)
    assert.equal(recoveryDelay(recent, 'crashed', 11 * 60000), 1000)
})
