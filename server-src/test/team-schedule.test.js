const test = require('node:test')
const assert = require('node:assert/strict')
const { isWithinWorkHours, localDay, shiftEndAt, parseSchedule } = require('../src/lib/team-schedule')

const WEEKDAYS = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
const NIGHT = { days: [1], start: '22:00', end: '06:00' }
const MSK = 'Europe/Moscow'

// 2026-11-10 is a Tuesday. Moscow is UTC+3.
test('09:00–18:00 Mon–Fri: Tuesday 10:00 Moscow is in hours', () => {
    assert.equal(isWithinWorkHours(WEEKDAYS, MSK, new Date('2026-11-10T07:00:00Z')), true)
})

test('before the start and after the end are out of hours', () => {
    assert.equal(isWithinWorkHours(WEEKDAYS, MSK, new Date('2026-11-10T05:59:00Z')), false)
    assert.equal(isWithinWorkHours(WEEKDAYS, MSK, new Date('2026-11-10T15:00:00Z')), false)
})

test('Saturday is out of hours', () => {
    assert.equal(isWithinWorkHours(WEEKDAYS, MSK, new Date('2026-11-14T08:00:00Z')), false)
})

test('a night shift starting Monday covers Tuesday 03:00', () => {
    assert.equal(isWithinWorkHours(NIGHT, MSK, new Date('2026-11-10T00:00:00Z')), true)
    assert.equal(isWithinWorkHours(NIGHT, MSK, new Date('2026-11-09T20:00:00Z')), true)
    assert.equal(isWithinWorkHours(NIGHT, MSK, new Date('2026-11-10T04:00:00Z')), false)
})

test('the same instant is judged in the team time zone', () => {
    // 2026-11-10T07:00Z is 10:00 in Moscow but 17:00 in Vladivostok (UTC+10) — both in hours,
    // 2026-11-10T09:00Z is 12:00 Moscow but 19:00 Vladivostok — out of hours there.
    assert.equal(isWithinWorkHours(WEEKDAYS, 'Asia/Vladivostok', new Date('2026-11-10T07:00:00Z')), true)
    assert.equal(isWithinWorkHours(WEEKDAYS, 'Asia/Vladivostok', new Date('2026-11-10T09:00:00Z')), false)
})

test('no schedule means always in hours', () => {
    assert.equal(isWithinWorkHours(null, MSK, new Date('2026-11-14T03:00:00Z')), true)
})

test('localDay uses the team time zone', () => {
    assert.equal(localDay(MSK, new Date('2026-11-10T22:30:00Z')), '2026-11-11')
    assert.equal(localDay('UTC', new Date('2026-11-10T22:30:00Z')), '2026-11-10')
})

test('shiftEndAt gives the end instant of a day shift and of a night shift', () => {
    assert.equal(shiftEndAt(WEEKDAYS, MSK, '2026-11-10').toISOString(), '2026-11-10T15:00:00.000Z')
    assert.equal(shiftEndAt(NIGHT, MSK, '2026-11-09').toISOString(), '2026-11-10T03:00:00.000Z')
})

test('parseSchedule accepts a valid body and rejects bad zones and times', () => {
    assert.deepEqual(parseSchedule({ timeZone: 'Europe/Moscow', workSchedule: { days: [5, 1, 1], start: '09:00', end: '18:00' } }),
        { timeZone: 'Europe/Moscow', workSchedule: { days: [1, 5], start: '09:00', end: '18:00' } })
    assert.deepEqual(parseSchedule({ timeZone: 'Europe/Moscow', workSchedule: null }), { timeZone: 'Europe/Moscow', workSchedule: null })
    assert.ok(parseSchedule({ timeZone: 'Mars/Base', workSchedule: null }).error)
    assert.ok(parseSchedule({ timeZone: 'Europe/Moscow', workSchedule: { days: [1], start: '25:00', end: '18:00' } }).error)
    assert.ok(parseSchedule({ timeZone: 'Europe/Moscow', workSchedule: { days: [8], start: '09:00', end: '18:00' } }).error)
    assert.ok(parseSchedule({ timeZone: 'Europe/Moscow', workSchedule: { days: [], start: '09:00', end: '18:00' } }).error)
})

const { teamScheduleOf } = require('../src/lib/team-schedule')

test('the team schedule comes from the existing alert work hours', () => {
    const on = { workHours: { enabled: true, from: '10:00', to: '19:00', days: [1, 2, 3] }, timezone: 'Asia/Yekaterinburg' }
    assert.deepEqual(teamScheduleOf(on), { schedule: { days: [1, 2, 3], start: '10:00', end: '19:00' }, timeZone: 'Asia/Yekaterinburg' })
    const off = { workHours: { enabled: false, from: '09:00', to: '18:00', days: [1] }, timezone: 'Europe/Moscow' }
    assert.deepEqual(teamScheduleOf(off), { schedule: null, timeZone: 'Europe/Moscow' })
    assert.deepEqual(teamScheduleOf(null), { schedule: null, timeZone: 'Europe/Moscow' })
})
