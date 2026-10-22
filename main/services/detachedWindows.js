// Messengers that live in their own window ("Открыть в отдельном окне" in the sidebar context menu).
//
// The window is a small frameless host (main/services/detached/detachedWindow.html) with our own title bar and one
// <webview> that uses the SAME partition as the messenger's tab in the main window. Because unread counts,
// notifications, login state and media are detected per session in the main process (registerAppEvents.js), all of that
// keeps working with no extra wiring: the polling is keyed by the messenger's partition, not by the window.
//
// A messenger is MOVED, never copied: WhatsApp/Telegram refuse two live copies of one session, so the main window
// replaces the tab's page with a placeholder (renderer/detached-windows.js) and brings the page back when this window closes.
'use strict'

const path = require('path')
const { BrowserWindow, Menu, screen, shell } = require('electron')
const store = require('./store')
const lockState = require('./lockState')
const orgAssignedPartitions = require('./orgAssignedPartitions')
const i18n = require('./i18n')

const STORE_KEY = 'detachedWindows'
const MIN_W = 360
const MIN_H = 440
// The window opens wide, like a normal messenger window (never larger than ~90% of the screen it opens on).
const DEFAULT_W = 1100
const DEFAULT_H = 780
const SCREEN_FILL = 0.9
const MIN_OPACITY = 0.35
const SAVE_DEBOUNCE_MS = 400
const EXTERNAL_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:'])
const STRING_KEYS = ['reload', 'find', 'pin', 'unpin', 'opacity', 'dock', 'minimize', 'maximize', 'restore', 'close',
    'findPlaceholder', 'findNone', 'loadFailed', 'retry', 'prev', 'next']

// messengerId -> { win, record, pinned, opacity, unread, saveTimer }
const entries = new Map()
// host webContents id -> messengerId
const idByHost = new Map()

let getMainWindow = () => null
let closingAll = false

function init(deps) {
    getMainWindow = deps.getMainWindow || getMainWindow
    // While the app is locked nothing of a messenger may stay on screen.
    lockState.onChange((locked) => {
        for (const entry of entries.values()) {
            if (entry.win.isDestroyed()) continue
            if (locked) entry.win.hide()
            else entry.win.showInactive()
        }
    })
}

function sendToMain(channel, ...args) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

// What the renderer sends is data, not trust: keep only the fields we use and re-check each one.
function sanitizeRecord(raw) {
    if (!raw || typeof raw !== 'object') return null
    const id = typeof raw.id === 'string' ? raw.id : String(raw.id || '')
    if (!id || id.length > 120) return null
    let url
    try {
        const u = new URL(String(raw.url || ''))
        if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
        url = u.toString()
    } catch { return null }
    const zoom = Number(raw.zoomLevel)
    return {
        id,
        name: String(raw.name || 'Centrio').slice(0, 80),
        icon: typeof raw.icon === 'string' && raw.icon.length < 600000 ? raw.icon : '',
        url,
        zoomLevel: Number.isFinite(zoom) ? Math.max(0.25, Math.min(5, zoom)) : 1,
        forceDarkMode: raw.forceDarkMode === true
    }
}

function isKnownMessenger(id) {
    const partition = `persist:${id}`
    const list = store.get('messengers', []) || []
    return list.some((m) => m && String(m.id) === id) || orgAssignedPartitions.isRegisteredPartition(partition)
}

function savedState(id) {
    const all = store.get(STORE_KEY, {}) || {}
    return all && typeof all === 'object' ? (all[id] || {}) : {}
}

function persist(entry) {
    clearTimeout(entry.saveTimer)
    entry.saveTimer = setTimeout(() => {
        if (entry.win.isDestroyed()) return
        const all = { ...(store.get(STORE_KEY, {}) || {}) }
        const maximized = entry.win.isMaximized()
        const bounds = maximized ? (all[entry.record.id]?.bounds || entry.win.getNormalBounds()) : entry.win.getBounds()
        all[entry.record.id] = { bounds, maximized, pinned: entry.pinned, opacity: entry.opacity }
        store.set(STORE_KEY, all)
    }, SAVE_DEBOUNCE_MS)
}

// A saved position is only reused while it still lies on a connected screen.
function visibleBounds(b) {
    if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null
    const onScreen = screen.getAllDisplays().some((d) => {
        const a = d.workArea
        return b.x + 80 < a.x + a.width && b.x + b.width - 80 > a.x && b.y < a.y + a.height - 40 && b.y + 40 > a.y
    })
    return onScreen ? { x: Math.round(b.x), y: Math.round(b.y), width: Math.max(MIN_W, Math.round(b.width)), height: Math.max(MIN_H, Math.round(b.height)) } : null
}

