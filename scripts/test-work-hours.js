const test = require('node:test')
const assert = require('node:assert/strict')
const { isWithinWorkHours, nextChange, normalizeSchedule, quietReason } = require('../shared/work-hours')

const WEEKDAYS = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }
const msk = (iso) => new Date(`${iso}+03:00`)
const TZ = 'Europe/Moscow'

test('inside and outside an ordinary working day', () => {
    assert.equal(isWithinWorkHours(WEEKDAYS, msk('2026-11-09T10:00:00'), TZ), true) // Monday
    assert.equal(isWithinWorkHours(WEEKDAYS, msk('2026-11-09T08:59:00'), TZ), false)
    assert.equal(isWithinWorkHours(WEEKDAYS, msk('2026-11-09T18:00:00'), TZ), false)
    assert.equal(isWithinWorkHours(WEEKDAYS, msk('2026-11-14T12:00:00'), TZ), false) // Saturday
})

test('a night shift belongs to the day it started', () => {
    const night = { days: [5], start: '22:00', end: '06:00' }
    assert.equal(isWithinWorkHours(night, msk('2026-11-13T23:00:00'), TZ), true) // Friday night
    assert.equal(isWithinWorkHours(night, msk('2026-11-14T05:00:00'), TZ), true) // Saturday early morning
    assert.equal(isWithinWorkHours(night, msk('2026-11-14T23:00:00'), TZ), false)
})

test('no schedule means always at work', () => {
    assert.equal(isWithinWorkHours(null, new Date(), TZ), true)
})

test('the next change is the start of the next working day', () => {
    const at = nextChange(WEEKDAYS, msk('2026-11-13T19:00:00'), TZ) // Friday evening
    assert.equal(at.toISOString(), msk('2026-11-16T09:00:00').toISOString()) // Monday 09:00
    const end = nextChange(WEEKDAYS, msk('2026-11-09T10:00:00'), TZ)
    assert.equal(end.toISOString(), msk('2026-11-09T18:00:00').toISOString())
})

test('a broken schedule is dropped, a good one is cleaned', () => {
    assert.equal(normalizeSchedule({ days: [], start: '09:00', end: '18:00' }), null)
    assert.equal(normalizeSchedule({ days: [1], start: '9', end: '18:00' }), null)
    assert.equal(normalizeSchedule({ days: [1], start: '09:00', end: '09:00' }), null)
    assert.deepEqual(normalizeSchedule({ days: [3, 1, 1, 9], start: '09:00', end: '18:00' }), { days: [1, 3], start: '09:00', end: '18:00' })
})

test('who stays quiet outside work hours: team messengers by the team schedule, chosen ones by the personal one', () => {
    const evening = msk('2026-11-09T20:00:00')
    const team = { schedule: WEEKDAYS, timeZone: TZ }
    const personal = { enabled: true, schedule: WEEKDAYS, workIds: ['w'] }
    assert.equal(quietReason({ id: 'org:1', orgAssigned: true }, { team, personal, now: evening, localTimeZone: TZ }), 'team')
    assert.equal(quietReason({ id: 'w' }, { team, personal, now: evening, localTimeZone: TZ }), 'personal')
    assert.equal(quietReason({ id: 'home' }, { team, personal, now: evening, localTimeZone: TZ }), null)
    assert.equal(quietReason({ id: 'w' }, { team, personal: { ...personal, enabled: false }, now: evening, localTimeZone: TZ }), null)
    const noon = msk('2026-11-09T12:00:00')
    assert.equal(quietReason({ id: 'org:1', orgAssigned: true }, { team, personal, now: noon, localTimeZone: TZ }), null)
})
