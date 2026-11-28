'use strict'
const { ipcMain } = require('electron')
const spellcheck = require('../services/spellcheck')

function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch { /* not registered yet */ }
    ipcMain.handle(channel, handler)
}

function registerSpellcheckIpc() {
    spellcheck.init()
    safeHandle('spellcheck:get', () => spellcheck.getState())
    safeHandle('spellcheck:set', (_event, options) => spellcheck.setOptions(options && typeof options === 'object' ? options : {}))
    safeHandle('spellcheck:add-word', (_event, word) => spellcheck.addWord(word))
    safeHandle('spellcheck:remove-word', (_event, word) => spellcheck.removeWord(word))
}

module.exports = registerSpellcheckIpc
