const test = require('node:test')
const assert = require('node:assert/strict')
const { typeLines } = require('../../renderer/all-inbox/typing')

function fakeTab() {
    const log = []
    return { log, insertText: (t) => log.push(['text', t]), sendInputEvent: (e) => log.push([e.type, e.keyCode, (e.modifiers || []).join('+')]) }
}

// Oleg 2026-11-22: a note sent on to a chat lost its paragraphs. Each line is typed on its own and a new line is Shift+Enter
// (what the messengers' own fields take), never a «\n» inside one inserted text.
test('lines are typed one by one with Shift+Enter between them; empty lines stay', async () => {
    const w = fakeTab()
    await typeLines(w, 'one\n\ntwo', async () => {})
    const texts = w.log.filter((e) => e[0] === 'text').map((e) => e[1])
    assert.deepEqual(texts, ['one', 'two'])
    const breaks = w.log.filter((e) => e[0] === 'keyDown')
    assert.equal(breaks.length, 2, 'two line breaks: after «one» and after the empty line')
    assert.ok(breaks.every((e) => e[1] === 'Return' && e[2] === 'shift'))
})

test('a text of one line has no key at all, and an empty text types nothing', async () => {
    const w = fakeTab()
    await typeLines(w, 'just words', async () => {})
    assert.deepEqual(w.log, [['text', 'just words']])
    const e = fakeTab()
    await typeLines(e, '', async () => {})
    assert.deepEqual(e.log, [])
})

test('Windows line ends count as one line break', async () => {
    const w = fakeTab()
    await typeLines(w, 'a\r\nb', async () => {})
    assert.deepEqual(w.log.filter((e) => e[0] === 'text').map((e) => e[1]), ['a', 'b'])
    assert.equal(w.log.filter((e) => e[0] === 'keyDown').length, 1)
})
