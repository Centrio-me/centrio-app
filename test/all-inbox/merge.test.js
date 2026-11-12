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

test('a draft and unread mentions of a chat pass through, cleaned', () => {
    const [row] = mergeInbox([{ messenger: tg, chats: [chat('1', { draft: '  Привет,\n как дела ', mentions: '2' })] }], NOW)
    assert.equal(row.draft, 'Привет, как дела')
    assert.equal(row.mentions, 2)
    const [none] = mergeInbox([{ messenger: tg, chats: [chat('2', { draft: 42, mentions: -1 })] }], NOW)
    assert.equal(none.draft, '')
    assert.equal(none.mentions, 0)
})

test('«печатает» of a chat passes through, too long text is cut', () => {
    const [row] = mergeInbox([{ messenger: tg, chats: [chat('1', { typing: 'записывает голосовое' })] }], NOW)
    assert.equal(row.typing, 'записывает голосовое')
    const [none] = mergeInbox([{ messenger: tg, chats: [chat('2', { typing: { evil: 1 } })] }], NOW)
    assert.equal(none.typing, '')
})

test('a folder shows only its chats (3.8.3)', () => {

    const sources = [{ messenger: { id: 'tg', name: 'Telegram' }, chats: [{ key: '1', title: 'Анна', time: '10:00' }, { key: '2', title: 'Пётр', time: '10:01' }] }]
    const list = mergeInbox(sources, Date.now(), { chatIds: new Set(['tg::2']) })
    assert.deepStrictEqual(list.map((c) => c.title), ['Пётр'])
})

test('filtering the merged list gives the same as merging with the filter', () => {
    const { filterInbox } = require('../../renderer/all-inbox/merge')
    const sources = [
        { messenger: { ...tg, service: 'telegram' }, chats: [chat('1', { unread: 2, kind: 'user', at: NOW - 1000 }), chat('2', { kind: 'channel', title: 'Новости', pinned: true })] },
        { messenger: { ...max, service: 'max' }, chats: [chat('3', { unread: 1, kind: 'group', at: NOW - 500 }), chat('4', { kind: 'user', preview: 'про новости' })] }
    ]
    const all = mergeInbox(sources, NOW)
    for (const f of [{}, { unreadOnly: true }, { kind: 'personal' }, { query: 'новост' }, { messengerId: 'max' }, { chatIds: new Set(['tg::1', 'max::4']) }]) {
        assert.deepEqual(filterInbox(all, f), mergeInbox(sources, NOW, f))
    }
})
