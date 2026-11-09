'use strict'
// The server gives an owner/admin EVERY assignment of the team (the website needs the full roster);
// the desktop app must add only the ones assigned to the signed-in person.
const test = require('node:test')
const assert = require('node:assert/strict')
const { ownAssignments } = require('../renderer/org-own-assignments')

const rows = [
    { id: 'a1', userId: 'owner', name: 'Telegram' },
    { id: 'a2', userId: 'emp1', name: 'MAX' },
    { id: 'a3', userId: 'emp2', name: 'WhatsApp' },
]

test('an owner gets only the messengers assigned to the owner', () => {
    assert.deepEqual(ownAssignments(rows, { id: 'owner', role: 'OWNER' }).map(a => a.id), ['a1'])
})

test('an admin with nothing assigned gets nothing, not the whole team', () => {
    assert.deepEqual(ownAssignments(rows, { id: 'adm', role: 'ADMIN' }), [])
})

test('a member keeps their rows (the server already sends only theirs)', () => {
    assert.deepEqual(ownAssignments([rows[1]], { id: 'emp1', role: 'MEMBER' }).map(a => a.id), ['a2'])
})

test('without a known user id nobody gets anything (fail closed)', () => {
    assert.deepEqual(ownAssignments(rows, { id: null, role: 'OWNER' }), [])
    assert.deepEqual(ownAssignments(rows, { id: null, role: null }), [])
})

test('an owner whose role field is not loaded yet still gets only his rows', () => {
    assert.deepEqual(ownAssignments(rows, { id: 'owner', role: null }).map(a => a.id), ['a1'])
    assert.deepEqual(ownAssignments(rows, { id: 'owner', role: null, isOwner: true }).map(a => a.id), ['a1'])
})

test('rows without userId are kept only for a member', () => {
    const legacy = [{ id: 'x', name: 'VK' }]
    assert.deepEqual(ownAssignments(legacy, { id: 'emp1', role: 'MEMBER' }).map(a => a.id), ['x'])
    assert.deepEqual(ownAssignments(legacy, { id: 'owner', role: 'OWNER' }), [])
    assert.deepEqual(ownAssignments(legacy, { id: 'owner', role: null, isOwner: true }), [])
})
