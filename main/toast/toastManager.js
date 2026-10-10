// Notification pop-ups drawn by the app (bottom-right corner, stacked), used instead of the system toast so a
// message can be answered right there. Each pop-up is a small frameless window; it never takes the keyboard from
// whatever the user is typing in until they click into the reply field.
const path = require('path')
const { BrowserWindow, screen } = require('electron')

const WIDTH = 452
const MARGIN = 16
const GAP = 4
const MIN_HEIGHT = 118
const MAX_HEIGHT = 300
const MAX_STACK = 4
const LIFETIME_MS = 8000
const AFTER_REPLY_MS = 1100
const FAILURE_MS = 10000

const toasts = []
const pendingReplies = new Map() // replyId -> what is needed to report a failure after the pop-up is gone
let nextId = 1
let handlers = null

function find(webContents) {
    return toasts.find(toast => !toast.win.isDestroyed() && toast.win.webContents === webContents) || null
}

function layout() {
    const area = screen.getPrimaryDisplay().workArea
    let bottom = area.y + area.height - MARGIN
    for (let i = toasts.length - 1; i >= 0; i--) {
        const toast = toasts[i]
        if (toast.win.isDestroyed()) continue
        const height = toast.height
        const y = bottom - height
        toast.win.setBounds({ x: area.x + area.width - WIDTH - MARGIN, y, width: WIDTH, height })
        bottom = y + 6 - GAP
    }
}

function dispose(toast) {
    clearTimeout(toast.timer)
    const index = toasts.indexOf(toast)
    if (index !== -1) toasts.splice(index, 1)
    if (!toast.win.isDestroyed()) toast.win.destroy()
    layout()
}

function arm(toast, ms = LIFETIME_MS) {
    clearTimeout(toast.timer)
    toast.timer = setTimeout(() => { if (!toast.hover) dispose(toast); else arm(toast, 2000) }, ms)
}

function show({ title, body, icon, app, messengerId, nid, url, canReply, strings, lifetimeMs }) {
    while (toasts.length >= MAX_STACK) dispose(toasts[0])

    const win = new BrowserWindow({
        width: WIDTH,
        height: MIN_HEIGHT,
        show: false,
        frame: false,
        transparent: true,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        focusable: true,
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, 'toastPreload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })
    win.setAlwaysOnTop(true, 'screen-saver')

    const toast = { id: nextId++, win, messengerId, nid, url, canReply: !!canReply, hover: false, timer: null, height: MIN_HEIGHT, replyId: null, meta: { title, icon, app, strings } }
    toasts.push(toast)

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.loadFile(path.join(__dirname, 'toast.html')).then(() => {
        if (win.isDestroyed()) return
        win.webContents.send('toast:init', { title, body, icon, app, canReply: toast.canReply, strings })
        layout()
        win.showInactive()
    }).catch(() => dispose(toast))
    win.on('closed', () => {
        clearTimeout(toast.timer)
        const index = toasts.indexOf(toast)
        if (index !== -1) toasts.splice(index, 1)
        layout()
    })

    arm(toast, lifetimeMs || LIFETIME_MS)
    return toast
}

// Pop-ups send these messages; each is accepted only from a window this module created.
function registerToastIpc(ipcMain, deps) {
    handlers = deps
    const on = (channel, fn) => ipcMain.on(channel, (event, ...args) => {
        const toast = find(event.sender)
        if (toast) fn(toast, ...args)
    })

    on('toast:click', (toast) => {
        handlers.openChat({ messengerId: toast.messengerId, nid: toast.nid, url: toast.url })
        dispose(toast)
    })
    on('toast:close', (toast) => dispose(toast))
    on('toast:extend', (toast) => { toast.hover = false; arm(toast, FAILURE_MS) })
    // After a successful reply the pop-up shows "sent" for a moment and goes away, whatever the mouse is doing.
    on('toast:done', (toast) => {
        toast.hover = false
        clearTimeout(toast.timer)
        toast.timer = setTimeout(() => dispose(toast), AFTER_REPLY_MS)
    })
    on('toast:hover', (toast, on) => { toast.hover = !!on; if (!on) arm(toast, 3000); else clearTimeout(toast.timer) })
    on('toast:resize', (toast, height) => {
        const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height) || MIN_HEIGHT))
        if (next === toast.height) return
        toast.height = next
        layout()
    })
    // Enter sends and the pop-up leaves at once; the answer is awaited in the background and only a failure
    // comes back as a new pop-up (see replyResult).
    on('toast:reply', (toast, text) => {
        if (!toast.canReply || typeof text !== 'string' || !text.trim()) return
        const replyId = `r${toast.id}-${Date.now()}`
        pendingReplies.set(replyId, { messengerId: toast.messengerId, nid: toast.nid, url: toast.url, ...toast.meta })
        handlers.sendReply({ replyId, messengerId: toast.messengerId, nid: toast.nid, text: text.slice(0, 4000) })
        dispose(toast)
    })
}

// The answer of the messenger page. Success is silent (the pop-up is already gone); a failure is shown honestly.
function replyResult(replyId, result) {
    const info = pendingReplies.get(replyId)
    pendingReplies.delete(replyId)
    if (!info || result === 'ok') return
    const strings = info.strings || {}
    show({
        title: info.title,
        body: result === 'no-input' ? (strings.noInput || strings.failed || '') : (strings.failed || ''),
        icon: info.icon,
        app: info.app,
        messengerId: info.messengerId,
        nid: info.nid,
        url: info.url,
        canReply: false,
        strings,
        lifetimeMs: FAILURE_MS
    })
}

module.exports = { show, registerToastIpc, replyResult }