// First opening: wide, centred on the screen the main window is on, each further window shifted a little so they do not stack exactly.
function defaultBounds() {
    const main = getMainWindow()
    const display = main && !main.isDestroyed() ? screen.getDisplayMatching(main.getBounds()) : screen.getPrimaryDisplay()
    const area = display.workArea
    const width = Math.max(MIN_W, Math.min(DEFAULT_W, Math.floor(area.width * SCREEN_FILL)))
    const height = Math.max(MIN_H, Math.min(DEFAULT_H, Math.floor(area.height * SCREEN_FILL)))
    const shift = Math.min(entries.size, 6) * 28
    return {
        width,
        height,
        x: Math.min(area.x + Math.floor((area.width - width) / 2) + shift, area.x + area.width - width),
        y: Math.min(area.y + Math.floor((area.height - height) / 2) + shift, area.y + area.height - height)
    }
}

function windowTitle(entry) {
    return entry.unread > 0 ? `${entry.record.name} (${entry.unread > 99 ? '99+' : entry.unread})` : entry.record.name
}

function stateFor(entry) {
    return {
        maximized: entry.win.isMaximized(),
        pinned: entry.pinned,
        opacity: entry.opacity,
        unread: entry.unread
    }
}

function pushState(entry) {
    if (entry.win.isDestroyed() || entry.win.webContents.isDestroyed()) return
    entry.win.webContents.send('detached:state', stateFor(entry))
}

