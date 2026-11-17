'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { applyFormat, toHtml, stripMarks } = require('../renderer/notes-format')

test('bold, italic, underline and strikethrough marks become the matching tags', () => {
    assert.equal(toHtml('a **b** c'), 'a <b>b</b> c')
    assert.equal(toHtml('a *b* c'), 'a <i>b</i> c')
    assert.equal(toHtml('a ++b++ c'), 'a <u>b</u> c')
    assert.equal(toHtml('a ~~b~~ c'), 'a <s>b</s> c')
})

test('marks may stand inside each other', () => {
    assert.equal(toHtml('**bold *and italic***'), '<b>bold <i>and italic</i></b>')
    assert.equal(toHtml('~~++both++~~'), '<s><u>both</u></s>')
})

test('everything else in the text is escaped, nothing the person typed becomes markup', () => {
    assert.equal(toHtml('<script>alert(1)</script> & "q"'), '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot;')
    assert.equal(toHtml('**<img src=x onerror=1>**'), '<b>&lt;img src=x onerror=1&gt;</b>')
})

test('new lines stay new lines', () => {
    assert.equal(toHtml('one\ntwo'), 'one<br>two')
})

test('lone stars, sums and code-like text are left alone', () => {
    assert.equal(toHtml('5 * 3 * 2'), '5 * 3 * 2')
    assert.equal(toHtml('C++ and C++'), 'C++ and C++')
    assert.equal(toHtml('a_b_c'), 'a_b_c')
    assert.equal(toHtml('**'), '**')
    assert.equal(toHtml('** not bold **'), '** not bold **')
})

test('stripMarks gives the plain words of a formatted text', () => {
    assert.equal(stripMarks('**Дела:** ~~сделано~~ ++важно++ *очень*'), 'Дела: сделано важно очень')
    assert.equal(stripMarks('5 * 3 * 2'), '5 * 3 * 2')
})

test('wrapping a selection puts the marks around it and keeps it selected', () => {
    const r = applyFormat('hello world', 6, 11, 'bold')
    assert.equal(r.text, 'hello **world**')
    assert.deepEqual([r.start, r.end], [8, 13])
})

test('with nothing selected a pair of marks is put at the cursor, the cursor between them', () => {
    const r = applyFormat('ab', 1, 1, 'strike')
    assert.equal(r.text, 'a~~~~b')
    assert.deepEqual([r.start, r.end], [3, 3])
})

test('the same mark again takes it off, both around the selection and inside it', () => {
    assert.equal(applyFormat('hello **world**', 8, 13, 'bold').text, 'hello world')
    assert.equal(applyFormat('hello **world**', 6, 15, 'bold').text, 'hello world')
})

test('italic is not taken for the half of a bold mark', () => {
    const r = applyFormat('**word**', 2, 6, 'italic')
    assert.equal(r.text, '***word***')
})

test('underline wraps with the plus marks', () => {
    assert.equal(applyFormat('abc', 0, 3, 'underline').text, '++abc++')
})

test('an unknown kind changes nothing', () => {
    const r = applyFormat('abc', 0, 3, 'rainbow')
    assert.equal(r.text, 'abc')
})

const { noteToText } = require('../renderer/notes-format')

test('a text note goes to a chat as its title and its words without marks', () => {
    assert.equal(noteToText({ type: 'TEXT', title: 'План', body: 'Купить **хлеб** и ~~молоко~~' }), 'План\n\nКупить хлеб и молоко')
    assert.equal(noteToText({ type: 'TEXT', title: '', body: 'только текст' }), 'только текст')
})

test('a list goes as lines with ticks, empty items left out', () => {
    const t = noteToText({ type: 'CHECKLIST', title: 'Магазин', items: [{ text: 'Хлеб', done: true }, { text: '  ', done: false }, { text: 'Сыр', done: false }] })
    assert.equal(t, 'Магазин\n\n☑ Хлеб\n☐ Сыр')
})

test('nothing in, nothing out', () => {
    assert.equal(noteToText(null), '')
    assert.equal(noteToText({ type: 'TEXT', title: '', body: '' }), '')
})

const { noteToMarkedText, marksForService } = require('../renderer/notes-format')

test('a note sent on keeps its marks until the chat is known', () => {
    assert.equal(noteToMarkedText({ type: 'TEXT', title: 'План', body: 'Купить **хлеб** и *молоко*' }), 'План\n\nКупить **хлеб** и *молоко*')
})

test('Telegram gets its own marks: bold, italic with two underscores, strikethrough; underline has none', () => {
    const t = marksForService('**жирный** *курсив* ++подчёркнутый++ ~~зачёркнутый~~', 'telegram')
    assert.equal(t, '**жирный** __курсив__ подчёркнутый ~~зачёркнутый~~')
})

test('WhatsApp gets its own marks: one star, underscore, tilde', () => {
    const t = marksForService('**жирный** *курсив* ++подчёркнутый++ ~~зачёркнутый~~', 'whatsapp')
    assert.equal(t, '*жирный* _курсив_ подчёркнутый ~зачёркнутый~')
})

test('a service that does not read marks gets the words without them', () => {
    for (const service of ['max', 'vk', 'instagram', 'unknown']) assert.equal(marksForService('**жирный** *курсив*', service), 'жирный курсив')
})

test('text that only looks like marks is left alone', () => {
    assert.equal(marksForService('5 * 3 * 2 и C++ and C++', 'telegram'), '5 * 3 * 2 и C++ and C++')
})

test('a checklist and an empty note are the same as before', () => {
    assert.equal(noteToMarkedText({ type: 'CHECKLIST', title: 'М', items: [{ text: 'Хлеб', done: true }] }), 'М\n\n☑ Хлеб')
    assert.equal(noteToMarkedText(null), '')
})
