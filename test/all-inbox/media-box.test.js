const test = require('node:test')
const assert = require('node:assert/strict')
const { hasMediaBox } = require('../../renderer/all-inbox/message-shape')

test('a video whose size is known gets its picture box before the frame has come', () => {
    assert.equal(hasMediaBox({ kind: 'video', media: '', mediaW: 720, mediaH: 1280 }), true)
})

test('a video with no picture and no size stays a card (nothing to reserve)', () => {
    assert.equal(hasMediaBox({ kind: 'video', media: '', mediaW: 0, mediaH: 0 }), false)
})

test('a photo and a video with their picture are picture boxes', () => {
    assert.equal(hasMediaBox({ kind: 'photo', media: 'data:image/png;base64,AA' }), true)
    assert.equal(hasMediaBox({ kind: 'video', media: 'data:image/png;base64,AA' }), true)
})

test('a photo with no picture keeps its own "photo is loading" place, not the video box', () => {
    assert.equal(hasMediaBox({ kind: 'photo', media: '', mediaW: 400, mediaH: 300 }), false)
})

test('an album is always a picture box; a text is never one', () => {
    assert.equal(hasMediaBox({ kind: 'photo', album: [{}] }), true)
    assert.equal(hasMediaBox({ kind: 'text', media: 'x', mediaW: 10, mediaH: 10 }), false)
})
