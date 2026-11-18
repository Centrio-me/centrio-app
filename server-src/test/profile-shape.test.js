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
