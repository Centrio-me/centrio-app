'use strict'
// Usage time in a split: every messenger visible on screen earns the time (they are all "in use" at once),
// and nothing earns time while the Centrio window itself is not focused.
const test = require('node:test')
const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

// tracker.js pulls the electron store, the API client and safeStorage: stub them so the clock runs in plain Node.
const stubs = {
    [path.resolve(__dirname, '../main/services/store.js')]: { get: () => null },
    [path.resolve(__dirname, '../main/services/api.js')]: { trackStats: async () => ({}) },
    [path.resolve(__dirname, '../main/services/secureStore.js')]: { decryptValue: v => v },
}
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
    const resolved = (() => { try { return Module._resolveFilename(request, parent, isMain) } catch { return request } })()
    if (stubs[resolved]) return stubs[resolved]
    return origLoad.apply(this, arguments)
}
const tracker = require('../main/services/tracker')
Module._load = origLoad

function withClock(fn) {
    const realNow = Date.now
    let now = 1_000_000
    Date.now = () => now
    try { fn(ms => { now += ms }) } finally { Date.now = realNow }
}

test('in a split every visible messenger earns the time', () => {
    withClock(advance => {
        tracker.onFocus()
        tracker._tickService()
        tracker._resetForTest()
        tracker.setActiveServices(['Telegram', 'WhatsApp', 'MAX'])
        advance(1000); tracker._tickService()
        advance(1000); tracker._tickService()
        assert.deepEqual(tracker._serviceSecondsForTest(), { Telegram: 2, WhatsApp: 2, MAX: 2 })
    })
})

test('the same messenger shown twice is counted once', () => {
    withClock(advance => {
        tracker._resetForTest()
        tracker.setActiveServices(['Telegram', 'Telegram'])
        advance(1000); tracker._tickService()
        assert.deepEqual(tracker._serviceSecondsForTest(), { Telegram: 1 })
    })
})

test('nothing is counted while the window is not focused', () => {
    withClock(advance => {
        tracker._resetForTest()
        tracker.setActiveServices(['Telegram', 'MAX'])
        tracker.onBlur()
        advance(1000); tracker._tickService()
        assert.deepEqual(tracker._serviceSecondsForTest(), {})
        tracker.onFocus()
    })
})

test('a single tab keeps working through the old one-name call', () => {
    withClock(advance => {
        tracker._resetForTest()
        tracker.setActiveService('VK')
        advance(1000); tracker._tickService()
        assert.deepEqual(tracker._serviceSecondsForTest(), { VK: 1 })
    })
})
