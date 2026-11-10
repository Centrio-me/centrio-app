'use strict'
// «Все мессенджеры»: a message is only ever typed into the tab when the chat open there is the one the person chose
const test = require('node:test')
const assert = require('node:assert/strict')
const { sameChat } = require('../renderer/all-inbox/same-chat')

test('the same name matches, whatever the case, emoji or spacing', () => {
    assert.equal(sameChat('Денис Триумф', 'денис  триумф'), true)
    assert.equal(sameChat('Марина Мареева ⭐', 'Марина Мареева'), true)
    assert.equal(sameChat('Рифмы и Панчи 😎', 'Рифмы и Панчи'), true)
})

test('another chat never matches', () => {
    assert.equal(sameChat('Полина Савосина', 'Парк отдыха и рыбалки "Водопад"'), false)
    assert.equal(sameChat('Маф-клуб Синдикат', 'Маф-клуб Синдикат чат игроков'), false)
})

test('an unknown name never matches (nothing is sent blind)', () => {
    assert.equal(sameChat('Денис', ''), false)
    assert.equal(sameChat('', 'Денис'), false)
    assert.equal(sameChat('😎', '🙂'), false)
})
