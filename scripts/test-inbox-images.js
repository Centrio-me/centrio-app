'use strict'
// «Все мессенджеры»: a picture crosses from the tab once; later reads send only a reference to it
const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveImages, withImageMemo } = require('../renderer/all-inbox/chat-adapters')

test('a picture sent before is taken from what we already have', () => {
    const cache = new Map()
    const first = resolveImages([{ id: '1', media: 'data:image/jpeg;base64,AAA' }, { id: '2', text: 'hi' }], cache)
    assert.equal(first[0].media, 'data:image/jpeg;base64,AAA')
    const again = resolveImages([{ id: '1', media: '@m1' }], cache)
    assert.equal(again[0].media, 'data:image/jpeg;base64,AAA')
})

test('a reference to a picture we never got leaves the message without it, never a broken link', () => {
    const out = resolveImages([{ id: '9', media: '@m9' }], new Map())
    assert.equal(out[0].media, '')
})

test('web addresses pass as they are and messages are not changed in place', () => {
    const msg = { id: '3', media: 'https://st.max.ru/a.webp' }
    const out = resolveImages([msg], new Map())
    assert.equal(out[0].media, 'https://st.max.ru/a.webp')
    const ref = { id: '1', media: '@m1' }
    resolveImages([ref], new Map([['m1', 'data:image/png;base64,B']]))
    assert.equal(ref.media, '@m1')
})

test('the page script wraps the chat reading and names the session', () => {
    const code = withImageMemo('(function(){return {messages:[]}})()', 'abc')
    assert.match(code, /"abc"/)
    assert.doesNotThrow(() => new Function('return ' + code))
})
