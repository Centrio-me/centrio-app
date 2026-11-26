'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { saveChoices, saveKind } = require('../shared/reader-save')

// a client, 2026-11-26: «мне присылают ворд файл, а он из предпросмотрщика загружается только в пдф»
test('a Word file in the reader is offered back as Word first, then as PDF', () => {
    const c = saveChoices('Договор.docx', true)
    assert.equal(c.defaultName, 'Договор.docx')
    assert.deepEqual(c.filters.map((f) => f.extensions[0]), ['docx', 'pdf'])
})

test('a plain PDF is offered as PDF only, with the extension added when missing', () => {
    assert.equal(saveChoices('Счёт', false).defaultName, 'Счёт.pdf')
    assert.deepEqual(saveChoices('Счёт.pdf', false).filters.map((f) => f.extensions[0]), ['pdf'])
})

test('a name the reader made from a Word file (.pdf) is turned back into .docx for the Word choice', () => {
    assert.equal(saveChoices('Договор.pdf', true).defaultName, 'Договор.docx')
})

test('the file to be written is the original only when a .docx name was chosen and the original exists', () => {
    assert.equal(saveKind('C:\\x\\Договор.docx', true), 'original')
    assert.equal(saveKind('C:\\x\\Договор.DOCX', true), 'original')
    assert.equal(saveKind('C:\\x\\Договор.pdf', true), 'pdf')
    assert.equal(saveKind('C:\\x\\Договор.docx', false), 'pdf')
    assert.equal(saveKind('C:\\x\\Договор', true), 'pdf')
})
