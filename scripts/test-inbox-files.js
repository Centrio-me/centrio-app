'use strict'
// «Все мессенджеры»: only real files of a sane size and number are handed to a messenger tab
const test = require('node:test')
const assert = require('node:assert/strict')
const { checkFiles, MAX_FILES, MAX_FILE_BYTES } = require('../main/services/inboxFiles')

const disk = {
    'C:/a.jpg': { isFile: () => true, size: 1000 },
    'C:/b.pdf': { isFile: () => true, size: 2000 },
    'C:/folder': { isFile: () => false, size: 0 },
    'C:/huge.mkv': { isFile: () => true, size: MAX_FILE_BYTES + 1 }
}
const stat = (p) => { if (!disk[p]) throw new Error('ENOENT'); return disk[p] }

test('real files pass with their names and sizes', () => {
    assert.deepEqual(checkFiles(['C:/a.jpg', 'C:/b.pdf'], stat), [
        { path: 'C:/a.jpg', name: 'a.jpg', size: 1000 },
        { path: 'C:/b.pdf', name: 'b.pdf', size: 2000 }
    ])
})

test('folders, missing, relative and too large files are left out', () => {
    assert.deepEqual(checkFiles(['C:/folder', 'C:/none.txt', 'a.jpg', 'C:/huge.mkv', 42, null], stat), [])
})

test('the same file twice is sent once, and no more than the limit', () => {
    const many = Array.from({ length: MAX_FILES + 5 }, () => 'C:/a.jpg')
    assert.equal(checkFiles(many, stat).length, 1)
    const names = Array.from({ length: MAX_FILES + 5 }, (_, i) => `C:/f${i}.txt`)
    const all = (p) => ({ isFile: () => true, size: 1 })
    assert.equal(checkFiles(names, all).length, MAX_FILES)
})

test('anything that is not a list gives nothing', () => {
    assert.deepEqual(checkFiles('C:/a.jpg', stat), [])
    assert.deepEqual(checkFiles(undefined, stat), [])
})