function buildInitData(entry) {
    const settings = store.get('settings', {}) || {}
    const strings = {}
    for (const key of STRING_KEYS) strings[key] = i18n.t(`detached.${key}`, key)
    // Same user-agent the tabs use: the real Chromium version, not a frozen literal (see renderer/webview-tabs-bind.js).
    const chrome = process.versions.chrome || '120.0.0.0'
    const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome.split('.').slice(0, 4).join('.')} Safari/537.36`
    return {
        messenger: entry.record,
        partition: `persist:${entry.record.id}`,
        preloadUrl: require('../ipc/api').getWebviewPreloadPath(),
        userAgent,
        accent: settings.accentColor || '#7b68ee',
        theme: settings.theme === 'light' ? 'light' : 'dark',
        strings,
        state: stateFor(entry)
    }
}

function showEditMenu(win, guest, params) {
    const flags = params.editFlags || {}
    const label = (key) => i18n.t(`detached.${key}`, key)
    let template = []
    if (params.isEditable) {
        template = [
            { label: label('menuCut'), enabled: !!flags.canCut, click: () => guest.cut() },
            { label: label('menuCopy'), enabled: !!flags.canCopy, click: () => guest.copy() },
            { label: label('menuPaste'), enabled: !!flags.canPaste, click: () => guest.paste() },
            { type: 'separator' },
            { label: label('menuSelectAll'), enabled: !!flags.canSelectAll, click: () => guest.selectAll() }
        ]
    } else if (params.selectionText) {
        template = [{ label: label('menuCopy'), click: () => guest.copy() }]
    }
    if (template.length && !win.isDestroyed()) Menu.buildFromTemplate(template).popup({ window: win })
}

function open(rawRecord) {
    const record = sanitizeRecord(rawRecord)
    if (!record) return { success: false, error: 'bad_messenger' }
    if (!isKnownMessenger(record.id)) return { success: false, error: 'unknown_messenger' }

    const existing = entries.get(record.id)
    if (existing && !existing.win.isDestroyed()) {
        focus(record.id)
        return { success: true, existing: true }
    }

    const saved = savedState(record.id)
    const startBounds = visibleBounds(saved.bounds)
    const dark = (store.get('settings', {}) || {}).theme !== 'light'
    const layout = startBounds || defaultBounds()
    const win = new BrowserWindow({
        width: layout.width,
        height: layout.height,
        x: layout.x,
        y: layout.y,
        minWidth: MIN_W,
        minHeight: MIN_H,
        frame: false,
        show: false,
        title: record.name,
        icon: path.join(__dirname, '..', '..', 'assets', 'logo.ico'),
        backgroundColor: dark ? '#0f0f10' : '#f4f4f5',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'detached', 'detachedPreload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webviewTag: true,
            spellcheck: false
        }
    })
    win.setMenuBarVisibility(false)

    const opacity = Math.max(MIN_OPACITY, Math.min(1, Number(saved.opacity) || 1))
    const entry = { win, record, pinned: saved.pinned === true, opacity, unread: 0, saveTimer: null }
    entries.set(record.id, entry)
    idByHost.set(win.webContents.id, record.id)

    if (entry.pinned) win.setAlwaysOnTop(true)
    if (opacity < 1) win.setOpacity(opacity)
    if (saved.maximized) win.maximize()

    // The host page is our own local file: it may not navigate away or open windows of its own.
    win.webContents.on('will-navigate', (e) => e.preventDefault())
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    // A plain right-click in the messenger: cut/copy/paste/select-all (the page itself shows no menu in a <webview>).
    win.webContents.on('did-attach-webview', (_e, guest) => {
        guest.on('context-menu', (_ev, params) => showEditMenu(win, guest, params))
    })

    win.once('ready-to-show', () => { if (!lockState.isLocked() && !win.isDestroyed()) win.show() })
    for (const ev of ['resize', 'move', 'maximize', 'unmaximize']) win.on(ev, () => { persist(entry); if (ev === 'maximize' || ev === 'unmaximize') pushState(entry) })
    win.on('page-title-updated', (e) => e.preventDefault()) // the title is ours: name and unread count

    const hostId = win.webContents.id
    win.once('closed', () => {
        clearTimeout(entry.saveTimer)
        entries.delete(record.id)
        idByHost.delete(hostId)
        if (!closingAll) sendToMain('detached:closed', record.id)
    })

    win.loadFile(path.join(__dirname, 'detached', 'detachedWindow.html')).catch(() => {})
    sendToMain('detached:opened', record.id)
    return { success: true }
}

function focus(id) {
    const entry = entries.get(String(id))
    if (!entry || entry.win.isDestroyed() || lockState.isLocked()) return false
    if (entry.win.isMinimized()) entry.win.restore()
    entry.win.show()
    entry.win.focus()
    return true
}

function close(id) {
    const entry = entries.get(String(id))
    if (!entry || entry.win.isDestroyed()) return false
    entry.win.close()
    return true
}

// On quit: the windows go away together with the app, so the main window is not told to bring the pages back.
function closeAll() {
    closingAll = true
    for (const entry of [...entries.values()]) if (!entry.win.isDestroyed()) entry.win.destroy()
    entries.clear()
    idByHost.clear()
}

function isOpen(id) {
    const entry = entries.get(String(id))
    return !!entry && !entry.win.isDestroyed()
}

function list() {
    return [...entries.keys()]
}

// Called from the unread poll in registerAppEvents.js: the title shows the count, so the taskbar shows it too.
function onUnread(id, count) {
    const entry = entries.get(String(id))
    if (!entry || entry.win.isDestroyed()) return
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
    if (n === entry.unread) return
    entry.unread = n
    entry.win.setTitle(windowTitle(entry))
    pushState(entry)
}

function entryForSender(sender) {
    const id = idByHost.get(sender.id)
    return id ? entries.get(id) || null : null
}

// IPC from the host page. `sender` must be one of our host windows; anything else is ignored.
function handleInit(sender) {
    const entry = entryForSender(sender)
    return entry ? buildInitData(entry) : null
}

function handleControl(sender, action, value) {
    const entry = entryForSender(sender)
    if (!entry || entry.win.isDestroyed()) return
    const win = entry.win
    switch (action) {
        case 'minimize': win.minimize(); break
        case 'maximize': if (win.isMaximized()) win.unmaximize(); else win.maximize(); break
        case 'close': win.close(); break
        case 'pin':
            entry.pinned = value === true
            win.setAlwaysOnTop(entry.pinned)
            persist(entry)
            pushState(entry)
            break
        case 'opacity': {
            const v = Math.max(MIN_OPACITY, Math.min(1, Number(value)))
            if (!Number.isFinite(v)) break
            entry.opacity = v
            win.setOpacity(v)
            persist(entry)
            pushState(entry)
            break
        }
        case 'external':
            try {
                const u = new URL(String(value))
                if (EXTERNAL_SCHEMES.has(u.protocol)) shell.openExternal(u.toString()).catch(() => {})
            } catch { /* not a URL */ }
            break
        default: break
    }
}

// Keys pressed inside the messenger page. Returns true when the key was ours (the caller then swallows it).
// A detached window answers only to window-local keys: tab switching and the other app shortcuts belong to the main window.
function handleGuestKey(guestContents, input) {
    const host = guestContents.hostWebContents
    if (!host || host.isDestroyed() || !idByHost.has(host.id)) return false
    if (input.type !== 'keyDown') return false
    const ctrl = input.control || input.meta
    const key = String(input.key || '').toLowerCase()
    let command = null
    if (ctrl && !input.alt && key === 'f') command = 'find'
    else if ((ctrl && !input.alt && key === 'r') || input.key === 'F5') command = 'reload'
    else if (ctrl && !input.alt && (key === '=' || key === '+')) command = 'zoom-in'
    else if (ctrl && !input.alt && key === '-') command = 'zoom-out'
    else if (ctrl && !input.alt && key === '0') command = 'zoom-reset'
    if (command) {
        if (!host.isDestroyed()) host.send('detached:command', command)
        return true
    }
    return false
}

// True for a messenger page that lives in one of these windows (its keys are not the main window's keys).
function isDetachedGuest(contents) {
    const host = contents.hostWebContents
    return !!host && !host.isDestroyed() && idByHost.has(host.id)
}

module.exports = {
    init, open, focus, close, closeAll, isOpen, list, onUnread,
    handleInit, handleControl, handleGuestKey, isDetachedGuest
}
