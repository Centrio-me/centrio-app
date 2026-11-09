const { resolveTheme } = require('../../shared/theme-fx')
// Screen sharing in calls (3.7.3): Telemost, Google Meet, Zoom and others call getDisplayMedia(), which Electron
// answers "Not supported" unless the app offers screens and windows itself. Centrio shows its own picker (screens,
// windows with previews, the sound of the computer on Windows) and gives the page only what the person picked.
// One request at a time: a second one while the picker is open (or still being prepared) is declined at once.
'use strict'

const path = require('path')
const { BrowserWindow, desktopCapturer, ipcMain, webContents: allWebContents } = require('electron')
const store = require('./store')
const i18n = require('./i18n')
const { toPickerItems, resolveChoice } = require('./screenShareLogic')

const PICKER_TIMEOUT_MS = 2 * 60 * 1000 // a forgotten picker frees the feature by itself

const attached = new WeakSet()
let busy = false // set synchronously at the start of a request, before any await
let current = null // { win, payload, finish }
let getMainWindow = () => null
let ipcReady = false

function strings() {
    const dict = (i18n.getDictionary ? i18n.getDictionary() : null) || {}
    return (dict.v373 && dict.v373.share) || {}
}

function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

// Registered once: the picker page asks for its data, and answers with the choice. Only the current picker counts.
function registerIpc() {
    if (ipcReady) return
    ipcReady = true
    ipcMain.handle('screen-share:init', (event) => (current && event.sender === current.win.webContents ? current.payload : null))
    ipcMain.on('screen-share:choice', (event, choice) => {
        if (!current || event.sender !== current.win.webContents) return
        current.finish(choice && typeof choice === 'object' ? { id: String(choice.id || ''), audio: choice.audio === true } : null)
    })
}

// The window that asked: a messenger tab in the main window or in its own window. The picker sits on top of it,
// or stands alone when that window is hidden or minimised (an owned window would stay invisible then).
function ownerFor() {
    const main = getMainWindow()
    if (main && !main.isDestroyed() && main.isVisible() && !main.isMinimized()) return main
    return undefined
}

function openPicker(items, site, owner, requester) {
    return new Promise((resolve) => {
        const dark = resolveTheme((store.get('settings', {}) || {}).theme, new Date().getHours()).base !== 'light'
        let win = null
        let timer = null
        let settled = false
        const finish = (choice) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            current = null
            if (win && !win.isDestroyed()) win.destroy()
            resolve(choice)
        }
        try {
            win = new BrowserWindow({
                width: 760,
                height: 560,
                minWidth: 520,
                minHeight: 420,
                parent: owner,
                show: false,
                frame: false,
                resizable: true,
                minimizable: false,
                maximizable: false,
                fullscreenable: false,
                skipTaskbar: !!owner,
                alwaysOnTop: !owner,
                backgroundColor: dark ? '#141416' : '#f6f6f8',
                title: 'Centrio',
                webPreferences: {
                    preload: path.join(__dirname, 'screenshare', 'pickerPreload.js'),
                    contextIsolation: true,
                    nodeIntegration: false,
                    sandbox: true
                }
            })
            current = { win, finish, payload: { items, site, strings: strings(), canShareSound: process.platform === 'win32' } }
            timer = setTimeout(() => finish(null), PICKER_TIMEOUT_MS)
            win.on('closed', () => finish(null))
            // the page that asked went away (tab closed, reloaded): nothing to share any more
            if (requester && typeof requester.once === 'function') requester.once('destroyed', () => finish(null))
            win.webContents.on('will-navigate', (e) => e.preventDefault())
            win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
            win.once('ready-to-show', () => { if (!win.isDestroyed()) { win.show(); win.focus() } })
            win.loadFile(path.join(__dirname, 'screenshare', 'picker.html'), { query: { theme: dark ? 'dark' : 'light' } })
                .catch(() => finish(null))
        } catch {
            finish(null)
        }
    })
}

async function handleRequest(request, callback) {
    let answered = false
    const answer = (value) => {
        if (answered) return
        answered = true
        try { callback(value) } catch { /* the page is gone */ }
    }
    if (busy) { answer({}); return } // a picker is already open or being prepared
    busy = true
    try {
        registerIpc()
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true })
        const items = toPickerItems(sources, { screenLabel: strings().screen || 'Экран {n}' })
        const site = hostOf((request && request.frame && request.frame.url) || (request && request.securityOrigin) || '')
        let requester = null
        try { requester = request && request.frame && allWebContents.fromFrame ? allWebContents.fromFrame(request.frame) : null } catch { requester = null }
        const choice = await openPicker(items, site, ownerFor(), requester)
        answer(resolveChoice(sources, choice, process.platform) || {})
    } catch {
        answer({})
    } finally {
        busy = false
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
    registerIpc()
}

module.exports = { attach, init }
