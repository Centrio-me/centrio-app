'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { findAll } = require('../../renderer/all-inbox/chat-search')

test('finds every place of the query, without regard to case', () => {
    assert.deepEqual(findAll('Привет, привет и ПРИВЕТ', 'привет'), [0, 8, 17])
})

test('a query of one letter finds nothing (too many marks to be useful)', () => {
    assert.deepEqual(findAll('абвгд', 'а'), [])
})

test('spaces around the query do not count', () => {
    assert.deepEqual(findAll('счёт на оплату', '  оплату '), [8])
})
