const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { chatAdapterFor } = require('../../renderer/all-inbox/chat-adapters')

const wa = chatAdapterFor('whatsapp')

test('the WhatsApp page scripts are valid JavaScript', () => {
    for (const code of [wa.CHAT, wa.MEDIA('ABC123'), wa.FILE('ABC123'), wa.FULL_PICTURE('ABC123')]) assert.doesNotThrow(() => new vm.Script(code))
})

test('a file is downloaded with its type given, or WhatsApp refuses voice messages and pictures as octet-stream', () => {
    // the type is in the options of every download (Oleg, 2026-11-17: voice messages and pictures did not work)
    for (const code of [wa.MEDIA('ABC123'), wa.FULL_PICTURE('ABC123'), wa.CHAT]) assert.ok(code.includes('mimetype: m.mimetype'), 'mimetype is passed')
})

test('pictures sent together (an album) are read picture by picture, with the album itself left out', () => {
    assert.ok(wa.CHAT.includes("am.type === 'album'"))
    assert.ok(wa.CHAT.includes('k.parentMsgKey.id === aid'))
    // the pictures of the album are not taken from the page's picture of the whole album
    assert.ok(wa.CHAT.includes('!entries[i].kid'))
})

test('a round video message (ptv) is a video, drawn round', () => {
    assert.ok(wa.CHAT.includes("ptv: 'video'"))
    assert.ok(wa.CHAT.includes("round: type === 'ptv'"))
})
