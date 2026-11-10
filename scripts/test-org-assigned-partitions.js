'use strict'
// Team (org-assigned) messengers never go into store.get('messengers'), so main must learn their url from the
// register call: without it the login popup of a team tab (Yandex Telemost -> passport.yandex.ru) had no owner
// and fell through to the external browser.
const test = require('node:test')
const assert = require('node:assert')

function fresh() {
    delete require.cache[require.resolve('../main/services/orgAssignedPartitions')]
    return require('../main/services/orgAssignedPartitions')
}

test('a registered team messenger keeps its url', () => {
    const reg = fresh()
    reg.register('org:a1', 'https://telemost.yandex.ru')
    assert.deepStrictEqual(reg.records(), [{ id: 'org:a1', url: 'https://telemost.yandex.ru' }])
    assert.strictEqual(reg.isRegisteredPartition('persist:org:a1'), true)
})

test('registering without a url still allows the partition (older callers)', () => {
    const reg = fresh()
    reg.register('org:b2')
    assert.strictEqual(reg.isRegisteredPartition('persist:org:b2'), true)
    assert.deepStrictEqual(reg.records(), [{ id: 'org:b2', url: '' }])
    assert.deepStrictEqual(reg.list(), ['org:b2'])
})

test('only http(s) urls are kept', () => {
    const reg = fresh()
    reg.register('org:c3', 'javascript:alert(1)')
    reg.register('org:d4', 42)
    assert.deepStrictEqual(reg.records(), [{ id: 'org:c3', url: '' }, { id: 'org:d4', url: '' }])
})

test('a later register with a url fills it in', () => {
    const reg = fresh()
    reg.register('org:e5')
    reg.register('org:e5', 'https://web.max.ru/')
    assert.deepStrictEqual(reg.records(), [{ id: 'org:e5', url: 'https://web.max.ru/' }])
})
