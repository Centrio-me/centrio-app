// «Все мессенджеры» is a PRO mode the person can switch off; on by default.
const test = require('node:test')
const assert = require('node:assert/strict')
const { accessOf, isEnabledIn } = require('../../renderer/all-inbox/access-rules')

test('the mode is on when nothing was ever saved', () => {
    assert.equal(isEnabledIn(undefined), true)
    assert.equal(isEnabledIn({}), true)
    assert.equal(isEnabledIn(null), true)
})

test('the mode is off only when the person switched it off', () => {
    assert.equal(isEnabledIn({ enabled: false }), false)
    assert.equal(isEnabledIn({ enabled: true }), true)
    assert.equal(isEnabledIn({ enabled: 'no' }), true)
})

test('a PRO person with the mode on can open it', () => {
    assert.equal(accessOf({ enabled: true, pro: true }), 'open')
})

test('without PRO the button stays and asks for PRO', () => {
    assert.equal(accessOf({ enabled: true, pro: false }), 'locked')
})

test('switched off, the button is gone whatever the plan', () => {
    assert.equal(accessOf({ enabled: false, pro: true }), 'hidden')
    assert.equal(accessOf({ enabled: false, pro: false }), 'hidden')
})
