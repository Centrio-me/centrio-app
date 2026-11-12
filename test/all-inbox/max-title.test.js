// MAX list rows: the chat's name is the row's first text that holds no other text; an unread counter is never a name
// (Oleg, 2026-11-12: MAX channels showed «3», «127» instead of their names and did not open on a click)
const test = require('node:test')
const assert = require('node:assert')
const { maxTitleOf } = require('../../renderer/all-inbox/max-title.js')

function node(className, text, children = []) {
    const n = { className, text, children, contains: (o) => o === n || children.some((c) => c.contains(o)) }
    n.querySelectorAll = (sel) => {
        const out = []
        const walk = (x) => { for (const c of x.children) { if (/(^|\s)text(\s|$)/.test(c.className)) out.push(c); walk(c) } }
        if (sel === '.text') walk(n)
        return out
    }
    n.querySelector = (sel) => n.querySelectorAll(sel)[0] || null
    return n
}
const textOf = (el) => (el ? el.text : '')

test('a plain chat row keeps its name', () => {
    const name = node('text text--16', 'Иван Ивонтьев')
    const cell = node('cell', '', [name, node('text', 'Привет'), node('time', '14:45')])
    assert.deepStrictEqual(maxTitleOf(cell, textOf), { el: name, title: 'Иван Ивонтьев' })
})

test('a channel whose name sits next to an icon is named, not numbered by its unread counter', () => {
    const name = node('text text--16', 'СВЕЖЕСТИ', [node('icon', '')])
    const cell = node('cell', '', [node('text text--20', '127'), name, node('time', '14:46')])
    assert.strictEqual(maxTitleOf(cell, textOf).title, 'СВЕЖЕСТИ')
})

test('a wrapper text that holds the name and the preview is not taken as the name', () => {
    const name = node('text', 'RT на русском')
    const wrap = node('text wrap', 'RT на русском С ювелирной точностью', [name, node('text', 'С ювелирной точностью')])
    const cell = node('cell', '', [wrap])
    assert.strictEqual(maxTitleOf(cell, textOf).title, 'RT на русском')
})

test('a row with nothing readable has no name', () => {
    assert.deepStrictEqual(maxTitleOf(node('cell', '', [node('text', '')]), textOf), { el: null, title: '' })
})
