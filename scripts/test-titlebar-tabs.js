'use strict'
// The header next to the logo shows the open messenger; in a split it shows every pane, the focused one marked.
const test = require('node:test')
const assert = require('node:assert/strict')
const { describeTitlebar } = require('../renderer/titlebar-tabs')

const messengers = [
    { id: 'tg', name: 'Telegram', icon: 'tg.png' },
    { id: 'wa', name: 'WhatsApp', icon: 'wa.png' },
    { id: 'max', name: 'MAX', icon: 'max.png' },
]

test('one tab: just that messenger', () => {
    const state = { splitMode: false, activeTabId: 'wa', activeMessengers: messengers }
    assert.deepEqual(describeTitlebar(state), [{ id: 'wa', name: 'WhatsApp', icon: 'wa.png', focused: true }])
})

test('a grid split lists every pane in order and marks the focused one', () => {
    const state = {
        splitMode: true, splitLayout: '3col', activeTabId: 'tg', splitZoneIds: ['tg', 'wa', 'max'], splitZoneFocus: 2,
        activeMessengers: messengers,
    }
    assert.deepEqual(describeTitlebar(state).map(i => [i.id, i.focused]), [['tg', false], ['wa', false], ['max', true]])
})

test('a two-pane split marks the right pane when it has the focus', () => {
    const state = { splitMode: true, splitLayout: '2col', activeTabId: 'tg', splitTabId: 'max', splitFocus: 'right', activeMessengers: messengers }
    assert.deepEqual(describeTitlebar(state).map(i => [i.id, i.focused]), [['tg', false], ['max', true]])
})

test('panes whose messenger is gone are skipped', () => {
    const state = { splitMode: true, splitLayout: '2col', activeTabId: 'tg', splitTabId: 'gone', splitFocus: 'left', activeMessengers: messengers }
    assert.deepEqual(describeTitlebar(state).map(i => i.id), ['tg'])
})

test('nothing open: empty list', () => {
    assert.deepEqual(describeTitlebar({ splitMode: false, activeTabId: null, activeMessengers: messengers }), [])
})
