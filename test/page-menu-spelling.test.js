const test = require('node:test')
const assert = require('node:assert/strict')
const { perform, noteMisspelling, forgetMisspelling } = require('../main/services/pageContextMenu')

// Choosing a suggestion in Centrio's menu used to leave the typo as it was (Lucille, 2026-11-22: the word stayed selected, the text did
// not change). The menu is drawn in OUR window, so the click moves the keyboard focus out of the tab, and Chromium's replaceMisspelling
// works on the focused frame. The tab is focused first (like copy and paste); if the typo is still selected afterwards, the
// suggestion is typed over it.
function fakeGuest({ selection = '', id = 7 } = {}) {
    const calls = []
    const guest = {
        id,
        isDestroyed: () => false,
        focus: () => calls.push('focus'),
        replaceMisspelling: (word) => calls.push('replace:' + word),
        executeJavaScript: (code) => { calls.push('read-selection'); return Promise.resolve(selection) },
        insertText: (word) => calls.push('type:' + word)
    }
    return { guest, calls }
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 350))

test('a suggestion focuses the tab first and only then replaces the word', async () => {
    const { guest, calls } = fakeGuest({ selection: '' })
    assert.equal(perform(guest, 'replaceMisspelling', 'спасибо', 'ru'), true)
    await settle()
    assert.deepEqual(calls.slice(0, 2), ['focus', 'replace:спасибо'])
})

test('the suggestion is typed over the typo when Chromium left the typo selected', async () => {
    noteMisspelling(7, 'спсибо')
    const { guest, calls } = fakeGuest({ selection: 'спсибо', id: 7 })
    perform(guest, 'replaceMisspelling', 'спасибо', 'ru')
    await settle()
    assert.deepEqual(calls, ['focus', 'replace:спасибо', 'read-selection', 'type:спасибо'])
    forgetMisspelling(7)
})

test('nothing is typed a second time when Chromium already replaced the word', async () => {
    noteMisspelling(8, 'спсибо')
    const { guest, calls } = fakeGuest({ selection: '', id: 8 })
    perform(guest, 'replaceMisspelling', 'спасибо', 'ru')
    await settle()
    assert.equal(calls.includes('type:спасибо'), false)
    forgetMisspelling(8)
})

test('a selection that is something else than the typo is never overwritten', async () => {
    noteMisspelling(9, 'спсибо')
    const { guest, calls } = fakeGuest({ selection: 'совсем другой текст', id: 9 })
    perform(guest, 'replaceMisspelling', 'спасибо', 'ru')
    await settle()
    assert.equal(calls.some((c) => c.startsWith('type:')), false)
    forgetMisspelling(9)
})

test('without a remembered typo only the focus and the replacement run (no guessing about the selection)', async () => {
    const { guest, calls } = fakeGuest({ selection: 'спсибо', id: 10 })
    perform(guest, 'replaceMisspelling', 'спасибо', 'ru')
    await settle()
    assert.deepEqual(calls, ['focus', 'replace:спасибо'])
})

test('a tab that has gone meanwhile is left alone', async () => {
    const { guest, calls } = fakeGuest({ id: 11 })
    guest.isDestroyed = () => true
    perform(guest, 'replaceMisspelling', 'спасибо', 'ru')
    await settle()
    assert.deepEqual(calls, ['focus'])
})

test('an empty or non-text suggestion does nothing', async () => {
    const { guest, calls } = fakeGuest({ id: 12 })
    perform(guest, 'replaceMisspelling', '', 'ru')
    perform(guest, 'replaceMisspelling', { word: 1 }, 'ru')
    await settle()
    assert.deepEqual(calls, [])
})
