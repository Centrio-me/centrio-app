'use strict'
// Themes with their own effects (3.7.3): «Аврора» (a dark theme with a northern light behind glass panels) and
// «Время суток» (the window follows the time of day). Each one rides on an existing base theme, so every other
// screen (modals, menus, the cabinet) keeps its finished light/dark look.
const test = require('node:test')
const assert = require('node:assert/strict')
const { dayPhase, resolveTheme, FX_THEMES } = require('../shared/theme-fx')

test('the hours split into morning, day, evening and night', () => {
    assert.equal(dayPhase(5), 'night')
    assert.equal(dayPhase(6), 'morning')
    assert.equal(dayPhase(10), 'morning')
    assert.equal(dayPhase(11), 'day')
    assert.equal(dayPhase(16), 'day')
    assert.equal(dayPhase(17), 'evening')
    assert.equal(dayPhase(21), 'evening')
    assert.equal(dayPhase(22), 'night')
    assert.equal(dayPhase(0), 'night')
})

test('junk hours count as day, never throw', () => {
    assert.equal(dayPhase(undefined), 'day')
    assert.equal(dayPhase(NaN), 'day')
    assert.equal(dayPhase(25), 'day')
})

test('Аврора is the dark base with its effect', () => {
    assert.deepEqual(resolveTheme('aurora', 12), { base: 'embedded', fx: 'aurora', phase: null })
})

test('Время суток is light in the morning and the day, dark in the evening and the night', () => {
    assert.deepEqual(resolveTheme('daytime', 8), { base: 'light', fx: 'daytime', phase: 'morning' })
    assert.deepEqual(resolveTheme('daytime', 13), { base: 'light', fx: 'daytime', phase: 'day' })
    assert.deepEqual(resolveTheme('daytime', 19), { base: 'embedded', fx: 'daytime', phase: 'evening' })
    assert.deepEqual(resolveTheme('daytime', 2), { base: 'embedded', fx: 'daytime', phase: 'night' })
})

test('the old themes have no effect and keep their own name', () => {
    for (const theme of ['embedded', 'dock', 'light', 'adaptive']) {
        assert.deepEqual(resolveTheme(theme, 12), { base: theme, fx: null, phase: null })
    }
    assert.deepEqual(resolveTheme(undefined, 12), { base: 'embedded', fx: null, phase: null })
})

test('both new themes are listed', () => {
    assert.deepEqual([...FX_THEMES], ['aurora', 'daytime'])
})

// 3.7.4: a separate window takes the whole look of the main one, not just light or dark
const { windowLook } = require('../shared/theme-fx')

test('a separate window keeps the theme of the main window', () => {
    assert.deepStrictEqual(windowLook('dock', 12), { mode: 'dark', palette: 'dock', fx: null, phase: null })
    assert.deepStrictEqual(windowLook('light', 12), { mode: 'light', palette: 'light', fx: null, phase: null })
    assert.deepStrictEqual(windowLook('aurora', 12), { mode: 'dark', palette: 'embedded', fx: 'aurora', phase: null })
    assert.deepStrictEqual(windowLook('daytime', 8), { mode: 'light', palette: 'light', fx: 'daytime', phase: 'morning' })
    assert.deepStrictEqual(windowLook('daytime', 23), { mode: 'dark', palette: 'embedded', fx: 'daytime', phase: 'night' })
})

test('an unknown or missing theme falls back to the built-in dark one', () => {
    assert.deepStrictEqual(windowLook(undefined, 12), { mode: 'dark', palette: 'embedded', fx: null, phase: null })
    assert.deepStrictEqual(windowLook('<script>', 12), { mode: 'dark', palette: 'embedded', fx: null, phase: null })
})
