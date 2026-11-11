'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { galleryOf } = require('../../renderer/all-inbox/lightbox')

test('the gallery holds single photos and every photo of an album, oldest first', () => {
    const rows = [
        { type: 'day', label: 'Сегодня' },
        { type: 'msg', kind: 'photo', media: 'a', picture: 'ka', author: 'Оля', time: '10:00', out: false },
        { type: 'msg', kind: 'text', text: 'привет' },
        { type: 'msg', kind: 'photo', album: [{ src: 'b', picture: 'kb' }, { src: 'c', picture: '' }], time: '10:05', out: true }
    ]
    const g = galleryOf(rows)
    assert.deepEqual(g.map((x) => x.src), ['a', 'b', 'c'])
    assert.equal(g[0].author, 'Оля')
    assert.equal(g[1].author, '')
    assert.equal(g[1].out, true)
})

test('a file with a preview is not a photo of the gallery', () => {
    assert.deepEqual(galleryOf([{ type: 'msg', kind: 'file', media: 'x' }]), [])
})
