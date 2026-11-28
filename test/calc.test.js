'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { evaluate, formatNumber } = require('../shared/calc')

test('adds, subtracts, multiplies and divides with the usual order', () => {
    assert.equal(evaluate('2+2*3'), 8)
    assert.equal(evaluate('(2+2)*3'), 12)
    assert.equal(evaluate('10-4-3'), 3)
    assert.equal(evaluate('100/4/5'), 5)
})

test('understands a comma as the decimal sign and spaces around the signs', () => {
    assert.equal(evaluate('1,5 * 2'), 3)
    assert.equal(evaluate(' 12 + 0.5 '), 12.5)
})

test('powers go right to left and bind tighter than multiplication', () => {
    assert.equal(evaluate('2^3^2'), 512)
    assert.equal(evaluate('2*3^2'), 18)
})

test('a percent sign divides by one hundred', () => {
    assert.equal(evaluate('200*15%'), 30)
    assert.equal(evaluate('50%'), null)
})

test('the minus and the unicode signs of other keyboards work', () => {
    assert.equal(evaluate('-3+5'), 2)
    assert.equal(evaluate('6×7'), 42)
    assert.equal(evaluate('8÷2'), 4)
    assert.equal(evaluate('5−2'), 3)
})

test('a plain number or a sentence is not a calculation', () => {
    assert.equal(evaluate('42'), null)
    assert.equal(evaluate('hello'), null)
    assert.equal(evaluate('2 apples + 3'), null)
    assert.equal(evaluate(''), null)
})

test('broken or dangerous input gives nothing instead of throwing or running code', () => {
    assert.equal(evaluate('2+'), null)
    assert.equal(evaluate('(2+3'), null)
    assert.equal(evaluate('1/0'), null)
    assert.equal(evaluate('process.exit()'), null)
    assert.equal(evaluate('1..2+3'), null)
    assert.equal(evaluate('9'.repeat(200) + '+1'), null)
})

test('numbers are shown without float noise and with groups of three digits', () => {
    assert.equal(formatNumber(0.1 + 0.2), '0.3')
    assert.equal(formatNumber(1234567.891), '1 234 567.891')
    assert.equal(formatNumber(8), '8')
})
