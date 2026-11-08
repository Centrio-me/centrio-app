// Run with: node --test scripts/test-team-strict.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { canDo, visibleMessengers, dndCoversTeam } = require('../renderer/team-strict')

const team = { id: 'org:a1', orgAssigned: true }
const own = { id: 'm1' }

test('strict blocks every change to a team messenger', () => {
    for (const action of ['remove', 'rename', 'reorder', 'icon', 'moveFolder', 'mute']) {
        assert.equal(canDo(action, team, true), false, action)
    }
})

test('strict blocks adding own messengers and links', () => {
    assert.equal(canDo('add', null, true), false)
    assert.equal(canDo('addLink', null, true), false)
})

test('without strict mode today rules stay: team messengers cannot be removed, the rest is allowed', () => {
    assert.equal(canDo('remove', team, false), false)
    assert.equal(canDo('rename', team, false), true)
    assert.equal(canDo('mute', team, false), true)
    assert.equal(canDo('add', null, false), true)
    assert.equal(canDo('remove', own, false), true)
})

test('strict mode does not lock personal messengers the person still sees', () => {
    assert.equal(canDo('rename', own, true), true)
})

test('hides personal messengers without deleting them', () => {
    const list = [team, own]
    const shown = visibleMessengers(list, { strict: true, teamWorkspaceActive: true })
    assert.deepEqual(shown.map((m) => m.id), ['org:a1'])
    assert.equal(list.length, 2)
})

test('leaving the team shows them again', () => {
    const list = [team, own]
    assert.deepEqual(visibleMessengers(list, { strict: false, teamWorkspaceActive: true }).map((m) => m.id), ['org:a1', 'm1'])
    assert.deepEqual(visibleMessengers(list, { strict: true, teamWorkspaceActive: false }).map((m) => m.id), ['org:a1', 'm1'])
})

test('do not disturb does not silence team messengers in strict mode during work hours', () => {
    assert.equal(dndCoversTeam({ strict: true, inWorkHours: true }), false)
    assert.equal(dndCoversTeam({ strict: true, inWorkHours: false }), true)
    assert.equal(dndCoversTeam({ strict: false, inWorkHours: true }), true)
})
