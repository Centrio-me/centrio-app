const { Tray, Menu, nativeImage, app } = require('electron')
const { APP_NAME, PATHS } = require('./config/constants')
const { t } = require('./services/i18n')

let tray = null
let getMainWindow = null
let showMainWindow = null
let isQuittingRef = null

function initTray(deps) {
    getMainWindow = deps.getMainWindow
    showMainWindow = deps.showMainWindow
    isQuittingRef = deps.isQuittingRef
}

function createTray() {
    let trayIcon
    try {
        trayIcon = nativeImage.createFromPath(PATHS.TRAY_ICON)
        if (trayIcon.isEmpty()) trayIcon = nativeImage.createEmpty()
    } catch {
        trayIcon = nativeImage.createEmpty()
    }

    // macOS: иконка должна быть 16×16 и помечена как template —
    // система сама адаптирует цвет под dark/light menu bar
    if (process.platform === 'darwin' && !trayIcon.isEmpty()) {
        trayIcon = trayIcon.resize({ width: 16, height: 16 })
        trayIcon.setTemplateImage(true)
    }

    tray = new Tray(trayIcon)
    tray.setToolTip(APP_NAME)
    updateTrayMenu(0)

    tray.on('click', () => showMainWindow())
    tray.on('double-click', () => showMainWindow())
}

function updateTrayMenu(unreadCount = 0) {
    if (!tray) return

    const contextMenu = Menu.buildFromTemplate([
        { label: unreadCount > 0 ? `${APP_NAME} (${unreadCount})` : APP_NAME, enabled: false },
        { type: 'separator' },
        { label: t('tray.open'), click: () => showMainWindow() },
        {
            label: t('tray.hide'),
            click: () => {
                const win = getMainWindow()
                if (win) win.hide()
            }
        },
        { type: 'separator' },
        {
            label: t('tray.quit'),
            click: () => {
                isQuittingRef.value = true
                app.quit()
            }
        }
    ])

    tray.setContextMenu(contextMenu)
    tray.setToolTip(
        unreadCount > 0
            ? `${APP_NAME} — ${unreadCount} ${t('tray.unread')}`
            : APP_NAME
    )
}

module.exports = {
    initTray,
    createTray,
    updateTrayMenu
}