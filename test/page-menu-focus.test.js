const test = require('node:test')
const assert = require('node:assert/strict')
const { perform } = require('../main/services/pageContextMenu')

// The menu of Centrio takes the keyboard focus from the tab. Copy, paste and the like must act on the TAB, like Ctrl+C / Ctrl+V
// do, so the tab is focused first and the command follows (a command sent while the focus sat in our window did nothing).
function fakeGuest() {
    const calls = []
    const guest = { isDestroyed: () => false }
    for (const name of ['focus', 'cut', 'copy', 'paste', 'pasteAndMatchStyle', 'selectAll', 'undo', 'redo']) guest[name] = () => calls.push(name)
    return { guest, calls }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 120))

for (const [action, command] of [['copy', 'copy'], ['cut', 'cut'], ['paste', 'paste'], ['pasteText', 'pasteAndMatchStyle'], ['selectAll', 'selectAll'], ['undo', 'undo'], ['redo', 'redo']]) {
    test(`«${action}» focuses the tab first and then runs the command, in that order`, async () => {
        const { guest, calls } = fakeGuest()
        assert.equal(perform(guest, action, null, 'ru'), true)
        await settle()
        assert.deepEqual(calls, ['focus', command])
    })
}

test('a command for a tab that has gone meanwhile is dropped quietly', async () => {
    const { guest, calls } = fakeGuest()
    guest.isDestroyed = () => true
    perform(guest, 'paste', null, 'ru')
    await settle()
    assert.deepEqual(calls, ['focus'])
})

test('actions that do not touch the tab\'s focus (reload, history) run at once', () => {
    const calls = []
    perform({ reload: () => calls.push('reload') }, 'reload', null, 'ru')
    assert.deepEqual(calls, ['reload'])
})
