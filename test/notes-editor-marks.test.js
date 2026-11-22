const test = require('node:test')
const assert = require('node:assert/strict')
const { marksFromNode, toEditorHtml } = require('../renderer/notes-format')

// Oleg 2026-11-22: a note with formatting showed its «**» and «++» marks while it was edited. The editor now shows the formatting
// as it is typed, and gives the note back as the same plain marks (so the site, the phone and older notes read it as before).
const text = (value) => ({ nodeType: 3, nodeValue: value, nodeName: '#text', childNodes: [] })
const el = (name, ...kids) => ({ nodeType: 1, nodeName: name.toUpperCase(), childNodes: kids, get lastChild() { return kids[kids.length - 1] || null } })
const root = (...kids) => el('div', ...kids)

test('bold, italic, underline and strikethrough become our marks', () => {
    assert.equal(marksFromNode(root(text('a '), el('b', text('bold')), text(' '), el('i', text('it')), text(' '), el('u', text('un')), text(' '), el('s', text('st')))), 'a **bold** *it* ++un++ ~~st~~')
    assert.equal(marksFromNode(root(el('strong', text('x')), el('em', text('y')), el('strike', text('z')))), '**x***y*~~z~~')
})

test('line breaks and blocks become new lines; an empty last line is not doubled', () => {
    assert.equal(marksFromNode(root(text('one'), el('br'), text('two'))), 'one\ntwo')
    assert.equal(marksFromNode(root(text('one'), el('div', text('two')), el('div', text('three')))), 'one\ntwo\nthree')
    // the browser keeps a last <br> so that an empty last line can be typed in: it is not a line of its own
    assert.equal(marksFromNode(root(text('one'), el('br'))), 'one')
    assert.equal(marksFromNode(root(text('one'), el('br'), el('br'))), 'one\n')
})

test('spaces inside a mark go outside it, so the pair still reads as a pair', () => {
    assert.equal(marksFromNode(root(el('b', text(' word ')), text('end'))), ' **word** end')
    assert.equal(marksFromNode(root(el('b', text('  ')))), '  ')
})

test('a non-breaking space is a space', () => {
    assert.equal(marksFromNode(root(text('a b'))), 'a b')
})

test('the editor shows a text with its formatting; a last empty line gets a place to be typed in', () => {
    assert.equal(toEditorHtml('a **b** c'), 'a <b>b</b> c')
    assert.equal(toEditorHtml('x\ny'), 'x<br>y')
    assert.equal(toEditorHtml('x\n'), 'x<br><br>')
    assert.equal(toEditorHtml('<script>1</script>'), '&lt;script&gt;1&lt;/script&gt;')
    assert.equal(toEditorHtml(''), '')
})

test('a text round-trips through the editor unchanged', () => {
    for (const t of ['plain', 'a **b** c ++u++ ~~s~~ *i*', 'one\ntwo\n\nfour', 'line\n']) {
        const html = toEditorHtml(t)
        const parts = html.split(/(<\/?[a-z]+>)/).filter(Boolean)
        const kids = []
        const stack = [kids]
        for (const p of parts) {
            const open = /^<([a-z]+)>$/.exec(p)
            const close = /^<\/([a-z]+)>$/.exec(p)
            if (open && open[1] === 'br') stack[stack.length - 1].push(el('br'))
            else if (open) { const e = el(open[1]); e.childNodes.length = 0; const k = []; stack.push(k); stack[stack.length - 1].open = open[1] }
            else if (close) { const k = stack.pop(); stack[stack.length - 1].push(el(close[1], ...k)) }
            else stack[stack.length - 1].push(text(p.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')))
        }
        assert.equal(marksFromNode(root(...kids)), t)
    }
})
