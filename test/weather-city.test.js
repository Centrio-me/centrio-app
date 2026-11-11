'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { citiesFromGeocoding, savedCity } = require('../main/services/weatherCity')

test('the found cities keep their name, region, country and coordinates', () => {
    const list = citiesFromGeocoding({ results: [
        { name: 'Ступино', admin1: 'Московская область', country: 'Россия', latitude: 54.89, longitude: 38.07 },
        { name: 'Москва', country: 'Россия', latitude: 55.75, longitude: 37.61 },
        { name: 'Bad', latitude: 'x', longitude: 1 }
    ] })
    assert.deepEqual(list, [
        { name: 'Ступино', region: 'Московская область', country: 'Россия', latitude: 54.89, longitude: 38.07 },
        { name: 'Москва', region: '', country: 'Россия', latitude: 55.75, longitude: 37.61 }
    ])
})

test('nothing found, or a broken answer, gives an empty list', () => {
    assert.deepEqual(citiesFromGeocoding({}), [])
    assert.deepEqual(citiesFromGeocoding(null), [])
})

test('a saved city is used only when its coordinates are real', () => {
    assert.deepEqual(savedCity({ name: 'Ступино', latitude: 54.89, longitude: 38.07 }), { name: 'Ступино', latitude: 54.89, longitude: 38.07 })
    assert.equal(savedCity(null), null)
    assert.equal(savedCity({ name: 'X', latitude: 200, longitude: 0 }), null)
    assert.equal(savedCity({ name: 'X', latitude: '55', longitude: 37 }), null)
})
