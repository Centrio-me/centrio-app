const { ipcMain, nativeImage } = require('electron')
const { PATHS, APP_NAME, IPC_CHANNELS } = require('../config/constants')
const { safeSendToWindow } = require('../utils/window')
const { t } = require('../services/i18n')
const tracker = require('../services/tracker')
const lockState = require('../services/lockState')

const lastNotifTime = {}

function registerNotificationsIpc({ getMainWindow, showMainWindow }) {
    // Сигнал от renderer/lock.js (showLockScreen()/hideLockScreen()) о текущем
    // состоянии экрана блокировки — единственный потребитель этого канала,
    // поэтому регистрируем слушатель прямо здесь, а не отдельным модулем.
    // Локальная история уведомлений (main/ipc/appNotifications.js,
    // app-notifs:add) — независимый канал, этим флагом НЕ гасится: виджет
    // "Недавняя активность" на самом лок-скрине должен продолжать пополняться.
    ipcMain.removeAllListeners('lock:set-state')
    ipcMain.on('lock:set-state', (_event, locked) => lockState.setLocked(locked))

    ipcMain.on('show-notification', async (event, { title, body, icon, messengerId }) => {
        try {
            // Главное требование пользователя: пока экран заблокирован, нативный
            // OS-тост поверх лок-скрина всплывать не должен — это противоречит
            // смыслу блокировки. Выходим до скачивания иконки и до создания
            // Notification, чтобы не тратить сеть/время впустую.
            if (lockState.isLocked()) return

            const now = Date.now()
            if (lastNotifTime[messengerId] && now - lastNotifTime[messengerId] < 1000) return
            lastNotifTime[messengerId] = now

            const { Notification } = require('electron')
            const https = require('https')
            const http = require('http')

            // BUGFIX ("подвисания на 10-15 сек когда приходит сообщение"): без
            // таймаута медленный/недоступный CDN иконки (например через VPN/прокси)
            // держит этот await открытым неограниченно долго на КАЖДОЕ входящее
            // сообщение — request.setTimeout() обрывает зависшую загрузку.
            const ICON_FETCH_TIMEOUT_MS = 4000
            async function downloadImageAsNativeImage(url) {
                return new Promise((resolve) => {
                    try {
                        const client = url.startsWith('https') ? https : http
                        const req = client.get(url, (res) => {
                            const chunks = []
                            res.on('data', chunk => chunks.push(chunk))
                            res.on('end', () => {
                                try {
                                    const buffer = Buffer.concat(chunks)
                                    const img = nativeImage.createFromBuffer(buffer)
                                    if (!img.isEmpty()) resolve(img)
                                    else resolve(null)
                                } catch {
                                    resolve(null)
                                }
                            })
                            res.on('error', () => resolve(null))
                        })
                        req.on('error', () => resolve(null))
                        req.setTimeout(ICON_FETCH_TIMEOUT_MS, () => {
                            req.destroy()
                            resolve(null)
                        })
                    } catch {
                        resolve(null)
                    }
                })
            }

            let iconImage = null

            try {
                if (icon && icon.startsWith('data:')) {
                    iconImage = nativeImage.createFromDataURL(icon)
                    if (iconImage.isEmpty()) iconImage = null
                } else if (icon && (icon.startsWith('http://') || icon.startsWith('https://'))) {
                    iconImage = await downloadImageAsNativeImage(icon)
                } else if (icon) {
                    iconImage = nativeImage.createFromPath(icon)
                    if (iconImage.isEmpty()) iconImage = null
                }
            } catch {
                iconImage = null
            }

            if (!iconImage || iconImage.isEmpty()) {
                iconImage = nativeImage.createFromPath(PATHS.ICON)
            }

            const notification = new Notification({
                title: title || APP_NAME,
                body: body || t('system.notificationDefault'),
                icon: iconImage,
                silent: true
            })

            notification.on('click', () => {
                showMainWindow()
                safeSendToWindow(getMainWindow, IPC_CHANNELS.NOTIFICATION_CLICKED_ID, messengerId)
            })

            notification.show()
        } catch (e) {
            console.error('show-notification error:', e)
        }
    })
}

module.exports = registerNotificationsIpc