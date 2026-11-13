'use strict'
// node --test test/all-inbox
const test = require('node:test')
const assert = require('node:assert/strict')
const { toMessenger, wrapSelection, FORMATS } = require('../../renderer/all-inbox/text-format')

const TEXT = '**жирный** __курсив__ ~~зачёркнутый~~ ++подчёркнутый++'

test('Telegram gets its own markdown; underline has none and goes as plain text', () => {
    assert.equal(toMessenger(TEXT, 'telegram'), '**жирный** __курсив__ ~~зачёркнутый~~ подчёркнутый')
})

test('WhatsApp gets its single marks', () => {
    assert.equal(toMessenger(TEXT, 'whatsapp'), '*жирный* _курсив_ ~зачёркнутый~ подчёркнутый')
})

test('a messenger without such marks gets the plain words', () => {
    assert.equal(toMessenger(TEXT, 'vk'), 'жирный курсив зачёркнутый подчёркнутый')
})

test('text without marks is left as it is, two asterisks of arithmetic too', () => {
    assert.equal(toMessenger('2 ** 3 = 8', 'whatsapp'), '2 ** 3 = 8')
    assert.equal(toMessenger('просто текст', 'telegram'), 'просто текст')
})

test('the selection is wrapped in the mark, and the caret stays inside', () => {
    const r = wrapSelection('привет мир', 7, 10, FORMATS.bold)
    assert.equal(r.text, 'привет **мир**')
    assert.deepEqual([r.start, r.end], [9, 12])
})

test('a wrapped selection pressed again loses its mark', () => {
    const r = wrapSelection('привет **мир**', 9, 12, FORMATS.bold)
    assert.equal(r.text, 'привет мир')
    assert.deepEqual([r.start, r.end], [7, 10])
})

test('with nothing selected the marks are put around the caret', () => {
    const r = wrapSelection('а ', 2, 2, FORMATS.italic)
    assert.equal(r.text, 'а ____')
    assert.deepEqual([r.start, r.end], [4, 4])
})

test('the text is cut into runs, each with its marks, for typing with the messenger\'s own keys', () => {
    const { runsOf } = require('../../renderer/all-inbox/text-format')
    assert.deepEqual(runsOf('a **b __c__** d'), [
        { text: 'a ', marks: [] },
        { text: 'b ', marks: ['bold'] },
        { text: 'c', marks: ['bold', 'italic'] },
        { text: ' d', marks: [] }
    ])
    assert.deepEqual(runsOf('просто'), [{ text: 'просто', marks: [] }])
    assert.deepEqual(runsOf('2 ** 3'), [{ text: '2 ** 3', marks: [] }])
})

test('WhatsApp\'s own marks are read as bold, italic and strikethrough', () => {
    const { fromWhatsApp, runsOf } = require('../../renderer/all-inbox/text-format')
    const marked = fromWhatsApp('Проверка: *жирный* _курсив_ ~зачёркнутый~ 2*3=6')
    assert.equal(marked, 'Проверка: **жирный** __курсив__ ~~зачёркнутый~~ 2*3=6')
    assert.equal(runsOf(marked).map((r) => r.text).join(''), 'Проверка: жирный курсив зачёркнутый 2*3=6')
})

test('a marked text whose words differ from the plain text is not trusted', () => {
    const { markedFor } = require('../../renderer/all-inbox/text-format')
    assert.equal(markedFor('**а** б', 'а б'), '**а** б')
    assert.equal(markedFor('**а ** б', 'а б'), '')
    assert.equal(markedFor('а б', 'а б'), '')
})
