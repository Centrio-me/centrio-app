const test = require('node:test')
const assert = require('node:assert/strict')
const { pageSizeInches, A4_INCHES } = require('../shared/docx-page')

test('A4 in CSS pixels becomes A4 in inches', () => {
    const size = pageSizeInches(794, 1123)
    assert.ok(Math.abs(size.width - 8.27) < 0.01)
    assert.ok(Math.abs(size.height - 11.7) < 0.02)
})

test('a landscape first page keeps its orientation', () => {
    const size = pageSizeInches(1123, 794)
    assert.ok(size.width > size.height)
})

test('a missing or absurd size falls back to A4', () => {
    assert.deepEqual(pageSizeInches(0, 0), A4_INCHES)
    assert.deepEqual(pageSizeInches(undefined, 500), A4_INCHES)
    assert.deepEqual(pageSizeInches(40, 40), A4_INCHES)
    assert.deepEqual(pageSizeInches(100000, 100000), A4_INCHES)
    assert.deepEqual(pageSizeInches(NaN, NaN), A4_INCHES)
})
