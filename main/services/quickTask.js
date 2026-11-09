// Quick task (3.7.2): a global shortcut opens a small input over every window, wherever the person is working.
// The typed text is parsed Todoist-style (shared/task-parse.js: "Отчёт завтра !1") and sent to the main window,
// which stores it with the other tasks (renderer/todos-bind.js) — tasks have one home and one sync path.
'use strict'

const path = require('path')
const { BrowserWindow, ipcMain, screen } = require('electron')
const store = require('./store')
const i18n = require('./i18n')
const lockState = require('./lockState')
const entitlement = require('./entitlement')
const { parseQuickTask } = require('../../shared/task-parse')

const WIDTH = 600
const HEIGHT = 150
const MAX_TEXT = 200

let win = null
let getMainWindow = () => null

const isQuickWindow = (event) => !!win && !win.isDestroyed() && event.sender === win.webContents

function strings() {
    const lang = i18n.getCurrentLanguage ? i18n.getCurrentLanguage() : 'ru'
    const dict = (i18n.getDictionary ? i18n.getDictionary(lang) : null) || {}
    const v = dict.v372 || {}
    return { lang, quick: v.quick || {}, cal: v.cal || {}, todos: dict.todos || {} }
}

function dateLabel(iso, lang) {
    if (!iso) return ''
    const date = new Date(iso + 'T00:00:00')
    const pad = (n) => String(n).padStart(2, '0')
    const today = new Date()
    const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const { cal } = strings()
    if (iso === toIso(today)) return cal.today || 'Сегодня'
    if (iso === toIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1))) return cal.tomorrow || 'Завтра'
    try { return date.toLocaleDateString(lang, { weekday: 'short', day: 'numeric', month: 'long' }) } catch { return iso }
}

function describe(text) {
    const parsed = parseQuickTask(String(text || '').slice(0, MAX_TEXT))
    const { lang, todos } = strings()
    const priorityKey = parsed.priority === 'none' ? '' : 'priority' + parsed.priority[0].toUpperCase() + parsed.priority.slice(1)
    return { ...parsed, dateLabel: dateLabel(parsed.dueDate, lang), priorityLabel: priorityKey ? (todos[priorityKey] || parsed.priority) : '' }
}

function createWindow() {
    const dark = (store.get('settings', {}) || {}).theme !== 'light'
    win = new BrowserWindow({
        width: WIDTH,
        height: HEIGHT,
        show: false,
        frame: false,
        resizable: false,
        movable: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: true,
        hasShadow: false,
        backgroundColor: '#00000000',
        title: 'Centrio',
        webPreferences: {
            preload: path.join(__dirname, 'quicktask', 'quickTaskPreload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            spellcheck: true
        }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.loadFile(path.join(__dirname, 'quicktask', 'quickTask.html'), { query: { theme: dark ? 'dark' : 'light' } })
    // Like a launcher: clicking elsewhere puts it away.
    win.on('blur', () => hide())
    win.on('closed', () => { win = null })
    // never navigate away from our own page
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

function placeOnActiveDisplay() {
    const point = screen.getCursorScreenPoint()
    const { workArea } = screen.getDisplayNearestPoint(point)
    const x = Math.round(workArea.x + (workArea.width - WIDTH) / 2)
    const y = Math.round(workArea.y + workArea.height * 0.22)
    win.setBounds({ x, y, width: WIDTH, height: HEIGHT })
}

function show() {
    if (!win || win.isDestroyed()) createWindow()
    placeOnActiveDisplay()
    const reveal = () => {
        if (!win || win.isDestroyed()) return
        win.show()
        win.focus()
        // the quick task is PRO, like tasks in the calendar (3.7.2): without it the window explains that instead
        win.webContents.send('quick-task:shown', { ...strings(), pro: entitlement.isEffectivePro() })
    }
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal)
    else reveal()
}

function hide() {
    if (win && !win.isDestroyed() && win.isVisible()) win.hide()
}

function toggle() {
    // While Centrio is locked with its PIN nobody adds anything to it from outside.
    if (lockState.isLocked()) return
    if (win && !win.isDestroyed() && win.isVisible() && win.isFocused()) hide()
    else show()
}

let deps = {}

function register(options) {
    deps = options || {}
    getMainWindow = deps.getMainWindow
    ipcMain.handle('quick-task:describe', (event, text) => (isQuickWindow(event) ? describe(text) : null))
    ipcMain.handle('quick-task:submit', async (event, text) => {
        if (!isQuickWindow(event)) return { ok: false }
        if (!entitlement.isEffectivePro()) return { ok: false, pro: false }
        const task = describe(text)
        if (!task.text) return { ok: false }
        const main = getMainWindow()
        if (!main || main.isDestroyed() || main.webContents.isLoading()) return { ok: false }
        // "Added" is shown only once the main window confirms it stored the task (it may still be starting up).
        const id = `qt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const stored = waitForAck(id, main.webContents)
        main.webContents.send('quick-task:add', { id, text: task.text, dueDate: task.dueDate, priority: task.priority })
        return (await stored) ? { ok: true, dateLabel: task.dateLabel } : { ok: false }
    })
    ipcMain.on('quick-task:ack', (event, id) => {
        const waiter = pendingAcks.get(id)
        if (waiter && event.sender === waiter.sender) waiter.resolve(true)
    })
    ipcMain.on('quick-task:close', (event) => { if (isQuickWindow(event)) hide() })
    // Without PRO, Enter in the window opens the PRO offer in the main window.
    ipcMain.on('quick-task:upgrade', (event) => {
        if (!isQuickWindow(event)) return
        hide()
        const main = getMainWindow()
        if (!main || main.isDestroyed()) return
        if (deps.showMainWindow) deps.showMainWindow()
        else { main.show(); main.focus() }
        main.webContents.send('shortcut-action', { action: 'proUpgrade', feature: 'calendar' })
    })
}

const ACK_TIMEOUT_MS = 2500
const pendingAcks = new Map()

function waitForAck(id, sender) {
    return new Promise((resolve) => {
        const done = (value) => { clearTimeout(timer); pendingAcks.delete(id); resolve(value) }
        const timer = setTimeout(() => done(false), ACK_TIMEOUT_MS)
        pendingAcks.set(id, { sender, resolve: done })
    })
}

module.exports = { register, toggle, show, hide, describe }
