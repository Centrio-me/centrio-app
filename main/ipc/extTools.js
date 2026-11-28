'use strict'
const { ipcMain } = require('electron')
const extTools = require('../services/extTools')
const rates = require('../services/rates')
const { translate } = require('../services/translate')
const adblockLists = require('../services/adblockLists')
const adblock = require('../services/adblock')
const spellfix = require('../services/spellfix')

function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch { /* not registered yet */ }
    ipcMain.handle(channel, handler)
}

const WARM_DICTIONARIES_AFTER_MS = 45 * 1000

function registerExtToolsIpc() {
    safeHandle('exttools:get', (_event, id) => extTools.get(String(id)))
    safeHandle('exttools:set', (_event, id, patch) => extTools.set(String(id), patch))
    safeHandle('exttools:languages', () => extTools.TARGET_LANGUAGES)
    safeHandle('rates:get', () => rates.getRates())
    safeHandle('spellfix:check', (_event, text) => spellfix.check(typeof text === 'string' ? text : ''))
    setTimeout(() => spellfix.warm(), WARM_DICTIONARIES_AFTER_MS)
    // AdBlock: the public filter lists (the switch of AdBlock itself is extensionsState.adblock)
    safeHandle('adblock:status', () => adblockLists.status())
    safeHandle('adblock:set', (_event, options) => {
        const status = adblockLists.setOptions(options && typeof options === 'object' ? options : {})
        adblock.updateAllSessions()
        return status
    })
    safeHandle('adblock:update', async () => {
        const status = await adblockLists.update()
        adblock.updateAllSessions()
        return status
    })
    safeHandle('translate:run', async (_event, text, target) => {
        const settings = extTools.get('translate')
        if (!settings || !settings.enabled) return { ok: false, error: 'off' }
        return translate(text, extTools.TARGET_LANGUAGES.includes(target) ? target : settings.target)
    })
}

module.exports = registerExtToolsIpc
