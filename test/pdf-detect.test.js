const test = require('node:test')
const assert = require('node:assert/strict')
const { isPdfDownload, isPdfUrl } = require('../shared/pdf-detect')

test('a download is a PDF by its mime type or its file name', () => {
    assert.equal(isPdfDownload('x.bin', 'application/pdf'), true)
    assert.equal(isPdfDownload('x.bin', 'application/pdf; charset=binary'), true)
    assert.equal(isPdfDownload('Договор.PDF', ''), true)
    assert.equal(isPdfDownload('photo.png', 'image/png'), false)
    assert.equal(isPdfDownload('', ''), false)
})

test('a link is a PDF link only for http(s) addresses ending in .pdf', () => {
    assert.equal(isPdfUrl('https://site.ru/a/b.pdf?x=1#page=2'), true)
    assert.equal(isPdfUrl('https://site.ru/a/b.pdf.exe'), false)
    assert.equal(isPdfUrl('file:///C:/a.pdf'), false)
    assert.equal(isPdfUrl('javascript:alert(1)//.pdf'), false)
    assert.equal(isPdfUrl('nonsense'), false)
})
