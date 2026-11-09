'use strict'
// Team tasks go both ways (3.7.3, user request): an employee can send a task to a manager ("посмотреть договор",
// "согласовать"), sees his own requests and their comments, and can withdraw one while it is open.
const test = require('node:test')
const assert = require('node:assert/strict')
const rules = require('../src/lib/team-task-rules')

const owner = { userId: 'o', role: 'OWNER' }
const admin = { userId: 'a', role: 'ADMIN' }
const emp = { userId: 'e', role: 'MEMBER' }
const emp2 = { userId: 'e2', role: 'MEMBER' }

test('a manager assigns to anyone active in the team except himself', () => {
    assert.equal(rules.canAssign(owner, { userId: 'e', role: 'MEMBER' }), true)
    assert.equal(rules.canAssign(admin, { userId: 'o', role: 'OWNER' }), true)
    assert.equal(rules.canAssign(owner, { userId: 'o', role: 'OWNER' }), false)
    assert.equal(rules.canAssign(owner, null), false)
})

test('an employee assigns only to the owner or an admin, never to another employee', () => {
    assert.equal(rules.canAssign(emp, { userId: 'o', role: 'OWNER' }), true)
    assert.equal(rules.canAssign(emp, { userId: 'a', role: 'ADMIN' }), true)
    assert.equal(rules.canAssign(emp, { userId: 'e2', role: 'MEMBER' }), false)
    assert.equal(rules.canAssign(emp, { userId: 'e', role: 'MEMBER' }), false)
})

test('who sees a task', () => {
    const toEmp = { assigneeId: 'e', createdById: 'o' }
    const request = { assigneeId: 'o', createdById: 'e' }
    assert.equal(rules.canSee(toEmp, owner), true)
    assert.equal(rules.canSee(request, admin), true)
    assert.equal(rules.canSee(toEmp, emp), true)
    assert.equal(rules.canSee(request, emp), true)
    assert.equal(rules.canSee(request, emp2), false)
    assert.equal(rules.canSee(toEmp, emp2), false)
})

test('the list an employee gets: tasks for him and his own requests', () => {
    assert.deepEqual(rules.listFilter(emp), { OR: [{ assigneeId: 'e' }, { createdById: 'e' }] })
    assert.deepEqual(rules.listFilter(owner), {})
})

test('who marks a task done: a manager, or the person it is for', () => {
    assert.equal(rules.canSetStatus({ assigneeId: 'e', createdById: 'o' }, emp), true)
    assert.equal(rules.canSetStatus({ assigneeId: 'o', createdById: 'e' }, emp), false)
    assert.equal(rules.canSetStatus({ assigneeId: 'o', createdById: 'e' }, owner), true)
})

test('an employee withdraws only his own request and only while it is open', () => {
    assert.equal(rules.canDelete({ assigneeId: 'o', createdById: 'e', status: 'OPEN' }, emp), true)
    assert.equal(rules.canDelete({ assigneeId: 'o', createdById: 'e', status: 'DONE' }, emp), false)
    assert.equal(rules.canDelete({ assigneeId: 'e', createdById: 'o', status: 'OPEN' }, emp), false)
    assert.equal(rules.canDelete({ assigneeId: 'e', createdById: 'o', status: 'DONE' }, owner), true)
})

test('only a manager edits the text, due date and assignee of a task', () => {
    assert.equal(rules.canEditFields(owner), true)
    assert.equal(rules.canEditFields(emp), false)
})
