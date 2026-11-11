'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTimeline } = require('../../renderer/all-inbox/timeline')

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0)
const msgs = (list) => buildTimeline(list, NOW).filter((r) => r.type === 'msg')

test('a file size shows the file, not Telegram\'s download progress', () => {
    const [row] = msgs([{ id: '1', kind: 'file', name: 'a.png', size: '0 Б / 25 КБ', at: NOW }])
    assert.equal(row.size, '25 КБ')
    const [plain] = msgs([{ id: '2', kind: 'file', name: 'b.pdf', size: '1.2 MB', at: NOW }])
    assert.equal(plain.size, '1.2 MB')
})

test('messages get a day divider and keep their order', () => {
    const rows = buildTimeline([{ id: '1', text: 'а', at: NOW - 1000 }, { id: '2', text: 'б', at: NOW }], NOW)
    assert.equal(rows[0].type, 'day')
    assert.deepEqual(rows.filter((r) => r.type === 'msg').map((r) => r.text), ['а', 'б'])
})

test('a Telegram album keeps the key of each picture, so it opens in full size', () => {
    const album = [{ src: 'data:image/png;base64,AA', picture: 'k1', x: 0, y: 0, w: 0.5, h: 1, ratio: 1 }, { src: 'data:image/png;base64,BB', picture: 'k2', x: 0.5, y: 0, w: 0.5, h: 1, ratio: 1 }]
    const [row] = msgs([{ id: '1', kind: 'photo', album, at: NOW }])
    assert.deepEqual(row.album.map((a) => a.picture), ['k1', 'k2'])
})

test('photos with only a clock time (MAX) a couple of minutes apart still become one album', () => {
    const p = (id, time) => ({ id, kind: 'photo', media: 'data:image/png;base64,' + id, out: true, time })
    const rows = msgs([p('1', '18:41'), p('2', '18:43'), p('3', '18:45'), p('4', '18:55')])
    assert.equal(rows.length, 2)
    assert.equal(rows[0].album.length, 3)
})
