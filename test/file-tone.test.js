const test = require('node:test')
const assert = require('node:assert/strict')
const { fileTone } = require('../shared/file-tone')

// Oleg 2026-11-22: the web versions show a PDF red and an Excel file green; «Все мессенджеры» showed one plain icon for every file.
test('a file gets the colour and the short label of its type', () => {
    assert.deepEqual(fileTone('Счёт.pdf'), { tone: 'pdf', label: 'PDF' })
    assert.deepEqual(fileTone('таблица.XLSX'), { tone: 'sheet', label: 'XLSX' })
    assert.deepEqual(fileTone('a.csv'), { tone: 'sheet', label: 'CSV' })
    assert.deepEqual(fileTone('договор.doc'), { tone: 'doc', label: 'DOC' })
    assert.deepEqual(fileTone('slides.pptx'), { tone: 'slides', label: 'PPTX' })
    assert.deepEqual(fileTone('a.b.zip'), { tone: 'zip', label: 'ZIP' })
    assert.deepEqual(fileTone('movie.mp4'), { tone: 'other', label: 'MP4' })
    assert.deepEqual(fileTone('noext'), { tone: 'other', label: '' })
    assert.deepEqual(fileTone(undefined), { tone: 'other', label: '' })
})
