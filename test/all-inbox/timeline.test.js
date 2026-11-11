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

test('a shared contact keeps its name, phone and picture', () => {
    const [row] = msgs([{ id: '1', kind: 'contact', name: 'Жахонгир Нематов', phone: '+7 999 123-45-67', media: 'data:image/png;base64,AA', at: NOW }])
    assert.equal(row.kind, 'contact')
    assert.equal(row.name, 'Жахонгир Нематов')
    assert.equal(row.phone, '+7 999 123-45-67')
    assert.equal(row.media, 'data:image/png;base64,AA')
})

test('signature changes when a message changes without changing its length or id', () => {
    const { signature } = require('../../renderer/all-inbox/timeline')
    const base = { type: 'msg', id: '5', out: true, read: false, kind: 'photo', text: 'кот', media: 'data:image/jpeg;base64,PLACEHOLDER', size: '0 Б', duration: '', name: '', album: null, reactions: [] }
    const sig = signature([base])
    assert.notStrictEqual(signature([{ ...base, media: 'data:image/jpeg;base64,THE-REAL-PHOTO' }]), sig, 'the placeholder became the photo')
    assert.notStrictEqual(signature([{ ...base, text: 'кит' }]), sig, 'an edit of the same length')
    assert.notStrictEqual(signature([{ ...base, size: '25 КБ' }]), sig, 'the size came')
    assert.notStrictEqual(signature([{ ...base, duration: '0:29' }]), sig, 'the length came')
    assert.notStrictEqual(signature([{ ...base, album: [{ src: 'data:a' }, { src: 'data:b' }] }]), signature([{ ...base, album: [{ src: 'data:a' }, { src: 'data:c' }] }]), 'a photo of an album loaded')
})

test('a voice message keeps its waveform: given as values, or as Telegram packed bytes', () => {
    const rows = buildTimeline([
        { id: '1', kind: 'voice', wave: [0, 10, 31, 99, 'x'] },
        { id: '2', kind: 'voice', waveBytes: [0xff, 0x03] },
        { id: '3', kind: 'text', text: 'hi', wave: [5] }
    ], Date.now()).filter((r) => r.type === 'msg')
    assert.deepEqual(rows[0].wave, [0, 10, 31, 31])
    assert.deepEqual(rows[1].wave, [31, 31, 0])
    assert.deepEqual(rows[2].wave, [])
})

test('signature changes on a one-letter edit anywhere in a long text', () => {
    const { signature } = require('../../renderer/all-inbox/timeline')
    const long = 'а'.repeat(150) + 'б' + 'а'.repeat(150)
    const row = (text) => ({ type: 'msg', id: '7', kind: 'text', text, reactions: [] })
    for (let at = 0; at < long.length; at += 37) {
        const edited = long.slice(0, at) + 'в' + long.slice(at + 1)
        assert.notStrictEqual(signature([row(edited)]), signature([row(long)]), `edit at ${at}`)
    }
})
