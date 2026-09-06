const { app } = require('electron')
const { isProtocolUrl } = require('./protocol')

let log
try { log = require('electron-log') } catch { log = console }

function initSingleInstance({ getMainWindow, showMainWindow, handleProtocolUrl }) {
    const gotLock = app.requestSingleInstanceLock()

    if (!gotLock) {
        app.quit()
        return false
    }

    app.on('second-instance', (event, commandLine) => {
        showMainWindow()

        // isProtocolUrl recognizes every scheme we register ourselves as a
        // handler for (currently centrio:// and tg://) — see
        // SUPPORTED_PROTOCOLS in main/config/constants.js.
        const protocolArg = commandLine.find(isProtocolUrl)

        log.info('[singleInstance] second-instance commandLine:', commandLine, 'protocolArg:', protocolArg || '(none)')

        if (protocolArg) {
            handleProtocolUrl(protocolArg, getMainWindow, showMainWindow)
        }
    })

    return true
}

module.exports = {
    initSingleInstance
}