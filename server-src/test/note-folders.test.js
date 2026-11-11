const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanFolderName, MAX_FOLDERS } = require('../src/lib/note-folders')

test('a folder name is trimmed, squeezed and cut to 60 characters', () => {
    assert.equal(cleanFolderName('  Работа   и   клиенты '), 'Работа и клиенты')
    assert.equal(cleanFolderName('x'.repeat(80)).length, 60)
})

test('an empty or non-text name is refused', () => {
    assert.equal(cleanFolderName('   '), '')
    assert.equal(cleanFolderName(null), '')
    assert.equal(cleanFolderName(42), '')
})

test('a person may keep a sensible number of folders', () => {
    assert.ok(MAX_FOLDERS >= 20 && MAX_FOLDERS <= 200)
})
