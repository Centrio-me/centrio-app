const test = require('node:test')
const assert = require('node:assert/strict')
const { printOptions, isDuplexOn } = require('../shared/pdf-print')

test('duplex on asks the printer for both sides, long edge', () => {
    assert.deepEqual(printOptions(true), { printBackground: true, duplexMode: 'longEdge' })
})

test('duplex off leaves the printer to its own setting (no duplexMode at all)', () => {
    assert.deepEqual(printOptions(false), { printBackground: true })
    assert.equal('duplexMode' in printOptions(false), false)
})

test('a stored value is read strictly: only true switches duplex on', () => {
    assert.equal(isDuplexOn(true), true)
    for (const v of [false, undefined, null, 0, 1, 'true', 'yes', {}]) assert.equal(isDuplexOn(v), false)
})
