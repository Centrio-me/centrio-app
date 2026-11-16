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
