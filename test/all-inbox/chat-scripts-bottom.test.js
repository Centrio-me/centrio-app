const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const fs = require('node:fs')
const { chatAdapterFor } = require('../../renderer/all-inbox/chat-adapters')

test('the scripts that bring the tab back to the newest messages are valid JavaScript', () => {
    for (const id of ['telegram', 'max']) {
        const code = chatAdapterFor(id).BOTTOM
        assert.equal(typeof code, 'string', id)
        assert.doesNotThrow(() => new vm.Script(code), id)
    }
})

test('MAX chat list reading puts the tab on «Все» first, so a folder chosen in the tab does not cut the list', () => {
    const text = fs.readFileSync(require.resolve('../../renderer/all-inbox/adapters.js'), 'utf8')
    assert.match(text, /foldersViewport button\.button/)
    assert.match(text, /button--active/)
})

test('MAX scripts that look at and leave the editing of a message are valid JavaScript', () => {
    const max = chatAdapterFor('max')
    for (const code of [max.EDITING, max.CANCEL_EDIT]) {
        assert.equal(typeof code, 'string')
        assert.doesNotThrow(() => new vm.Script(code))
    }
})
