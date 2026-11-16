const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanItems, pickToShow, markSeen, hatItem, safeLink } = require('../renderer/announcements-logic')

const a = { id: 'a1', version: '2026-11-17T10:00:00.000Z', title: 'Скидка', body: 'Текст', imageUrl: '', button: null, promoCode: '', theme: 'plain', logoStyle: 'none' }
const b = { ...a, id: 'b2', version: '2026-11-17T11:00:00.000Z', logoStyle: 'santa' }

test('only well-formed windows from the server are kept', () => {
    const items = cleanItems([a, null, { id: 5 }, { id: 'x', title: '' }, 'text', { ...b, button: { label: 'Go', action: 'link', url: 'javascript:alert(1)' } }])
    assert.deepEqual(items.map((i) => i.id), ['a1', 'b2'])
    assert.equal(items[1].button, null)
})

test('an address that is not https is never a link', () => {
    assert.equal(safeLink('https://centrio.me/x'), 'https://centrio.me/x')
    for (const bad of ['javascript:alert(1)', 'http://a.ru', 'file:///c:/a', '', null, 'data:text/html,x']) assert.equal(safeLink(bad), '')
})

test('the first window not yet closed is the one that pops up', () => {
    assert.equal(pickToShow([a, b], {}).id, 'a1')
    assert.equal(pickToShow([a, b], { a1: a.version }).id, 'b2')
    assert.equal(pickToShow([a, b], { a1: a.version, b2: b.version }), null)
})

test('a window the owner changed pops up again for the people who closed the old one', () => {
    assert.equal(pickToShow([a], { a1: '2026-11-01T00:00:00.000Z' }).id, 'a1')
})

test('closing a window is remembered without touching the others', () => {
    const seen = markSeen({ z9: 'v' }, a)
    assert.deepEqual(seen, { z9: 'v', a1: a.version })
})

test('the old closed windows are forgotten when they are gone from the server', () => {
    const seen = markSeen({ gone: 'v', a1: 'old' }, a, [a])
    assert.deepEqual(seen, { a1: a.version })
})

test('the logo gets its hat from a window that asks for it, the newest one', () => {
    assert.equal(hatItem([a]), null)
    assert.equal(hatItem([a, b]).id, 'b2')
    assert.equal(hatItem([]), null)
})
