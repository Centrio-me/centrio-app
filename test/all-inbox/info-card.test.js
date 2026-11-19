'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { describeInfo, plural } = require('../../renderer/all-inbox/info-card')

test('plural picks the Russian form by the number', () => {
    const f = ['подписчик', 'подписчика', 'подписчиков']
    assert.equal(plural(1, f), 'подписчик')
    assert.equal(plural(2, f), 'подписчика')
    assert.equal(plural(5, f), 'подписчиков')
    assert.equal(plural(11, f), 'подписчиков')
    assert.equal(plural(21, f), 'подписчик')
    assert.equal(plural(22, f), 'подписчика')
    assert.equal(plural(1521990, f), 'подписчиков')
})

test('a channel says how many people follow it, with the number grouped', () => {
    const d = describeInfo({ kind: 'channel', title: 'SHOT', members: 1264601, username: 'shot_shot', about: 'Самый цитируемый' })
    assert.equal(d.title, 'SHOT')
    assert.equal(d.subtitle, 'Канал · 1 264 601 подписчик')
    assert.equal(d.link, 'https://t.me/shot_shot')
    assert.equal(d.about, 'Самый цитируемый')
})

test('a group counts its members', () => {
    const d = describeInfo({ kind: 'group', title: 'Чат', members: 3, username: '', about: '' })
    assert.equal(d.subtitle, 'Группа · 3 участника')
    assert.equal(d.link, '')
})

test('nothing known about the count leaves only the kind', () => {
    assert.equal(describeInfo({ kind: 'channel', title: 'X', members: 0 }).subtitle, 'Канал')
})

test('the link is taken only from a real username', () => {
    assert.equal(describeInfo({ kind: 'channel', title: 'X', username: 'bad name/../x' }).link, '')
    assert.equal(describeInfo({ kind: 'channel', title: 'X', username: 'ok_name1' }).link, 'https://t.me/ok_name1')
})

test('missing or broken input gives an empty card, not an error', () => {
    assert.deepEqual(describeInfo(null), { title: '', subtitle: '', about: '', link: '' })
    assert.deepEqual(describeInfo('x'), { title: '', subtitle: '', about: '', link: '' })
})

test('a person has a card too: their name, their address, what they wrote about themselves', () => {
    const d = describeInfo({ kind: 'user', title: 'Иван Петров', username: 'ivan_p', phone: '79001234567', about: 'Печать на кружках' })
    assert.equal(d.title, 'Иван Петров')
    assert.equal(d.subtitle, 'Контакт · +7 900 123-45-67')
    assert.equal(d.about, 'Печать на кружках')
    assert.equal(d.link, 'https://t.me/ivan_p')
})

test('a person without a number shows the address, and a bot says it is a bot', () => {
    assert.equal(describeInfo({ kind: 'user', title: 'Ян', username: 'yan_k' }).subtitle, 'Контакт · @yan_k')
    assert.equal(describeInfo({ kind: 'bot', title: 'Помощник', username: 'help_bot' }).subtitle, 'Бот · @help_bot')
    assert.equal(describeInfo({ kind: 'user', title: 'Без ничего' }).subtitle, 'Контакт')
})

test('a number that is not a number is not shown', () => {
    assert.equal(describeInfo({ kind: 'user', title: 'X', phone: 'abc<script>' }).subtitle, 'Контакт')
})

test('a card of another messenger shows its own https link and never a t.me one', () => {
    const { describeInfo } = require('../../renderer/all-inbox/info-card')
    assert.equal(describeInfo({ kind: 'channel', title: 'К', members: 5, link: 'https://max.ru/join/abc' }).link, 'https://max.ru/join/abc')
    assert.equal(describeInfo({ kind: 'channel', title: 'К', link: 'javascript:alert(1)' }).link, '')
    assert.equal(describeInfo({ kind: 'channel', title: 'К', username: 'durov' }).link, 'https://t.me/durov')
})
