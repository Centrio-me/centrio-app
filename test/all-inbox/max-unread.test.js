const test = require('node:test')
const assert = require('node:assert/strict')
const { MAX_UNREAD_HELPER } = require('../../renderer/all-inbox/adapters')

// the page script helper, run here with a stand-in for the row of MAX's chat list
const mxUnread = new Function(`${MAX_UNREAD_HELPER}; return __mxUnread`)()
const text = (e) => String((e && e.textContent) || '').trim()
const row = (counterText, cls = 'counter counter--themed') => ({
    querySelector: (sel) => (counterText === null ? null : (/counter/.test(sel) ? { textContent: counterText, className: cls } : null))
})

test('the number MAX draws in a round counter of the row is the unread count (Oleg, 3.9.1-beta.2: no counters in the list)', () => {
    assert.equal(mxUnread(row('18'), text), '18')
    assert.equal(mxUnread(row('1'), text), '1')
    assert.equal(mxUnread(row(' 19 '), text), '19')
})

test('big and rounded counters pass as MAX writes them', () => {
    assert.equal(mxUnread(row('99+'), text), '99+')
    assert.equal(mxUnread(row('1K'), text), '1K')
    assert.equal(mxUnread(row('1 204'), text), '1204')
})

test('a row without a counter, or with a counter that holds no number, has no unread', () => {
    assert.equal(mxUnread(row(null), text), 0)
    assert.equal(mxUnread(row(''), text), 0)
    assert.equal(mxUnread(row('Новое'), text), 0)
})
