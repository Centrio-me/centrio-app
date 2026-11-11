'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseImageDataUrl, safeId, MAX_IMAGE_BYTES } = require('../main/services/notesImages')

const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

test('a pasted picture becomes its kind and bytes', () => {
    const got = parseImageDataUrl(PNG_1PX)
    assert.equal(got.ext, 'png')
    assert.ok(Buffer.isBuffer(got.buffer) && got.buffer.length > 20)
})

test('jpeg, webp and gif are pictures too; anything else is refused', () => {
    assert.equal(parseImageDataUrl('data:image/jpeg;base64,AAAA').ext, 'jpg')
    assert.equal(parseImageDataUrl('data:image/webp;base64,AAAA').ext, 'webp')
    assert.equal(parseImageDataUrl('data:image/gif;base64,AAAA').ext, 'gif')
    assert.equal(parseImageDataUrl('data:image/svg+xml;base64,AAAA'), null)
    assert.equal(parseImageDataUrl('data:text/html;base64,AAAA'), null)
    assert.equal(parseImageDataUrl('https://x/y.png'), null)
    assert.equal(parseImageDataUrl(null), null)
})

test('a picture over the size limit is refused', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES + 10) * 4 / 3))
    assert.equal(parseImageDataUrl(big), null)
})

test('ids of notes and pictures cannot walk out of their folder', () => {
    assert.equal(safeId('3f2a-11ef_b'), '3f2a-11ef_b')
    assert.equal(safeId('../../etc'), '')
    assert.equal(safeId('a/b'), '')
    assert.equal(safeId(''), '')
    assert.equal(safeId('x'.repeat(100)), '')
})
