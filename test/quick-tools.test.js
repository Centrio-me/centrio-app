'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { parseUnitQuery, convertUnits } = require('../shared/units-query')
const { parseColor, formatColor } = require('../shared/color-query')
const { parseTimerQuery, formatClock } = require('../shared/timer-query')

const round = (n, d = 2) => Number(n.toFixed(d))

test('units: reads a number, a unit and the unit to turn it into', () => {
    assert.deepEqual(parseUnitQuery('5 км в мили'), { amount: 5, from: 'km', to: 'mi' })
    assert.deepEqual(parseUnitQuery('70 kg to lb'), { amount: 70, from: 'kg', to: 'lb' })
    assert.deepEqual(parseUnitQuery('5km'), { amount: 5, from: 'km', to: null })
    assert.deepEqual(parseUnitQuery('1,5 литра'), { amount: 1.5, from: 'l', to: null })
    assert.deepEqual(parseUnitQuery('100 км/ч в м/с'), { amount: 100, from: 'kmh', to: 'ms' })
})

test('units: converts lengths, masses and data sizes', () => {
    assert.equal(round(convertUnits({ amount: 5, from: 'km', to: 'mi' })[0].value), 3.11)
    assert.equal(round(convertUnits({ amount: 70, from: 'kg', to: 'lb' })[0].value), 154.32)
    assert.equal(convertUnits({ amount: 2, from: 'gb', to: 'mb' })[0].value, 2048)
    assert.equal(round(convertUnits({ amount: 100, from: 'kmh', to: 'ms' })[0].value), 27.78)
})

test('units: temperature has its own formulas', () => {
    assert.equal(round(convertUnits({ amount: 20, from: 'c', to: 'f' })[0].value, 1), 68)
    assert.equal(round(convertUnits({ amount: 212, from: 'f', to: 'c' })[0].value, 1), 100)
    assert.equal(round(convertUnits({ amount: 0, from: 'c', to: 'k' })[0].value, 2), 273.15)
})

test('units: without a target the usual ones of the same kind come, never the unit itself', () => {
    const labels = convertUnits({ amount: 1, from: 'km', to: null }).map((r) => r.unit)
    assert.deepEqual(labels, ['mi', 'ft', 'm'])
})

test('units: other text, or a unit of another kind as the target, is not a conversion', () => {
    assert.equal(parseUnitQuery('telegram'), null)
    assert.equal(parseUnitQuery('5 км в кг'), null)
    assert.equal(parseUnitQuery('5'), null)
    assert.equal(parseUnitQuery('settings 5'), null)
})

test('colour: reads hex in three, six and eight digits, rgb and hsl', () => {
    assert.deepEqual(parseColor('#5aa9ff'), { r: 90, g: 169, b: 255 })
    assert.deepEqual(parseColor('#5af'), { r: 85, g: 170, b: 255 })
    assert.deepEqual(parseColor('#5aa9ff80'), { r: 90, g: 169, b: 255 })
    assert.deepEqual(parseColor('rgb(90, 169, 255)'), { r: 90, g: 169, b: 255 })
    assert.deepEqual(parseColor('hsl(0, 100%, 50%)'), { r: 255, g: 0, b: 0 })
    assert.deepEqual(parseColor('5aa9ff'), { r: 90, g: 169, b: 255 })
})

test('colour: ordinary words and out-of-range numbers are not colours', () => {
    assert.equal(parseColor('face'), null)
    assert.equal(parseColor('bad'), null)
    assert.equal(parseColor('telegram'), null)
    assert.equal(parseColor('rgb(300, 0, 0)'), null)
    assert.equal(parseColor(''), null)
})

test('colour: shows hex, rgb and hsl', () => {
    assert.deepEqual(formatColor({ r: 90, g: 169, b: 255 }), { hex: '#5AA9FF', rgb: 'rgb(90, 169, 255)', hsl: 'hsl(211, 100%, 68%)' })
    assert.equal(formatColor({ r: 0, g: 0, b: 0 }).hsl, 'hsl(0, 0%, 0%)')
})

test('timer: reads minutes, hours, seconds, a clock and a label', () => {
    assert.deepEqual(parseTimerQuery('таймер 15 мин'), { ms: 15 * 60000, label: '' })
    assert.deepEqual(parseTimerQuery('timer 10m'), { ms: 10 * 60000, label: '' })
    assert.deepEqual(parseTimerQuery('таймер 1:30'), { ms: 90000, label: '' })
    assert.deepEqual(parseTimerQuery('через 20 минут'), { ms: 20 * 60000, label: '' })
    assert.deepEqual(parseTimerQuery('таймер 2 часа 30 мин чай'), { ms: 150 * 60000, label: 'чай' })
    assert.deepEqual(parseTimerQuery('таймер 1,5 часа'), { ms: 90 * 60000, label: '' })
})

test('timer: a bare duration is a timer, a bare number is not', () => {
    assert.deepEqual(parseTimerQuery('15 мин'), { ms: 15 * 60000, label: '' })
    assert.equal(parseTimerQuery('15'), null)
    assert.equal(parseTimerQuery('15 usd'), null)
    assert.equal(parseTimerQuery('5 м'), null)
    assert.equal(parseTimerQuery('5 km'), null)
    assert.equal(parseTimerQuery('telegram'), null)
})

test('timer: the word alone asks for the running ones; zero and over a day are refused', () => {
    assert.deepEqual(parseTimerQuery('таймер'), { list: true })
    assert.equal(parseTimerQuery('таймер 0 мин'), null)
    assert.equal(parseTimerQuery('таймер 25 часов'), null)
})

test('timer: the clock is minutes and seconds, with hours when there are some', () => {
    assert.equal(formatClock(90000), '1:30')
    assert.equal(formatClock(3725000), '1:02:05')
    assert.equal(formatClock(0), '0:00')
})
