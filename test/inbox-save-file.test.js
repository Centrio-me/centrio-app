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

// Oleg 2026-11-23: «в максе не открываются пдфы, в тг ок» — a name the page gave with no extension kept a PDF out of the reader
test('a PDF whose name has no extension gets ".pdf" from its type, so the reader takes it', () => {
    const data = `data:application/pdf;base64,${b64('%PDF-1.4')}`
    assert.equal(parseFilePayload({ data, name: 'Сертификат' }).name, 'Сертификат.pdf')
    assert.equal(parseFilePayload({ data, name: 'Сертификат.pdf' }).name, 'Сертификат.pdf')
    assert.equal(parseFilePayload({ data, name: 'report v2.final' }).name, 'report v2.final')
})

test('a name with an extension is never changed by the type; other types keep their names', () => {
    assert.equal(parseFilePayload({ data: `data:application/pdf;base64,${b64('x')}`, name: 'doc.bin' }).name, 'doc.bin')
    assert.equal(parseFilePayload({ data: `data:application/zip;base64,${b64('x')}`, name: 'archive' }).name, 'archive')
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

test('names Windows reserves are not offered as they are', () => {
    const { safeName } = require('../main/services/inboxSaveFile')
    assert.equal(safeName('CON'), '_CON')
    assert.equal(safeName('nul.txt'), '_nul.txt')
    assert.equal(safeName('COM1.pdf'), '_COM1.pdf')
    assert.equal(safeName('LPT9'), '_LPT9')
    assert.equal(safeName('console.txt'), 'console.txt')
})

test('a name does not end with a dot or a space', () => {
    const { safeName } = require('../main/services/inboxSaveFile')
    assert.equal(safeName('report.pdf. '), 'report.pdf')
    assert.equal(safeName('a...'), 'a')
})

const { autoSavePath } = require('../main/services/inboxSaveFile')

test('with a folder chosen and «ask» off, the file goes straight there', () => {
    const p = autoSavePath({ askDownload: false, downloadDir: 'C:\Загрузки', name: 'Счёт.pdf', exists: () => false })
    assert.equal(p, require('path').join('C:\Загрузки', 'Счёт.pdf'))
})

test('when «ask» is on or no folder is chosen, the person is asked (no automatic path)', () => {
    assert.equal(autoSavePath({ askDownload: true, downloadDir: 'C:\Загрузки', name: 'a.pdf', exists: () => false }), null)
    assert.equal(autoSavePath({ askDownload: false, downloadDir: '', name: 'a.pdf', exists: () => false }), null)
    assert.equal(autoSavePath({ askDownload: undefined, downloadDir: 'C:/x', name: 'a.pdf', exists: () => false }), null)
})

test('a file that is already there is not overwritten: a number is added', () => {
    const taken = new Set([require('path').join('D', 'a.pdf'), require('path').join('D', 'a (1).pdf')])
    const p = autoSavePath({ askDownload: false, downloadDir: 'D', name: 'a.pdf', exists: (f) => taken.has(f) })
    assert.equal(p, require('path').join('D', 'a (2).pdf'))
})

test('a file saved from a conversation becomes a finished entry of the downloads list', () => {
    const { savedRecord } = require('../main/services/inboxSaveFile')
    const r = savedRecord({ name: 'Договор.pdf', filePath: 'D:\Загрузки\Договор.pdf', size: 2048, now: 1000, id: 'x1' })
    assert.deepEqual(r, {
        id: 'x1', filename: 'Договор.pdf', url: '', savePath: 'D:\Загрузки\Договор.pdf',
        totalBytes: 2048, receivedBytes: 2048, state: 'completed', startTime: 1000, endTime: 1000
    })
})
