'use strict'
// «Все мессенджеры»: each messenger writes the time of the last message its own way; one sortable time for all.
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseListTime } = require('../shared/inbox-time')

// Tuesday 10 November 2026, 16:30 local time
const NOW = new Date(2026, 10, 10, 16, 30).getTime()
const at = (y, mo, d, h = 0, mi = 0) => new Date(y, mo, d, h, mi).getTime()

test('a clock time is today', () => {
    assert.equal(parseListTime('16:05', NOW), at(2026, 10, 10, 16, 5))
    assert.equal(parseListTime(' 9:07 ', NOW), at(2026, 10, 10, 9, 7))
})

test('a clock time later than now is yesterday', () => {
    assert.equal(parseListTime('23:10', NOW), at(2026, 10, 9, 23, 10))
})

test('yesterday in words', () => {
    assert.equal(parseListTime('Вчера', NOW), at(2026, 10, 9))
    assert.equal(parseListTime('yesterday', NOW), at(2026, 10, 9))
})

test('a weekday is the latest such day before today', () => {
    assert.equal(parseListTime('Пн', NOW), at(2026, 10, 9))
    assert.equal(parseListTime('Вс', NOW), at(2026, 10, 8))
    assert.equal(parseListTime('пятница', NOW), at(2026, 10, 6))
    assert.equal(parseListTime('Вт', NOW), at(2026, 10, 3))
})

test('a day and a month in words', () => {
    assert.equal(parseListTime('8 нояб.', NOW), at(2026, 10, 8))
    assert.equal(parseListTime('22 окт.', NOW), at(2026, 9, 22))
    assert.equal(parseListTime('8 ноября', NOW), at(2026, 10, 8))
    assert.equal(parseListTime('31 дек.', NOW), at(2025, 11, 31)) // later than today: last year
    assert.equal(parseListTime('16 дек. 2025', NOW), at(2025, 11, 16))
})

test('numeric dates', () => {
    assert.equal(parseListTime('10.11.2026', NOW), at(2026, 10, 10))
    assert.equal(parseListTime('16.12.25', NOW), at(2025, 11, 16))
    assert.equal(parseListTime('05.03', NOW), at(2026, 2, 5))
    assert.equal(parseListTime('9.01.22', NOW), at(2022, 0, 9))
})

test('anything else has no time', () => {
    assert.equal(parseListTime('', NOW), 0)
    assert.equal(parseListTime(null, NOW), 0)
    assert.equal(parseListTime('Черновик', NOW), 0)
})

const { formatListTime } = require('../shared/inbox-time')

test('an exact time is written the way chat lists do', () => {
    assert.equal(formatListTime(at(2026, 10, 10, 9, 5), NOW), '09:05')
    assert.equal(formatListTime(at(2026, 10, 9, 23, 0), NOW), 'Вчера')
    assert.equal(formatListTime(at(2026, 10, 6, 12, 0), NOW), 'Пт')
    assert.equal(formatListTime(at(2026, 9, 22, 12, 0), NOW), '22 окт.')
    assert.equal(formatListTime(at(2025, 11, 16, 12, 0), NOW), '16.12.2025')
    assert.equal(formatListTime(0, NOW), '')
})
