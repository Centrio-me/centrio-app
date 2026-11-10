'use strict'
// «Все мессенджеры»: links in a message are clickable, everything else stays plain text
const test = require('node:test')
const assert = require('node:assert/strict')
const { linkParts } = require('../renderer/all-inbox/linkify')

test('text without links is one plain part', () => {
    assert.deepEqual(linkParts('Привет, как дела?'), [{ text: 'Привет, как дела?' }])
})

test('a link in the middle, with the punctuation after it left as text', () => {
    assert.deepEqual(linkParts('Смотри https://centrio.me/blog, там всё.'), [
        { text: 'Смотри ' },
        { text: 'https://centrio.me/blog', url: 'https://centrio.me/blog' },
        { text: ', там всё.' }
    ])
})

test('www and t.me addresses get https', () => {
    assert.deepEqual(linkParts('www.ozon.ru'), [{ text: 'www.ozon.ru', url: 'https://www.ozon.ru' }])
    assert.deepEqual(linkParts('t.me/centrio_bot'), [{ text: 't.me/centrio_bot', url: 'https://t.me/centrio_bot' }])
})

test('a link inside brackets keeps its own closing bracket out', () => {
    assert.deepEqual(linkParts('(https://ya.ru)'), [{ text: '(' }, { text: 'https://ya.ru', url: 'https://ya.ru' }, { text: ')' }])
})

test('other schemes are never links', () => {
    assert.deepEqual(linkParts('javascript:alert(1) file:///c:/x'), [{ text: 'javascript:alert(1) file:///c:/x' }])
})

test('empty text has no parts', () => {
    assert.deepEqual(linkParts(''), [])
    assert.deepEqual(linkParts(null), [])
})
