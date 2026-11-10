'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildTimeline, signature } = require('../renderer/all-inbox/timeline')

const NOW = new Date(2026, 10, 10, 16, 30).getTime()
const at = (d, h) => new Date(2026, 10, d, h).getTime()

test('day separators appear where the day changes (Telegram gives exact times)', () => {
    const rows = buildTimeline([
        { id: '1', at: at(9, 10), text: 'вчера утром', out: false },
        { id: '2', at: at(9, 18), text: 'вчера вечером', out: true, read: true },
        { id: '3', at: at(10, 9), text: 'сегодня', out: false },
        { id: '4', at: at(3, 9), text: 'давно', out: false }
    ], NOW)
    assert.deepEqual(rows.map((r) => r.type === 'day' ? r.label : r.text), ['Вчера', 'вчера утром', 'вчера вечером', 'Сегодня', 'сегодня', '3 ноября', 'давно'])
    assert.equal(rows[2].read, true)
})

test('MAX day capsules come through as separators', () => {
    const rows = buildTimeline([{ id: 'c1', kind: 'service', text: 'Сегодня' }, { id: 'a', text: 'Ок', time: '15:36' }], NOW)
    assert.deepEqual(rows.map((r) => r.type), ['day', 'msg'])
})

test('empty text messages are skipped, media without text stays, unknown kinds become text', () => {
    const rows = buildTimeline([
        { id: '1', text: '   ' },
        { id: '2', kind: 'photo', media: 'data:image/jpeg;base64,AAA' },
        { id: '3', kind: 'weird', text: 'hi' },
        { id: '4', kind: 'photo', media: 'javascript:alert(1)' },
        null
    ], NOW)
    assert.deepEqual(rows.map((r) => r.id), ['2', '3', '4'])
    assert.equal(rows[1].kind, 'text')
    assert.equal(rows[2].media, '') // only pictures and https are drawn
})

test('the signature changes when a message is read or a new one comes', () => {
    const a = buildTimeline([{ id: '1', text: 'x', out: true }], NOW)
    const b = buildTimeline([{ id: '1', text: 'x', out: true, read: true }], NOW)
    const c = buildTimeline([{ id: '1', text: 'x', out: true }, { id: '2', text: 'y' }], NOW)
    assert.notEqual(signature(a), signature(b))
    assert.notEqual(signature(a), signature(c))
    assert.equal(signature(a), signature(buildTimeline([{ id: '1', text: 'x', out: true }], NOW)))
})

test('a photo keeps the key its page uses to give the picture in full size', () => {
    const rows = buildTimeline([{ id: '7', kind: 'photo', media: 'data:image/jpeg;base64,AA', picture: 'tg7', at: NOW }], NOW)
    const msg = rows.find((r) => r.type === 'msg')
    assert.equal(msg.picture, 'tg7')
    const plain = buildTimeline([{ id: '8', kind: 'text', text: 'Привет', at: NOW }], NOW).find((r) => r.type === 'msg')
    assert.equal(plain.picture, '')
})

test('messages in a row from the same person make one group: the name only on the first', () => {
    const rows = buildTimeline([
        { id: '1', at: at(10, 9), text: 'a', author: 'Андрей' },
        { id: '2', at: at(10, 9), text: 'b', author: 'Андрей' },
        { id: '3', at: at(10, 9), text: 'c', author: 'Anna' },
        { id: '4', at: at(10, 9), text: 'd', out: true },
        { id: '5', at: at(10, 10), text: 'e', out: true }
    ], NOW).filter((r) => r.type === 'msg')
    assert.deepEqual(rows.map((r) => r.groupStart), [true, false, true, true, false])
    assert.deepEqual(rows.map((r) => r.groupEnd), [false, true, true, false, true])
})

test('a message without a name under one from the same side continues that group (Telegram leaves names off)', () => {
    const rows = buildTimeline([
        { id: '1', at: at(10, 9), text: 'a', author: 'Андрей' },
        { id: '2', at: at(10, 9), text: 'b' },
        { id: '3', at: at(10, 9), text: 'c', author: 'Anna' }
    ], NOW).filter((r) => r.type === 'msg')
    assert.deepEqual(rows.map((r) => r.groupStart), [true, false, true])
})
