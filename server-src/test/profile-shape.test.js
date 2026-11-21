const test = require('node:test')
const assert = require('node:assert/strict')
const { withOrgSummary } = require('../src/lib/profile-shape')

test('the profile answer carries the team summary of a person who has a team', () => {
    const p = withOrgSummary({ id: 'u1', plan: 'PRO' }, { orgId: 'o1', orgRole: 'OWNER', orgState: 'active' })
    assert.equal(p.orgSummary.orgId, 'o1')
    assert.equal(p.id, 'u1')
})

test('a person without a team gets an explicit null, not a missing field', () => {
    const p = withOrgSummary({ id: 'u1' }, undefined)
    assert.ok('orgSummary' in p)
    assert.equal(p.orgSummary, null)
})

test('nothing to answer with stays nothing', () => {
    assert.equal(withOrgSummary(null, { orgId: 'o1' }), null)
})

const { withLoginShape } = require('../src/lib/profile-shape')

test('a login-only account shows its login instead of the stand-in address and says so', () => {
    const p = withLoginShape({ id: 'u1', email: 'ivan@login.centrio.invalid', login: 'ivan', emailVerified: true })
    assert.equal(p.email, 'ivan')
    assert.equal(p.loginOnly, true)
    assert.equal(p.login, 'ivan')
})

test('an account with a real email keeps it, and a login it once had stays visible', () => {
    const p = withLoginShape({ id: 'u1', email: 'a@b.ru', login: 'ivan' })
    assert.equal(p.email, 'a@b.ru')
    assert.equal(p.loginOnly, false)
    assert.equal(p.login, 'ivan')
    const q = withLoginShape({ id: 'u2', email: 'c@d.ru' })
    assert.equal(q.loginOnly, false)
    assert.equal(q.login, null)
    assert.equal(withLoginShape(null), null)
})
