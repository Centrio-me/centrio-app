'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseCurrencyQuery, convert } = require('../shared/currency-query')

const RATES = { USD: { value: 80, nominal: 1 }, EUR: { value: 90, nominal: 1 }, CNY: { value: 11, nominal: 1 }, KZT: { value: 16, nominal: 100 } }

test('reads an amount and a currency in code, name or symbol', () => {
    assert.deepEqual(parseCurrencyQuery('100 usd'), { amount: 100, from: 'USD', to: null })
    assert.deepEqual(parseCurrencyQuery('50 евро'), { amount: 50, from: 'EUR', to: null })
    assert.deepEqual(parseCurrencyQuery('$20'), { amount: 20, from: 'USD', to: null })
    assert.deepEqual(parseCurrencyQuery('100₽'), { amount: 100, from: 'RUB', to: null })
    assert.deepEqual(parseCurrencyQuery('1 000 юаней'), { amount: 1000, from: 'CNY', to: null })
})

test('reads the target currency after в, to or an arrow', () => {
    assert.deepEqual(parseCurrencyQuery('5000 руб в евро'), { amount: 5000, from: 'RUB', to: 'EUR' })
    assert.deepEqual(parseCurrencyQuery('10,5 usd to rub'), { amount: 10.5, from: 'USD', to: 'RUB' })
    assert.deepEqual(parseCurrencyQuery('20$ в рублей'), { amount: 20, from: 'USD', to: 'RUB' })
})

test('a bare currency asks for one unit', () => {
    assert.deepEqual(parseCurrencyQuery('usd'), { amount: 1, from: 'USD', to: null })
})

test('other text is not a money question', () => {
    assert.equal(parseCurrencyQuery('telegram'), null)
    assert.equal(parseCurrencyQuery('100'), null)
    assert.equal(parseCurrencyQuery('100 usd в слонов'), null)
    assert.equal(parseCurrencyQuery('settings usd'), null)
    assert.equal(parseCurrencyQuery(''), null)
})

test('converts through the rouble and takes the nominal into account', () => {
    assert.deepEqual(convert({ amount: 100, from: 'USD', to: 'RUB' }, RATES), [{ code: 'RUB', value: 8000 }])
    assert.deepEqual(convert({ amount: 9000, from: 'RUB', to: 'EUR' }, RATES), [{ code: 'EUR', value: 100 }])
    const kzt = convert({ amount: 1000, from: 'KZT', to: 'RUB' }, RATES)
    assert.equal(Math.round(kzt[0].value), 160)
})

test('without a target the usual ones are shown, and a currency the Bank does not list gives nothing', () => {
    const codes = convert({ amount: 1, from: 'RUB', to: null }, RATES).map((r) => r.code)
    assert.deepEqual(codes, ['USD', 'EUR', 'CNY'])
    assert.deepEqual(convert({ amount: 1, from: 'GBP', to: null }, RATES), [])
})
