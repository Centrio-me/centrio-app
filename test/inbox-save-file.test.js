'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseFilePayload, MAX_FILE_BYTES } = require('../main/services/inboxSaveFile')

const b64 = (s) => Buffer.from(s).toString('base64')

test('a file given as a data address is turned into its bytes and a safe name', () => {
    const r = parseFilePayload({ data: `data:application/pdf;base64,${b64('hello')}`, name: 'Счёт №5.pdf' })
    assert.equal(r.bytes.toString(), 'hello')
    assert.equal(r.name, 'Счёт №5.pdf')
})

test('characters a file name must not hold are replaced, a path is never kept', () => {
    const r = parseFilePayload({ data: `data:text/plain;base64,${b64('x')}`, name: '..\..\Windows\evil:name?.txt' })
    assert.ok(!/[\/:*?"<>|]/.test(r.name))
    assert.ok(!r.name.startsWith('.'))
    assert.ok(r.name.endsWith('.txt'))
})

test('an empty or missing name becomes «Файл»', () => {
    assert.equal(parseFilePayload({ data: `data:text/plain;base64,${b64('x')}`, name: '   ' }).name, 'Файл')
    assert.equal(parseFilePayload({ data: `data:text/plain;base64,${b64('x')}` }).name, 'Файл')
})

test('anything that is not a base64 data address is refused', () => {
    assert.equal(parseFilePayload({ data: 'https://example.com/a.pdf', name: 'a.pdf' }), null)
    assert.equal(parseFilePayload({ data: 'data:text/plain,hello', name: 'a.txt' }), null)
    assert.equal(parseFilePayload(null), null)
    assert.equal(parseFilePayload({ data: 42 }), null)
})

test('an empty file and a file over the limit are refused', () => {
    assert.equal(parseFilePayload({ data: 'data:text/plain;base64,', name: 'a.txt' }), null)
    const big = Buffer.alloc(MAX_FILE_BYTES + 1).toString('base64')
    assert.equal(parseFilePayload({ data: `data:application/zip;base64,${big}`, name: 'big.zip' }), null)
})

const { parsePicturePayload } = require('../main/services/inboxSaveFile')

test('a picture of a note is accepted as png, jpeg, webp or gif with its extension', () => {
    const r = parsePicturePayload({ src: `data:image/jpeg;base64,${b64('jpgbytes')}`, name: 'Заметка 1' })
    assert.equal(r.ext, 'jpg')
    assert.equal(r.bytes.toString(), 'jpgbytes')
    assert.equal(r.name, 'Заметка 1')
    assert.equal(parsePicturePayload({ src: `data:image/png;base64,${b64('x')}` }).ext, 'png')
    assert.equal(parsePicturePayload({ src: `data:image/webp;base64,${b64('x')}` }).ext, 'webp')
    assert.equal(parsePicturePayload({ src: `data:image/gif;base64,${b64('x')}` }).ext, 'gif')
})

test('anything that is not a picture data address is refused', () => {
    assert.equal(parsePicturePayload({ src: `data:text/html;base64,${b64('<script>')}` }), null)
    assert.equal(parsePicturePayload({ src: `data:image/svg+xml;base64,${b64('<svg/>')}` }), null)
    assert.equal(parsePicturePayload({ src: 'https://example.com/a.png' }), null)
    assert.equal(parsePicturePayload(null), null)
})

test('a picture over 30 MB is refused', () => {
    const big = Buffer.alloc(30 * 1024 * 1024 + 1).toString('base64')
    assert.equal(parsePicturePayload({ src: `data:image/png;base64,${big}` }), null)
})
