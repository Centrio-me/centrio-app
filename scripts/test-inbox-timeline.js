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
