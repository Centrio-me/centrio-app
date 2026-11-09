'use strict'
// Where a click on a notification opens the messenger (3.7.2, user request):
// - the messenger is already on screen in the split -> just move the focus to its pane, the split stays;
// - the person chose "open in preset X" for this messenger -> open that preset and focus the pane;
// - the person chose "own window" -> its own window;
// - otherwise as before: the full window.
const test = require('node:test')
const assert = require('node:assert/strict')
const { pickNotificationTarget, normalizeChoice } = require('../renderer/notif-target')

const presets = [
    { id: 'p1', name: 'Работа', layout: '3col', memberIds: ['tg', 'wa', 'max'] },
    { id: 'p2', name: 'Созвоны', layout: '2x2', memberIds: ['max', 'meet', 'tg', 'wa'] },
]
const base = { splitMode: false, activeTabId: 'mail', activeMessengers: [] }

test('a messenger already visible in the split only gets the focus', () => {
    const state = { splitMode: true, splitLayout: '3col', activeTabId: 'tg', splitZoneIds: ['tg', 'wa', 'max'], splitZoneFocus: 0 }
    assert.deepEqual(pickNotificationTarget({ state, id: 'max', choice: '', presets }), { kind: 'pane' })
})

test('the visible pane wins even over a saved choice', () => {
    const state = { splitMode: true, splitLayout: '2col', activeTabId: 'tg', splitTabId: 'wa', splitFocus: 'left' }
    assert.deepEqual(pickNotificationTarget({ state, id: 'wa', choice: 'window', presets }), { kind: 'pane' })
})

test('"open in preset" opens that preset', () => {
    assert.deepEqual(pickNotificationTarget({ state: base, id: 'wa', choice: 'preset:p2', presets }), { kind: 'preset', presetId: 'p2' })
})

test('a preset that was deleted or no longer holds the messenger falls back to the full window', () => {
    assert.deepEqual(pickNotificationTarget({ state: base, id: 'wa', choice: 'preset:gone', presets }), { kind: 'tab' })
    assert.deepEqual(pickNotificationTarget({ state: base, id: 'meet', choice: 'preset:p1', presets }), { kind: 'tab' })
})

test('"own window" opens the messenger in its own window', () => {
    assert.deepEqual(pickNotificationTarget({ state: base, id: 'tg', choice: 'window', presets }), { kind: 'window' })
})

test('no choice: the full window as before', () => {
    assert.deepEqual(pickNotificationTarget({ state: base, id: 'tg', choice: undefined, presets }), { kind: 'tab' })
})

test('choices are normalised: unknown values become the default', () => {
    assert.equal(normalizeChoice('window'), 'window')
    assert.equal(normalizeChoice('preset:p1'), 'preset:p1')
    assert.equal(normalizeChoice('preset:'), '')
    assert.equal(normalizeChoice('javascript:alert(1)'), '')
    assert.equal(normalizeChoice(42), '')
})
