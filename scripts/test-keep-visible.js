'use strict'
// 3.7.4: Telemost stays «visible» while Centrio is minimised or in the tray (main/services/keepVisible.js)
const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('events')
const { keepVisible, CHANNEL, HOST_EVENT } = require('../main/services/keepVisible')

function guest(url) {
    const g = new EventEmitter()
    g.sent = []
    g.url = url
    g.hostWebContents = new EventEmitter()
    g.getURL = () => g.url
    g.isDestroyed = () => false
    g._sendInternal = (channel, value) => g.sent.push([channel, value])
    return g
}
const isTelemost = (url) => url.startsWith('https://telemost.yandex.ru')
const tick = () => new Promise((r) => setImmediate(r))

test('a Telemost page hears «visible» right after the window goes hidden', async () => {
    const g = guest('https://telemost.yandex.ru/')
    assert.equal(keepVisible(g, isTelemost), true)
    g.hostWebContents.emit(HOST_EVENT, 'hidden')
    await tick()
    assert.deepEqual(g.sent, [[CHANNEL, 'visible']])
})

test('other messengers keep the real state', async () => {
    const g = guest('https://web.telegram.org/k/')
    keepVisible(g, isTelemost)
    g.hostWebContents.emit(HOST_EVENT, 'hidden')
    await tick()
    assert.deepEqual(g.sent, [])
})

test('a page loading while the window is hidden is told «visible» too, and nothing is sent when it is visible', async () => {
    const g = guest('https://telemost.yandex.ru/')
    keepVisible(g, isTelemost)
    g.hostWebContents.emit(HOST_EVENT, 'visible')
    await tick()
    assert.deepEqual(g.sent, [])
    g.emit('dom-ready')
    assert.deepEqual(g.sent, [[CHANNEL, 'visible']])
})

test('the listener on the window goes away with the page', () => {
    const g = guest('https://telemost.yandex.ru/')
    keepVisible(g, isTelemost)
    assert.equal(g.hostWebContents.listenerCount(HOST_EVENT), 1)
    g.emit('destroyed')
    assert.equal(g.hostWebContents.listenerCount(HOST_EVENT), 0)
})

test('without the internal channel nothing is hooked', () => {
    const g = guest('https://telemost.yandex.ru/')
    delete g._sendInternal
    assert.equal(keepVisible(g, isTelemost), false)
})
