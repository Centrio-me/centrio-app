'use strict'
// Screen sharing in calls (Telemost, Meet, Zoom) needs Centrio to offer screens and windows itself (3.7.3): the page
// gets only what the person picked in Centrio's own picker.
const test = require('node:test')
const assert = require('node:assert/strict')
const { toPickerItems, resolveChoice } = require('../main/services/screenShareLogic')

const thumb = { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,AAA' }
const empty = { isEmpty: () => true, toDataURL: () => '' }
const sources = [
    { id: 'screen:0:0', name: 'Entire Screen', display_id: '1', thumbnail: thumb, appIcon: null },
    { id: 'screen:1:0', name: 'Screen 2', display_id: '2', thumbnail: thumb, appIcon: null },
    { id: 'window:123:0', name: 'Документ.docx — Word', thumbnail: thumb, appIcon: thumb },
    { id: 'window:999:0', name: '', thumbnail: empty, appIcon: null }
]

test('screens and windows become picker items; nameless/blank windows are dropped', () => {
    const items = toPickerItems(sources)
    assert.deepEqual(items.map(i => [i.id, i.kind]), [['screen:0:0', 'screen'], ['screen:1:0', 'screen'], ['window:123:0', 'window']])
    assert.equal(items[2].thumbnail, 'data:image/png;base64,AAA')
    assert.equal(items[2].icon, 'data:image/png;base64,AAA')
})

test('screens are numbered for people, not "Entire Screen"', () => {
    const items = toPickerItems(sources, { screenLabel: 'Экран {n}' })
    assert.deepEqual(items.filter(i => i.kind === 'screen').map(i => i.name), ['Экран 1', 'Экран 2'])
})

test('a picked source is shared; sound of the computer only on Windows and only when asked', () => {
    assert.deepEqual(resolveChoice(sources, { id: 'window:123:0', audio: false }, 'win32'), { video: sources[2] })
    assert.deepEqual(resolveChoice(sources, { id: 'screen:0:0', audio: true }, 'win32'), { video: sources[0], audio: 'loopback' })
    assert.deepEqual(resolveChoice(sources, { id: 'screen:0:0', audio: true }, 'darwin'), { video: sources[0] })
})

test('cancel or an unknown id shares nothing', () => {
    assert.equal(resolveChoice(sources, null, 'win32'), null)
    assert.equal(resolveChoice(sources, { id: 'window:404:0' }, 'win32'), null)
    assert.equal(resolveChoice(sources, { id: 42 }, 'win32'), null)
})
