'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { isVisitorId, cleanVersion, uninstallSummary, daysBetween } = require('../src/lib/uninstall-mark')

test('a visitor id is the app\'s own uuid, nothing else', () => {
    assert.strictEqual(isVisitorId('2f1c9a4e-8b7d-4c3a-9e1f-0a2b3c4d5e6f'), true)
    assert.strictEqual(isVisitorId(''), false)
    assert.strictEqual(isVisitorId('x'.repeat(65)), false)
    assert.strictEqual(isVisitorId({ $ne: null }), false)
    assert.strictEqual(isVisitorId('drop table'), false)
})

test('the version is kept short and plain', () => {
    assert.strictEqual(cleanVersion('3.7.4'), '3.7.4')
    assert.strictEqual(cleanVersion('3.7.4<script>'), null)
    assert.strictEqual(cleanVersion(42), null)
})

test('no uninstall on any computer: nothing to show', () => {
    assert.strictEqual(uninstallSummary([]), null)
    assert.strictEqual(uninstallSummary([{ uninstalledAt: null, lastSeenAt: new Date() }]), null)
})

test('the latest uninstall wins and says whether the person came back', () => {
    const s = uninstallSummary([
        { uninstalledAt: new Date('2026-11-01T10:00:00Z'), uninstallVersion: '3.7.4', lastSeenAt: new Date('2026-11-01T09:59:00Z'), firstSeenAt: new Date('2026-10-30T10:00:00Z') },
        { uninstalledAt: new Date('2026-11-05T10:00:00Z'), uninstallVersion: '3.7.5', lastSeenAt: new Date('2026-11-06T10:00:00Z'), firstSeenAt: new Date('2026-11-04T10:00:00Z') }
    ])
    assert.strictEqual(s.at.toISOString(), '2026-11-05T10:00:00.000Z')
    assert.strictEqual(s.version, '3.7.5')
    assert.strictEqual(s.cameBack, true)
    assert.strictEqual(s.computers, 2)
    assert.strictEqual(s.daysUsed, 1)
})

test('days between install and uninstall are whole days, never negative', () => {
    assert.strictEqual(daysBetween(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-03T12:00:00Z')), 2)
    assert.strictEqual(daysBetween(new Date('2026-11-03T00:00:00Z'), new Date('2026-11-01T00:00:00Z')), 0)
    assert.strictEqual(daysBetween(null, new Date()), null)
})
