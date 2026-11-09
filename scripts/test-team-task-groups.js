'use strict'
// Team tasks in the app (3.7.3): both directions, each person sees them grouped by who they are for.
const test = require('node:test')
const assert = require('node:assert/strict')
const { groupTeamTasks, canToggle, canWithdraw, assignTargets } = require('../renderer/team-task-groups')

const tasks = [
    { id: 't1', assigneeId: 'e', createdById: 'o', status: 'OPEN' },   // owner -> employee
    { id: 't2', assigneeId: 'o', createdById: 'e', status: 'OPEN' },   // employee -> owner (request)
    { id: 't3', assigneeId: 'e2', createdById: 'a', status: 'OPEN' },  // admin -> another employee
    { id: 't4', assigneeId: 'a', createdById: 'e', status: 'DONE' }    // employee -> admin, done
]

test('an employee sees "for me" and "my requests"', () => {
    const groups = groupTeamTasks(tasks, { userId: 'e', manager: false })
    assert.deepEqual(groups.map(g => [g.key, g.items.map(t => t.id)]), [['forMe', ['t1']], ['myRequests', ['t2', 't4']]])
})

test('a manager sees requests from employees first, then tasks he and others gave', () => {
    const groups = groupTeamTasks(tasks, { userId: 'o', manager: true })
    assert.deepEqual(groups.map(g => [g.key, g.items.map(t => t.id)]), [['fromTeam', ['t2']], ['toTeam', ['t1', 't3', 't4']]])
})

test('empty groups are left out', () => {
    assert.deepEqual(groupTeamTasks([], { userId: 'e', manager: false }), [])
})

test('the checkbox: the person the task is for, or a manager; not the author of a request', () => {
    assert.equal(canToggle(tasks[0], { userId: 'e', manager: false }), true)
    assert.equal(canToggle(tasks[1], { userId: 'e', manager: false }), false)
    assert.equal(canToggle(tasks[1], { userId: 'o', manager: true }), true)
})

test('an employee withdraws his own open request only', () => {
    assert.equal(canWithdraw(tasks[1], { userId: 'e', manager: false }), true)
    assert.equal(canWithdraw(tasks[3], { userId: 'e', manager: false }), false)
    assert.equal(canWithdraw(tasks[0], { userId: 'e', manager: false }), false)
})

test('whom a person can give a task: a manager anyone but himself, an employee only managers', () => {
    const members = [{ userId: 'o', role: 'OWNER' }, { userId: 'a', role: 'ADMIN' }, { userId: 'e', role: 'MEMBER' }, { userId: 'e2', role: 'MEMBER' }]
    assert.deepEqual(assignTargets(members, { userId: 'o', manager: true }).map(m => m.userId), ['a', 'e', 'e2'])
    assert.deepEqual(assignTargets(members, { userId: 'e', manager: false }).map(m => m.userId), ['o', 'a'])
})
