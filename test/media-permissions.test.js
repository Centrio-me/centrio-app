const test = require('node:test')
const assert = require('node:assert/strict')
const { isMediaBlocked, setMediaAccess, messengerIdFromPartition } = require('../shared/media-permissions')

test('nothing is blocked by default: calls keep working as before', () => {
    assert.equal(isMediaBlocked({}, 'a', 'media', { mediaTypes: ['audio', 'video'] }), false)
})

test('a blocked microphone refuses audio but not video', () => {
    const prefs = { a: { mic: false } }
    assert.equal(isMediaBlocked(prefs, 'a', 'media', { mediaTypes: ['audio'] }), true)
    assert.equal(isMediaBlocked(prefs, 'a', 'media', { mediaTypes: ['video'] }), false)
})

test('a blocked camera refuses video but not audio', () => {
    const prefs = { a: { camera: false } }
    assert.equal(isMediaBlocked(prefs, 'a', 'media', { mediaTypes: ['video'] }), true)
    assert.equal(isMediaBlocked(prefs, 'a', 'media', { mediaTypes: ['audio'] }), false)
})

test('the choice of one session does not touch another', () => {
    const prefs = { a: { mic: false, camera: false } }
    assert.equal(isMediaBlocked(prefs, 'b', 'media', { mediaTypes: ['audio', 'video'] }), false)
})

test('the permission check form (single mediaType) is understood too', () => {
    const prefs = { a: { mic: false } }
    assert.equal(isMediaBlocked(prefs, 'a', 'media', { mediaType: 'audio' }), true)
    assert.equal(isMediaBlocked(prefs, 'a', 'media', { mediaType: 'video' }), false)
})

test('unknown media type with both blocked is refused, with nothing blocked is allowed', () => {
    assert.equal(isMediaBlocked({ a: { mic: false, camera: false } }, 'a', 'media', {}), true)
    assert.equal(isMediaBlocked({ a: { mic: false } }, 'a', 'media', {}), false)
})

test('other permissions (screen share, clipboard) are never affected', () => {
    const prefs = { a: { mic: false, camera: false } }
    assert.equal(isMediaBlocked(prefs, 'a', 'display-capture', {}), false)
    assert.equal(isMediaBlocked(prefs, 'a', 'clipboard-read', {}), false)
})

test('setMediaAccess returns a new object and drops entries that are back to the default', () => {
    const before = { a: { mic: false } }
    const off = setMediaAccess(before, 'a', 'camera', false)
    assert.deepEqual(off, { a: { mic: false, camera: false } })
    assert.deepEqual(before, { a: { mic: false } })
    const back = setMediaAccess(setMediaAccess(off, 'a', 'mic', true), 'a', 'camera', true)
    assert.deepEqual(back, {})
})

test('messengerIdFromPartition reads persist: partitions only', () => {
    assert.equal(messengerIdFromPartition('persist:abc-1'), 'abc-1')
    assert.equal(messengerIdFromPartition('temp'), null)
    assert.equal(messengerIdFromPartition(undefined), null)
})
