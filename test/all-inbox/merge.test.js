'use strict'
// node --test test/all-inbox
const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeInbox } = require('../../renderer/all-inbox/merge')

const NOW = Date.UTC(2026, 10, 11, 12, 0, 0)
const tg = { id: 'tg', name: 'Telegram' }
const max = { id: 'max', name: 'MAX' }

function chat(key, extra = {}) {
    return { key, title: 'Чат ' + key, preview: 'текст', at: NOW - 60000, unread: 0, ...extra }
}

test('passes the kind, pin, online and tick state of a chat through', () => {
    const [row] = mergeInbox([{ messenger: tg, chats: [chat('1', { kind: 'user', pinned: true, online: true, outState: 'read', members: 0 })] }], NOW)
    assert.equal(row.kind, 'user')
    assert.equal(row.pinned, true)
    assert.equal(row.online, true)
    assert.equal(row.outState, 'read')
})

test('drops unknown kinds and tick states instead of passing page values through', () => {
    const [row] = mergeInbox([{ messenger: tg, chats: [chat('1', { kind: '<b>', outState: 'evil' })] }], NOW)
    assert.equal(row.kind, '')
    assert.equal(row.outState, '')
})

test('the personal filter keeps people, bots and «Избранное», the groups filter only groups', () => {
    const sources = [{ messenger: tg, chats: [
        chat('u', { kind: 'user' }), chat('b', { kind: 'bot' }), chat('s', { kind: 'saved' }),
        chat('g', { kind: 'group' }), chat('c', { kind: 'channel' })
    ] }]
    assert.deepEqual(mergeInbox(sources, NOW, { kind: 'personal' }).map((c) => c.key).sort(), ['b', 's', 'u'])
    assert.deepEqual(mergeInbox(sources, NOW, { kind: 'groups' }).map((c) => c.key), ['g'])
    assert.deepEqual(mergeInbox(sources, NOW, { kind: 'channels' }).map((c) => c.key), ['c'])
})

test('pinned chats go first, each part freshest first', () => {
    const sources = [
        { messenger: tg, chats: [chat('old-pin', { pinned: true, at: NOW - 9e6 }), chat('new', { at: NOW - 1000 })] },
        { messenger: max, chats: [chat('mid', { at: NOW - 5000 })] }
    ]
    assert.deepEqual(mergeInbox(sources, NOW).map((c) => c.key), ['old-pin', 'new', 'mid'])
})

test('a search marks where the title matched', () => {
    const [row] = mergeInbox([{ messenger: tg, chats: [chat('1', { title: 'Андрей Горячев' })] }], NOW, { query: 'горя' })
    assert.deepEqual(row.match, { start: 7, length: 4 })
})

test('accounts of the same messenger are told apart only when there are several', () => {
    const one = mergeInbox([{ messenger: { ...tg, service: 'telegram' }, chats: [chat('1')] }, { messenger: { ...max, service: 'max' }, chats: [chat('2')] }], NOW)
    assert.ok(one.every((c) => c.accountLabel === ''))
    const two = mergeInbox([
        { messenger: { id: 'a', name: 'Рабочий', service: 'telegram' }, chats: [chat('1')] },
        { messenger: { id: 'b', name: 'Telegram', service: 'telegram' }, chats: [chat('2')] }
    ], NOW)
    assert.deepEqual(two.map((c) => c.accountLabel).sort(), ['Telegram', 'Рабочий'])
    assert.deepEqual(two.map((c) => c.accountTone).sort(), [0, 1])
    assert.ok(one.every((c) => c.accountTone === -1))
})
