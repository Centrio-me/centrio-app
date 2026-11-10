'use strict'
// «Все мессенджеры»: the chat lists of every tab become one list, freshest first
const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeInbox } = require('../renderer/all-inbox/merge')

const NOW = new Date(2026, 10, 10, 16, 30).getTime()
const sources = [
    { messenger: { id: 'tg', name: 'Telegram', icon: 'tg.png' }, chats: [
        { key: '1', title: 'Мама', preview: 'Привет', time: '16:05', unread: 2 },
        { key: '2', title: 'Работа', preview: 'Ок', time: 'Пн', unread: 0 }
    ] },
    { messenger: { id: 'max', name: 'MAX', icon: 'max.png' }, chats: [
        { key: 'Денис', title: 'Денис', preview: 'Ок', time: '16:20', unread: 0 },
        { key: 'Старый', title: 'Старый', preview: '', time: '', unread: 0 }
    ] }
]

test('chats from all tabs, freshest first, unknown times last', () => {
    const list = mergeInbox(sources, NOW)
    assert.deepEqual(list.map((c) => c.title), ['Денис', 'Мама', 'Работа', 'Старый'])
    assert.equal(list[0].messengerId, 'max')
    assert.equal(list[0].messengerName, 'MAX')
    assert.equal(list[1].id, 'tg::1')
})

test('only the unread ones', () => {
    assert.deepEqual(mergeInbox(sources, NOW, { unreadOnly: true }).map((c) => c.title), ['Мама'])
})

test('a search by name or text', () => {
    assert.deepEqual(mergeInbox(sources, NOW, { query: 'рАб' }).map((c) => c.title), ['Работа'])
    assert.deepEqual(mergeInbox(sources, NOW, { query: 'привет' }).map((c) => c.title), ['Мама'])
})

test('one messenger at a time', () => {
    assert.deepEqual(mergeInbox(sources, NOW, { messengerId: 'tg' }).map((c) => c.title), ['Мама', 'Работа'])
})

test('broken rows from a page are dropped, numbers are cleaned', () => {
    const list = mergeInbox([{ messenger: { id: 'x', name: 'X' }, chats: [null, { title: '' }, { key: 'k', title: 'Ок', unread: '641', time: '15:48' }] }], NOW)
    assert.equal(list.length, 1)
    assert.equal(list[0].unread, 641)
})

test('the same chat reported twice by one page appears once', () => {
    const list = mergeInbox([{ messenger: { id: 'x', name: 'X' }, chats: [{ key: 'a', title: 'A', time: '10:00' }, { key: 'a', title: 'A', time: '10:00' }] }], NOW)
    assert.equal(list.length, 1)
})

test('an exact time from the messenger wins over the label, and gets a label', () => {
    const list = mergeInbox([{ messenger: { id: 'tg', name: 'TG' }, chats: [{ key: '1', title: 'A', at: new Date(2026, 10, 10, 9, 5).getTime() }] }], NOW)
    assert.equal(list[0].at, new Date(2026, 10, 10, 9, 5).getTime())
    assert.equal(list[0].timeLabel, '09:05')
})

test('a special chat keeps its icon, anything else is dropped', () => {
    const list = mergeInbox([{ messenger: { id: 'tg', name: 'TG' }, chats: [
        { key: '1', title: 'Избранное', icon: 'saved', time: '10:00' },
        { key: '2', title: 'A', icon: '<img onerror=x>', time: '09:00' }
    ] }], NOW)
    assert.equal(list[0].icon, 'saved')
    assert.equal(list[1].icon, '')
})
