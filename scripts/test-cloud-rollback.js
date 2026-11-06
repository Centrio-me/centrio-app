// node scripts/test-cloud-rollback.js
const assert = require('assert')
const { cloudCopyIsRolledBack, cloudSnapshotTime } = require('../renderer/cloud-rollback')

const local = [{ id: 'a', name: 'Telegram' }]
const cases = [
    ['old snapshot, local has data -> rolled back', { syncedAt: '2026-09-22T07:56:00Z' }, local, true],
    ['old snapshot taken from settings.updatedAt', { settings: { updatedAt: '2026-09-20T10:00:00Z' } }, local, true],
    ['old snapshot, local empty -> still apply the cloud', { syncedAt: '2026-09-22T07:56:00Z' }, [], false],
    ['old snapshot, local missing -> still apply the cloud', { syncedAt: '2026-09-22T07:56:00Z' }, null, false],
    ['fresh snapshot (after the rebuild) is applied', { syncedAt: '2026-11-05T09:00:00Z' }, local, false],
    ['exactly at the boundary is fresh', { syncedAt: '2026-11-04T10:40:00Z' }, local, false],
    ['no timestamp at all is applied as before', { messengers: [] }, local, false],
    ['garbage timestamp is applied as before', { syncedAt: 'yesterday' }, local, false],
    ['no cloud data', null, local, false]
]
let failed = 0
for (const [name, cloud, mine, expected] of cases) {
    try {
        assert.strictEqual(cloudCopyIsRolledBack(cloud, mine), expected)
        console.log('PASS ' + name)
    } catch (e) {
        failed++
        console.log('FAIL ' + name)
    }
}
assert.strictEqual(cloudSnapshotTime({ syncedAt: '2026-09-22T07:56:00Z' }), Date.parse('2026-09-22T07:56:00Z'))
console.log(failed ? `\n${failed} failed` : `\n${cases.length + 1} passed`)
process.exit(failed ? 1 : 0)
