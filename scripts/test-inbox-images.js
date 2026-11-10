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

test('avatars and album pictures cross once too, each under its own key', () => {
    const cache = new Map()
    resolveImages([{ id: '1', avatar: 'data:image/jpeg;base64,AV', avatarKey: 'g42', album: [{ key: 'm1_0', src: 'data:image/jpeg;base64,P0' }] }], cache)
    const out = resolveImages([{ id: '2', avatar: '@g42', avatarKey: 'g42', album: [{ key: 'm1_0', src: '@m1_0' }, { key: 'm1_1', src: '@m1_1' }] }], cache)
    assert.equal(out[0].avatar, 'data:image/jpeg;base64,AV')
    assert.equal(out[0].album[0].src, 'data:image/jpeg;base64,P0')
    assert.equal(out[0].album[1].src, '')
})

test('the page side swaps a picture it already sent for its key, the second time only', () => {
    const memo = new Function('window', 'return ' + withImageMemo('({ messages: [{ id: "1", media: "data:image/png;base64,AA", avatar: "data:image/png;base64,GG", avatarKey: "g7", album: [{ key: "m1_0", src: "data:image/png;base64,PP" }] }] })', 's1'))
    const win = {}
    const first = memo(win).messages[0]
    assert.equal(first.media.startsWith('data:'), true)
    const second = memo(win).messages[0]
    assert.deepEqual([second.media, second.avatar, second.album[0].src], ['@m1', '@g7', '@m1_0'])
})

test('the picture of a link preview crosses once too', () => {
    const cache = new Map()
    resolveImages([{ id: '5', webpage: { title: 'T', image: 'data:image/jpeg;base64,W' } }], cache)
    const out = resolveImages([{ id: '5', webpage: { title: 'T', image: '@w5' } }], cache)
    assert.equal(out[0].webpage.image, 'data:image/jpeg;base64,W')
})
