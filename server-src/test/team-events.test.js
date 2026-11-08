// Run with: node --test server-src/test/
const test = require('node:test')
const assert = require('node:assert/strict')
const { emitOrgEvent, subscribeOrg, visibleTo, eventForAudit } = require('../src/lib/team-events')

test('audit actions map to live events for the right person', () => {
    assert.deepEqual(eventForAudit('messenger.assign', { userId: 'u1', name: 'WA' }), { type: 'assignments', data: { userId: 'u1' } })
    assert.deepEqual(eventForAudit('member.remove', { userId: 'u2' }), { type: 'member', data: { userId: 'u2' } })
    assert.deepEqual(eventForAudit('settings.update', { theme: 'dark' }), { type: 'settings', data: {} })
    assert.deepEqual(eventForAudit('vpn.update', { hasLink: true }), { type: 'settings', data: {} })
    assert.deepEqual(eventForAudit('quickReply.delete', null), { type: 'settings', data: {} })
    assert.deepEqual(eventForAudit('folder.delete', null), { type: 'structure', data: {} })
    assert.deepEqual(eventForAudit('task.create', { assigneeId: 'u3' }), { type: 'tasks', data: { userId: 'u3' } })
    assert.equal(eventForAudit('org.rename', { to: 'x' }), null)
    assert.equal(eventForAudit('member.invite', { email: 'a@b' }), null)
    // an employee's own autofill must not make every app in the team resync
    assert.equal(eventForAudit('credential.used', { name: 'WA' }), null)
})

test('delivers an event to subscribers of that org only', () => {
    const got = []
    const offA = subscribeOrg('org-a', (evt) => got.push(['a', evt.type]))
    const offB = subscribeOrg('org-b', (evt) => got.push(['b', evt.type]))
    emitOrgEvent('org-a', 'assignments', { userId: 'u1' })
    offA(); offB()
    assert.deepEqual(got, [['a', 'assignments']])
})

test('unsubscribe stops delivery', () => {
    let count = 0
    const off = subscribeOrg('org-c', () => { count++ })
    emitOrgEvent('org-c', 'settings')
    off()
    emitOrgEvent('org-c', 'settings')
    assert.equal(count, 1)
})

test('a throwing listener does not stop other listeners', () => {
    let reached = false
    const off1 = subscribeOrg('org-d', () => { throw new Error('boom') })
    const off2 = subscribeOrg('org-d', () => { reached = true })
    emitOrgEvent('org-d', 'member')
    off1(); off2()
    assert.equal(reached, true)
})

test('an event carries type, data and time', () => {
    let seen = null
    const off = subscribeOrg('org-e', (evt) => { seen = evt })
    emitOrgEvent('org-e', 'note', { userId: 'u2' })
    off()
    assert.equal(seen.type, 'note')
    assert.deepEqual(seen.data, { userId: 'u2' })
    assert.ok(seen.at instanceof Date)
})

test('a member sees only events for everyone or for himself, never presence', () => {
    const member = { userId: 'u1', role: 'MEMBER' }
    assert.equal(visibleTo({ type: 'assignments', data: { userId: 'u1' } }, member), true)
    assert.equal(visibleTo({ type: 'assignments', data: { userId: 'u2' } }, member), false)
    assert.equal(visibleTo({ type: 'settings', data: {} }, member), true)
    assert.equal(visibleTo({ type: 'presence', data: { userId: 'u1' } }, member), false)
})

test('owner and admin see every event', () => {
    for (const role of ['OWNER', 'ADMIN']) {
        assert.equal(visibleTo({ type: 'presence', data: { userId: 'u9' } }, { userId: 'x', role }), true)
        assert.equal(visibleTo({ type: 'command', data: { userId: 'u9' } }, { userId: 'x', role }), true)
    }
})
