const test = require('node:test')
const assert = require('node:assert/strict')
const { stepAfterServices, stepAfterLogin } = require('../renderer/onboarding-flow')

test('without an account the services step leads to the account step, not into the app', () => {
    assert.equal(stepAfterServices({ loggedIn: false }), 'auth')
})

test('a person already signed in goes straight to the PRO gift', () => {
    assert.equal(stepAfterServices({ loggedIn: true }), 'trial')
})

test('after signing in a team member leaves the wizard, everyone else gets the PRO gift', () => {
    assert.equal(stepAfterLogin({ inTeam: true, fromServices: true }), 'leave')
    assert.equal(stepAfterLogin({ inTeam: false, fromServices: true }), 'trial')
})

test('signing in from "I already have an account" before choosing services goes back to choosing them', () => {
    assert.equal(stepAfterLogin({ inTeam: false, fromServices: false }), 'services')
})
