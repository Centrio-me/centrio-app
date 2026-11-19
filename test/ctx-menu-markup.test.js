const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')
const start = html.indexOf('<div id="contextMenu"')
const end = html.indexOf('<!-- Контекстное меню папки -->')
const block = html.slice(start, end)

// every id the handlers of the menu look up (renderer/context-actions-bind.js, context-menus.js, unread.js, messenger-sound-bind.js)
const IDS = ['ctxLockedNote', 'ctxReload', 'ctxSound', 'ctxDetach', 'ctxKeepAwake', 'ctxKeepAwakeToggle', 'ctxMic', 'ctxMicToggle',
    'ctxCam', 'ctxCamToggle', 'ctxFilesWindow', 'ctxFilesToggle', 'ctxVpn', 'ctxVpnLabel', 'ctxVpnToggle', 'ctxNotifOpen', 'ctxMute',
    'ctxDarkMode', 'ctxDarkModeLabel', 'ctxEdit', 'ctxMoveToFolder', 'ctxRemoveFromFolder', 'ctxMoveToWorkspace', 'ctxChangeIcon',
    'ctxRemove', 'ctxHeadName']

test('the tab menu keeps every element its handlers look for, once each', () => {
    assert.ok(start > 0 && end > start, 'the block of the menu is found')
    for (const id of IDS) assert.equal(block.split(`id="${id}"`).length, 2, id)
})

test('actions are tiles in two rows of three: what to do, then what the tab may use (owner, 2026-11-19: «3 иконки в ряд»)', () => {
    const rows = block.match(/class="ctx-tiles">[\s\S]*?\n    <\/div>/g) || []
    assert.equal(rows.length, 2)
    for (const id of ['ctxReload', 'ctxSound', 'ctxDetach']) assert.ok(rows[0].includes(`id="${id}"`), id)
    for (const id of ['ctxMic', 'ctxCam', 'ctxKeepAwake']) assert.ok(rows[1].includes(`id="${id}"`), id)
})

test('the short labels of the tiles exist in all seven languages', () => {
    for (const lang of ['ru', 'en', 'de', 'es', 'fr', 'it', 'zh']) {
        const ctx = require(`../locales/${lang}.js`).ctx
        for (const key of ['tileReload', 'tileSound', 'tileWindow', 'tileAwake', 'tileMic', 'tileCam']) assert.ok(ctx[key], `${lang}.${key}`)
    }
})
