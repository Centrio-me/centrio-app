const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanTopicTitle } = require('../shared/topic-title')

// Oleg 2026-11-22: a topic of a Telegram group showed its icon letter in front of its name («Т Тема»), and an emoji icon as an empty box.
test('the icon letter that Telegram puts in front of a topic name is dropped', () => {
    assert.equal(cleanTopicTitle('Т Тема'), 'Тема')
    assert.equal(cleanTopicTitle('Т\nТема'), 'Тема')
    assert.equal(cleanTopicTitle('G General'), 'General')
})

test('a name that merely starts with one letter and a space is kept', () => {
    assert.equal(cleanTopicTitle('В отпуск'), 'В отпуск')
    assert.equal(cleanTopicTitle('Я и ты'), 'Я и ты')
})

test('characters that draw as an empty box (private use, replacement, zero width) are taken out; real emoji stay', () => {
    assert.equal(cleanTopicTitle(' Новости'), 'Новости')
    assert.equal(cleanTopicTitle('�Работа'), 'Работа')
    assert.equal(cleanTopicTitle('Pro​jects'), 'Projects')
    assert.equal(cleanTopicTitle('🔥 Горячее'), '🔥 Горячее')
})

test('spaces are tidied and nothing is invented from an empty name', () => {
    assert.equal(cleanTopicTitle('  Мой   чат  '), 'Мой чат')
    assert.equal(cleanTopicTitle(''), '')
    assert.equal(cleanTopicTitle(undefined), '')
})
