'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { openLink } = require('../../renderer/all-inbox/open-link')

const messenger = { id: 'tg1', name: 'Telegram', icon: 'tg.png', url: 'https://web.telegram.org/k/', zoomLevel: 1, forceDarkMode: false, secret: 'must not be passed on' }

function fakeIpc({ invokeResult = { success: true }, invokeThrows = false } = {}) {
    const calls = { invoke: [], send: [] }
    return {
        calls,
        invoke: async (...args) => { calls.invoke.push(args); if (invokeThrows) throw new Error('boom'); return invokeResult },
        send: (...args) => { calls.send.push(args) }
    }
}

test('a web link from a chat opens in a Centrio window of that messenger', async () => {
    const ipc = fakeIpc()
    await openLink({ url: 'https://youtu.be/abc', messenger, ipcRenderer: ipc })
    assert.equal(ipc.calls.invoke.length, 1)
    assert.equal(ipc.calls.invoke[0][0], 'detached:open-link')
    assert.deepEqual(ipc.calls.invoke[0][1], { id: 'tg1', name: 'Telegram', icon: 'tg.png', url: 'https://web.telegram.org/k/', zoomLevel: 1, forceDarkMode: false })
    assert.equal(ipc.calls.invoke[0][2], 'https://youtu.be/abc')
    assert.equal(ipc.calls.send.length, 0)
})

test('when the window cannot be opened the link goes to the browser as before', async () => {
    const ipc = fakeIpc({ invokeResult: { success: false, error: 'unknown_messenger' } })
    await openLink({ url: 'https://example.com/', messenger, ipcRenderer: ipc })
    assert.deepEqual(ipc.calls.send, [['open-url', 'https://example.com/']])
})

test('an error while opening the window also falls back to the browser', async () => {
    const ipc = fakeIpc({ invokeThrows: true })
    await openLink({ url: 'https://example.com/', messenger, ipcRenderer: ipc })
    assert.deepEqual(ipc.calls.send, [['open-url', 'https://example.com/']])
})

test('mail, phone and other schemes always go the usual way, never into a window', async () => {
    const ipc = fakeIpc()
    await openLink({ url: 'mailto:a@b.ru', messenger, ipcRenderer: ipc })
    await openLink({ url: 'tel:+79001112233', messenger, ipcRenderer: ipc })
    assert.equal(ipc.calls.invoke.length, 0)
    assert.equal(ipc.calls.send.length, 2)
})

test('without a known messenger the browser is used', async () => {
    const ipc = fakeIpc()
    await openLink({ url: 'https://example.com/', messenger: null, ipcRenderer: ipc })
    assert.equal(ipc.calls.invoke.length, 0)
    assert.deepEqual(ipc.calls.send, [['open-url', 'https://example.com/']])
})
