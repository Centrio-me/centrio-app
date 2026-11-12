'use strict'
// node --test test/all-inbox
const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveImages, missingImages } = require('../../renderer/all-inbox/chat-adapters')

const PIC = 'data:image/jpeg;base64,AAAA'

test('a picture key we have is filled in', () => {
    const cache = new Map()
    resolveImages([{ id: '1', media: PIC }], cache)
    assert.equal(resolveImages([{ id: '1', media: '@m1' }], cache)[0].media, PIC)
})

test('a picture key we never got is reported, so the chat asks for its pictures again', () => {
    const cache = new Map([['m1', PIC]])
    assert.equal(missingImages([{ id: '1', media: '@m1' }], cache), false)
    assert.equal(missingImages([{ id: '2', media: '@m2' }], cache), true)
    assert.equal(missingImages([{ id: '3', album: [{ key: 'a', src: '@a' }] }], cache), true)
    assert.equal(missingImages([{ id: '4', avatar: '@x', avatarKey: 'x' }], cache), true)
    assert.equal(missingImages([{ id: '5', media: PIC }], cache), false)
})
