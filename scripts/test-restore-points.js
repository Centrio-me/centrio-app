const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createRestorePoints, RESTORE_KEYS } = require('../main/services/restorePoints')

function memoryStore(initial) {
    const data = { ...initial }
    return {
        has: (k) => Object.prototype.hasOwnProperty.call(data, k),
        get: (k) => data[k],
        set: (k, v) => { data[k] = v },
        delete: (k) => { delete data[k] },
        data
    }
}

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rp-test-'))
const DAY = 24 * 60 * 60 * 1000

test('secrets never go into a restore point', () => {
    for (const key of ['pinHash', 'pinEnabled', 'security', 'pmVault', 'assistant', 'cloud', 'vpnSubLinks', 'vpnSubUrl', 'vpnActiveLink']) {
        assert.equal(RESTORE_KEYS.includes(key), false, key)
    }
    const store = memoryStore({ messengers: [{ id: 'a', name: 'Telegram' }], pinHash: 'x', pmVault: 'y' })
    const rp = createRestorePoints({ store, dir: tmpDir(), now: () => 1000 })
    const point = rp.create('manual')
    const saved = JSON.parse(fs.readFileSync(path.join(rp.dir, `${point.id}.json`), 'utf8'))
    assert.deepEqual(Object.keys(saved.values), ['messengers'])
})

test('a point lists what it holds', () => {
    const store = memoryStore({
        messengers: [{ id: 'a' }, { id: 'b' }], folders: [{ id: 'f' }], splitPresets: [{ id: 'p' }], quickReplies: [{ id: 'q' }, { id: 'r' }]
    })
    const rp = createRestorePoints({ store, dir: tmpDir(), now: () => 5000 })
    rp.create('manual')
    const [item] = rp.list()
    assert.equal(item.reason, 'manual')
    assert.deepEqual(item.summary, { messengers: 2, folders: 1, presets: 1, quickReplies: 2 })
})

test('the daily point is made once a day and old automatic points are pruned', () => {
    let clock = 0
    const store = memoryStore({ messengers: [{ id: 'a' }] })
    const rp = createRestorePoints({ store, dir: tmpDir(), now: () => clock, keepAuto: 3 })
    assert.ok(rp.ensureDaily())
    clock += 2 * 60 * 60 * 1000
    assert.equal(rp.ensureDaily(), null)
    for (let i = 0; i < 5; i++) { clock += DAY; rp.ensureDaily() }
    clock += 1
    rp.create('manual')
    const list = rp.list()
    assert.equal(list.filter((p) => p.reason === 'daily').length, 3)
    assert.equal(list.filter((p) => p.reason === 'manual').length, 1)
    assert.ok(list[0].at >= list[list.length - 1].at, 'newest first')
})

test('nothing to save means no point', () => {
    const rp = createRestorePoints({ store: memoryStore({}), dir: tmpDir(), now: () => 1 })
    assert.equal(rp.ensureDaily(), null)
})

test('restoring puts the saved values back, keeps a copy of the current state and asks the cloud to take the local copy', () => {
    let clock = 1000
    const store = memoryStore({ messengers: [{ id: 'old' }], folders: [] })
    const rp = createRestorePoints({ store, dir: tmpDir(), now: () => clock })
    const point = rp.create('manual')
    clock += 1000
    store.set('messengers', [{ id: 'new' }])
    store.set('splitPresets', [{ id: 'p' }])
    assert.equal(rp.restore(point.id), true)
    assert.deepEqual(store.data.messengers, [{ id: 'old' }])
    assert.equal(store.has('splitPresets'), false, 'a key the point did not have is cleared')
    assert.equal(store.data['cloud.pendingLocalChanges'], true)
    assert.ok(rp.list().some((p) => p.reason === 'before-restore'))
})

test('a broken or foreign id is refused', () => {
    const rp = createRestorePoints({ store: memoryStore({ messengers: [{}] }), dir: tmpDir(), now: () => 1 })
    assert.equal(rp.restore('../../etc/passwd'), false)
    assert.equal(rp.restore('missing'), false)
    assert.equal(rp.remove('../x'), false)
})

test('restores do not push out the daily points', () => {
    let clock = 0
    const store = memoryStore({ messengers: [{ id: 'a' }] })
    const rp = createRestorePoints({ store, dir: tmpDir(), now: () => clock, keepAuto: 3 })
    for (let i = 0; i < 3; i++) { clock += DAY; rp.ensureDaily() }
    const target = rp.list()[0].id
    for (let i = 0; i < 6; i++) { clock += 1000; rp.restore(target) }
    const list = rp.list()
    assert.equal(list.filter((p) => p.reason === 'daily').length, 3)
    assert.ok(list.filter((p) => p.reason === 'before-restore').length <= 3)
})

test('a damaged point is refused and nothing is changed', () => {
    let clock = 1000
    const store = memoryStore({ messengers: [{ id: 'keep' }] })
    const dir = tmpDir()
    const rp = createRestorePoints({ store, dir, now: () => clock })
    const point = rp.create('manual')
    const file = path.join(dir, `${point.id}.json`)
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
    saved.values.messengers = 'broken'
    fs.writeFileSync(file, JSON.stringify(saved))
    assert.equal(rp.restore(point.id), false)
    assert.deepEqual(store.data.messengers, [{ id: 'keep' }])
})

test('a point is written whole or not at all (no temp files left)', () => {
    const dir = tmpDir()
    const rp = createRestorePoints({ store: memoryStore({ messengers: [{ id: 'a' }] }), dir, now: () => 5 })
    rp.create('manual')
    assert.deepEqual(fs.readdirSync(dir).filter((n) => !n.endsWith('.json')), [])
})
