'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { runCommand } = require('../renderer/team-commands')

function deps() {
    const calls = []
    return {
        calls,
        wipe: async () => { calls.push('wipe') },
        reload: () => calls.push('reload'),
        askRelogin: () => calls.push('relogin'),
        refresh: async () => { calls.push('refresh') },
        confirm: async (id) => { calls.push(`confirm:${id}`) },
        notice: (key) => calls.push(`notice:${key}`),
        nameOf: () => 'X'
    }
}

test('«refresh» from the owner asks the account and the team again, then is confirmed', async () => {
    const d = deps()
    await runCommand({ id: 'c1', kind: 'refresh', payload: {} }, d)
    assert.deepEqual(d.calls, ['refresh', 'notice:refreshed', 'confirm:c1'])
})

test('a refresh that failed is not confirmed, so it is tried again next time', async () => {
    const d = deps()
    d.refresh = async () => { throw new Error('offline') }
    await assert.rejects(runCommand({ id: 'c2', kind: 'refresh', payload: {} }, d))
    assert.ok(!d.calls.includes('confirm:c2'))
})
