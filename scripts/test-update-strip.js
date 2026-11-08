// Run with: node --test scripts/test-update-strip.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { initialState, reduce, isStripOpen } = require('../renderer/update-strip-state')

const run = (events, from = initialState) => events.reduce(reduce, from)
const status = (name, extra = {}) => ({ type: 'status', status: name, ...extra })

const available = status('available', { version: '3.7.0' })
const downloaded = status('downloaded', { version: '3.7.0' })

test('a quiet check shows nothing', () => {
    const state = run([status('checking'), status('not-available')])
    assert.equal(state.phase, 'idle')
    assert.equal(isStripOpen(state), false)
})

test('a failed background check stays silent', () => {
    assert.equal(run([status('checking'), status('error')]).phase, 'idle')
})

test('download keeps the version from available, the strip stays closed', () => {
    const state = run([available, status('downloading', { percent: 38 })])
    assert.equal(state.phase, 'downloading')
    assert.equal(state.version, '3.7.0')
    assert.equal(state.percent, 38)
    assert.equal(isStripOpen(state), false)
})

test('a finished download opens the strip', () => {
    const state = run([available, downloaded])
    assert.equal(state.phase, 'ready')
    assert.equal(isStripOpen(state), true)
})

test('the periodic check does not close a ready strip', () => {
    const ready = run([available, downloaded])
    assert.equal(run([available, status('downloading', { percent: 5 }), downloaded], ready).phase, 'ready')
    assert.equal(run([status('not-available')], ready).phase, 'ready')
    assert.equal(run([status('error')], ready).phase, 'ready')
})

test('the periodic check does not bring back a snoozed strip', () => {
    const snoozed = run([available, downloaded, { type: 'later' }])
    assert.equal(snoozed.phase, 'snoozed')
    assert.equal(run([available, downloaded], snoozed).phase, 'snoozed')
})

test('a newer version replaces the one that was ready', () => {
    const ready = run([available, downloaded])
    const state = reduce(ready, status('available', { version: '3.7.1' }))
    assert.equal(state.phase, 'downloading')
    assert.equal(state.version, '3.7.1')
})

test('later and show again return to the same strip', () => {
    const state = run([available, downloaded, { type: 'later' }, { type: 'show' }])
    assert.equal(state.phase, 'ready')
})

test('restart moves to installing', () => {
    const state = run([available, downloaded, { type: 'install' }])
    assert.equal(state.phase, 'installing')
})

test('a broken download offers a way out', () => {
    const state = run([available, status('downloading', { percent: 12 }), status('error')])
    assert.equal(state.phase, 'failed')
    assert.equal(state.failure, 'download')
})

test('retry after a broken download starts from zero', () => {
    const state = run([available, status('downloading', { percent: 12 }), status('error'), { type: 'retry' }])
    assert.equal(state.phase, 'downloading')
    assert.equal(state.percent, 0)
    assert.equal(state.failure, null)
})

test('an install that never restarts the app becomes a failure', () => {
    const state = run([available, downloaded, { type: 'install' }, { type: 'install-timeout' }])
    assert.equal(state.phase, 'failed')
    assert.equal(state.failure, 'install')
})

test('an install timeout after the phase changed is ignored', () => {
    assert.equal(run([available, downloaded, { type: 'install-timeout' }]).phase, 'ready')
})

test('a version that failed to install twice opens as a failure', () => {
    const state = run([available, status('downloaded', { version: '3.7.0', failedBefore: true })])
    assert.equal(state.phase, 'failed')
    assert.equal(state.failure, 'install')
})

test('retry after a failed install goes to installing', () => {
    const state = run([available, status('downloaded', { version: '3.7.0', failedBefore: true }), { type: 'retry' }])
    assert.equal(state.phase, 'installing')
})

test('closing a failed install keeps the quiet button, closing a failed download does not', () => {
    const failedInstall = run([available, status('downloaded', { version: '3.7.0', failedBefore: true }), { type: 'close' }])
    assert.equal(failedInstall.phase, 'snoozed')
    assert.equal(reduce(failedInstall, { type: 'show' }).phase, 'failed')

    const failedDownload = run([available, status('error'), { type: 'close' }])
    assert.equal(failedDownload.phase, 'idle')
})

test('after a restart the strip says the app was updated, then leaves', () => {
    const state = reduce(initialState, { type: 'updated', version: '3.7.0' })
    assert.equal(state.phase, 'updated')
    assert.equal(reduce(state, { type: 'close' }).phase, 'idle')
})

test('an available update replaces the updated message', () => {
    const state = reduce({ ...initialState, phase: 'updated', version: '3.7.0' }, status('available', { version: '3.7.1' }))
    assert.equal(state.phase, 'downloading')
})

test('reduce does not change the state it was given', () => {
    const frozen = Object.freeze({ ...initialState })
    assert.doesNotThrow(() => reduce(frozen, available))
})

test('an unknown event changes nothing', () => {
    assert.equal(reduce(initialState, { type: 'status', status: 'unknown' }), initialState)
    assert.equal(reduce(initialState, { type: 'nope' }), initialState)
})
