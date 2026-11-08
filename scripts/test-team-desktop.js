// Run with: node --test scripts/test-team-desktop.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { buildBeat } = require('../renderer/team-presence')
const { runCommand } = require('../renderer/team-commands')
const { nextNoteToShow } = require('../renderer/team-notes-logic')

const state = {
    activeTabId: 'org:a1',
    activeMessengers: [{ id: 'org:a1', orgAssigned: true }, { id: 'org:a2', orgAssigned: true }, { id: 'm1' }],
    rawUnreadCounts: { 'org:a1': 3, 'org:a2': 0, m1: 7 }
}

test('a beat carries only team messengers and the team tab in front', () => {
    assert.deepEqual(buildBeat(state, 12, 'dk1'), { deviceKeyId: 'dk1', open: true, idleSec: 12, frontAssignmentId: 'a1', unread: { a1: 3, a2: 0 } })
})

test('a personal tab in front sends frontAssignmentId null', () => {
    assert.equal(buildBeat({ ...state, activeTabId: 'm1' }, 0, null).frontAssignmentId, null)
})

function deps(overrides = {}) {
    const calls = []
    return {
        calls,
        wipe: async (ids) => { calls.push(['wipe', ids]); return { cleared: 2 } },
        reload: (id) => calls.push(['reload', id]),
        askRelogin: (id) => calls.push(['relogin', id]),
        confirm: async (id) => calls.push(['done', id]),
        notice: (key, name) => calls.push(['notice', key, name]),
        nameOf: (id) => (id === 'org:a1' ? 'WhatsApp' : null),
        ...overrides
    }
}

test('wipe confirms after clearing', async () => {
    const d = deps()
    await runCommand({ id: 'c1', kind: 'wipe', payload: { assignmentIds: 'all' } }, d)
    assert.deepEqual(d.calls.map((c) => c[0]), ['wipe', 'notice', 'done'])
    assert.equal(d.calls[0][1], 'all')
})

test('reload and relogin act on the team tab and tell the employee', async () => {
    const d = deps()
    await runCommand({ id: 'c2', kind: 'reload', payload: { assignmentId: 'a1' } }, d)
    await runCommand({ id: 'c3', kind: 'relogin', payload: { assignmentId: 'a1' } }, d)
    assert.deepEqual(d.calls, [
        ['reload', 'org:a1'], ['notice', 'reloaded', 'WhatsApp'], ['done', 'c2'],
        ['relogin', 'org:a1'], ['notice', 'relogin', 'WhatsApp'], ['done', 'c3']
    ])
})

test('an unknown kind is confirmed and ignored', async () => {
    const d = deps()
    await runCommand({ id: 'c4', kind: 'teleport', payload: {} }, d)
    assert.deepEqual(d.calls, [['done', 'c4']])
})

test('a failed wipe is not confirmed, so it runs again next time', async () => {
    const d = deps({ wipe: async () => { throw new Error('locked') } })
    await assert.rejects(runCommand({ id: 'c5', kind: 'wipe', payload: { assignmentIds: 'all' } }, d))
    assert.equal(d.calls.some((c) => c[0] === 'done'), false)
})

test('the oldest unread note is shown first and a dismissed one is skipped', () => {
    const notes = [{ id: 'n2', createdAt: '2026-11-10T10:05:00Z' }, { id: 'n1', createdAt: '2026-11-10T10:00:00Z' }]
    assert.equal(nextNoteToShow(notes, new Set()).id, 'n1')
    assert.equal(nextNoteToShow(notes, new Set(['n1'])).id, 'n2')
    assert.equal(nextNoteToShow(notes, new Set(['n1', 'n2'])), null)
})
