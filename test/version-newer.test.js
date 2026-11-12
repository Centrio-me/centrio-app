// The release workflow copies an ordinary release to the testers' channel only when it is newer than what they have
const test = require('node:test')
const assert = require('node:assert')
const { isNewer } = require('../scripts/version-newer.js')

test('a higher number is newer', () => {
    assert.strictEqual(isNewer('3.8.2', '3.8.1'), true)
    assert.strictEqual(isNewer('3.10.0', '3.9.9'), true)
    assert.strictEqual(isNewer('3.8.1', '3.8.2'), false)
})

test('a release is newer than its own test versions, a test version of the next release is newer than it', () => {
    assert.strictEqual(isNewer('3.8.1', '3.8.1-beta.3'), true)
    assert.strictEqual(isNewer('3.8.1-beta.3', '3.8.1'), false)
    assert.strictEqual(isNewer('3.8.2-beta.1', '3.8.1'), true)
})

test('test versions count by their number, the same version is not newer', () => {
    assert.strictEqual(isNewer('3.8.1-beta.10', '3.8.1-beta.9'), true)
    assert.strictEqual(isNewer('3.8.1', '3.8.1'), false)
})
