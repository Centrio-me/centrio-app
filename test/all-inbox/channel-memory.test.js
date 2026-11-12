// MAX channels in «Все мессенджеры» (Oleg, 2026-11-12: «чаты каналы в общей куче»): MAX's list does not say what is a
// channel, its open chat does («… подписчиков»). A chat seen once as a channel stays one in the list.
const test = require('node:test')
const assert = require('node:assert')
const { isChannelSubtitle, createChannelMemory, withChannelKinds } = require('../../renderer/all-inbox/channel-memory.js')

function fakeStorage() {
    const data = {}
    return { get: (k) => data[k] ?? null, set: (k, v) => { data[k] = v } }
}

test('a channel is told by «подписчиков» under its name, a group by «участников»', () => {
    assert.strictEqual(isChannelSubtitle('1 234 подписчика'), true)
    assert.strictEqual(isChannelSubtitle('12 подписчиков'), true)
    assert.strictEqual(isChannelSubtitle('5 subscribers'), true)
    assert.strictEqual(isChannelSubtitle('12 участников'), false)
    assert.strictEqual(isChannelSubtitle('в сети'), false)
    assert.strictEqual(isChannelSubtitle(''), false)
})

test('a chat remembered as a channel becomes a channel in the list, others keep their kind', () => {
    const memory = createChannelMemory(fakeStorage())
    memory.remember('max1', 'СВЕЖЕСТИ')
    const sources = [{ messenger: { id: 'max1' }, chats: [{ key: 'СВЕЖЕСТИ', title: 'СВЕЖЕСТИ', kind: 'user' }, { key: 'Анна', title: 'Анна', kind: 'user' }] }]
    const out = withChannelKinds(sources, memory)
    assert.deepStrictEqual(out[0].chats.map((c) => c.kind), ['channel', 'user'])
    assert.strictEqual(sources[0].chats[0].kind, 'user')
})

test('the memory survives a restart and stays per tab', () => {
    const storage = fakeStorage()
    createChannelMemory(storage).remember('max1', 'RT на русском')
    const again = createChannelMemory(storage)
    assert.strictEqual(again.has('max1', 'RT на русском'), true)
    assert.strictEqual(again.has('max2', 'RT на русском'), false)
})

test('a group is told by «участников» and remembered as a group (Oleg: the filters did not work for MAX)', () => {
    const { kindFromSubtitle } = require('../../renderer/all-inbox/channel-memory.js')
    assert.strictEqual(kindFromSubtitle('12 участников'), 'group')
    assert.strictEqual(kindFromSubtitle('3 участника, 1 в сети'), 'group')
    assert.strictEqual(kindFromSubtitle('1 234 подписчика'), 'channel')
    assert.strictEqual(kindFromSubtitle('был(а) вчера'), '')
    const memory = createChannelMemory(fakeStorage())
    memory.remember('max1', 'Родители 2Б', 'group')
    const out = withChannelKinds([{ messenger: { id: 'max1' }, chats: [{ title: 'Родители 2Б', kind: 'user' }] }], memory)
    assert.strictEqual(out[0].chats[0].kind, 'group')
})
