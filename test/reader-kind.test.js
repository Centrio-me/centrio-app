const test = require('node:test')
const assert = require('node:assert/strict')
const { readerKindForName } = require('../shared/reader-kind')

// Oleg 2026-11-22: a PDF clicked in «Все мессенджеры» was saved to the downloads list (ten clicks, ten entries) instead of being read in Centrio.
test('PDF, Word and picture files are read inside Centrio; anything else is saved as before', () => {
    assert.equal(readerKindForName('Счёт №5.PDF'), 'pdf')
    assert.equal(readerKindForName('договор.docx'), 'word')
    assert.equal(readerKindForName('photo.JPG'), 'image')
    assert.equal(readerKindForName('scan.png'), 'image')
    assert.equal(readerKindForName('table.xlsx'), null)
    assert.equal(readerKindForName('archive.zip'), null)
    assert.equal(readerKindForName(''), null)
    assert.equal(readerKindForName(undefined), null)
})
