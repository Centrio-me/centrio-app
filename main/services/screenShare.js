// Screen sharing in calls (3.7.3): Telemost, Google Meet, Zoom and others call getDisplayMedia(), which Electron
// answers "Not supported" unless the app offers screens and windows itself. Centrio shows its own picker (screens,
// windows with previews, the sound of the computer on Windows) and gives the page only what the person picked.
'use strict'

const path = require('path')
const { BrowserWindow, desktopCapturer, ipcMain } = require('electron')
const store = require('./store')
const i18n = require('./i18n')
const { toPickerItems, resolveChoice } = require('./screenShareLogic')

const attached = new WeakSet()
let picker = null // one picker at a time
let getMainWindow = () => null

function strings() {
    const dict = (i18n.getDictionary ? i18n.getDictionary() : null) || {}
    return (dict.v373 && dict.v373.share) || {}
}

function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

function openPicker(items, site) {
    return new Promise((resolve) => {
        const parent = getMainWindow()
        const dark = (store.get('settings', {}) || {}).theme !== 'light'
        const win = new BrowserWindow({
            width: 760,
            height: 560,
            minWidth: 520,
            minHeight: 420,
            parent: parent && !parent.isDestroyed() ? parent : undefined,
            modal: false,
            show: false,
            frame: false,
            resizable: true,
            minimizable: false,
            maximizable: false,
            fullscreenable: false,
            skipTaskbar: true,
            backgroundColor: dark ? '#141416' : '#f6f6f8',
            title: 'Centrio',
            webPreferences: {
                preload: path.join(__dirname, 'screenshare', 'pickerPreload.js'),
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true
            }
        })
        picker = win
        let settled = false
        const finish = (choice) => {
            if (settled) return
            settled = true
            ipcMain.removeListener('screen-share:choice', onChoice)
            ipcMain.removeHandler('screen-share:init')
            if (!win.isDestroyed()) win.destroy()
            picker = null
            resolve(choice)
        }
        const onChoice = (event, choice) => {
            if (event.sender !== win.webContents) return
            finish(choice && typeof choice === 'object' ? { id: String(choice.id || ''), audio: choice.audio === true } : null)
        }
        ipcMain.on('screen-share:choice', onChoice)
        ipcMain.handle('screen-share:init', (event) => (event.sender === win.webContents
            ? { items, site, strings: strings(), canShareSound: process.platform === 'win32' }
            : null))
        win.on('closed', () => finish(null))
        win.webContents.on('will-navigate', (e) => e.preventDefault())
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        win.loadFile(path.join(__dirname, 'screenshare', 'picker.html'), { query: { theme: dark ? 'dark' : 'light' } })
        win.once('ready-to-show', () => { if (!win.isDestroyed()) { win.show(); win.focus() } })
    })
}

async function handleRequest(request, callback) {
    if (picker) { callback({}); return } // a picker is already open
    try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true })
        const items = toPickerItems(sources, { screenLabel: strings().screen || 'Экран {n}' })
        const site = hostOf((request && request.frame && request.frame.url) || (request && request.securityOrigin) || '')
        const choice = await openPicker(items, site)
        const answer = resolveChoice(sources, choice, process.platform)
        callback(answer || {})
    } catch (e) {
        try { callback({}) } catch { /* already answered */ }
    }
}

/** Called for every messenger session together with its permission handler. */
function attach(session) {
    if (!session || attached.has(session) || typeof session.setDisplayMediaRequestHandler !== 'function') return
    attached.add(session)
    session.setDisplayMediaRequestHandler((request, callback) => { handleRequest(request, callback) })
}

function init({ getMainWindow: getter }) {
    if (typeof getter === 'function') getMainWindow = getter
}

module.exports = { attach, init }
