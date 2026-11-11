// The person's own schedule: work services go quiet outside work hours, personal ones during them.
const test = require('node:test')
const assert = require('node:assert/strict')
const { quietReason } = require('../shared/work-hours')

const schedule = { days: [1, 2, 3, 4, 5], start: '10:00', end: '19:00' }
// Wednesday 12 November 2026 in the computer's own time zone
const at = (hh, mm = 0, day = 11) => new Date(2026, 10, day, hh, mm)
const personal = { enabled: true, schedule, workIds: ['work'], personalIds: ['home'] }

test('a work service is quiet in the evening and heard during work hours', () => {
    assert.equal(quietReason({ id: 'work' }, { personal, now: at(21) }), 'personal')
    assert.equal(quietReason({ id: 'work' }, { personal, now: at(12) }), null)
})

test('a personal service is quiet during work hours and heard in the evening', () => {
    assert.equal(quietReason({ id: 'home' }, { personal, now: at(12) }), 'workTime')
    assert.equal(quietReason({ id: 'home' }, { personal, now: at(21) }), null)
})

test('a personal service is heard all weekend', () => {
    assert.equal(quietReason({ id: 'home' }, { personal, now: at(12, 0, 14) }), null)
})

test('a service in neither list is always heard', () => {
    assert.equal(quietReason({ id: 'other' }, { personal, now: at(12) }), null)
    assert.equal(quietReason({ id: 'other' }, { personal, now: at(23) }), null)
})

test('nothing is quiet while the schedule is switched off', () => {
    const off = { ...personal, enabled: false }
    assert.equal(quietReason({ id: 'home' }, { personal: off, now: at(12) }), null)
    assert.equal(quietReason({ id: 'work' }, { personal: off, now: at(21) }), null)
})

test('an old schedule without personalIds keeps working', () => {
    const old = { enabled: true, schedule, workIds: ['work'] }
    assert.equal(quietReason({ id: 'home' }, { personal: old, now: at(12) }), null)
    assert.equal(quietReason({ id: 'work' }, { personal: old, now: at(21) }), 'personal')
})
