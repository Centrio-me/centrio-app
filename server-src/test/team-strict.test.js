const test = require('node:test')
const assert = require('node:assert/strict')
const { defaultStrictForJoin } = require('../src/lib/team-strict')

test('people who join after the release date start in strict mode', () => {
    assert.equal(defaultStrictForJoin(new Date('2026-12-01T00:00:00Z'), '2026-11-20'), true)
})

test('before the release date, or with no date set, new people start without strict mode', () => {
    assert.equal(defaultStrictForJoin(new Date('2026-11-10T00:00:00Z'), '2026-11-20'), false)
    assert.equal(defaultStrictForJoin(new Date('2026-12-01T00:00:00Z'), undefined), false)
    assert.equal(defaultStrictForJoin(new Date('2026-12-01T00:00:00Z'), 'not a date'), false)
})
