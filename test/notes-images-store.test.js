'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createNotesImages } = require('../main/services/notesImages')

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function store() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-img-'))
    // a stand-in for the real downscaling: marks the picture as a small copy
    const images = createNotesImages(dir, { thumb: () => 'data:image/jpeg;base64,THUMB' })
    return { dir, images }
}

test('the list of a note gives small copies, not the full pictures', async () => {
    const { images } = store()
    await images.save('n1', PNG_1PX)
    const list = await images.list('n1')
    assert.equal(list.length, 1)
    assert.equal(list[0].thumb, 'data:image/jpeg;base64,THUMB')
    assert.equal(list[0].dataUrl, undefined)
})

test('the full picture is given one at a time, on request', async () => {
    const { images } = store()
    const saved = await images.save('n1', PNG_1PX)
    assert.equal(await images.full('n1', saved.id), PNG_1PX)
    assert.equal(await images.full('n1', 'nope'), '')
})

test('a deleted note takes its pictures with it', async () => {
    const { dir, images } = store()
    await images.save('n1', PNG_1PX)
    await images.removeNote('n1')
    assert.equal(fs.existsSync(path.join(dir, 'n1')), false)
    assert.deepEqual(await images.list('n1'), [])
})
