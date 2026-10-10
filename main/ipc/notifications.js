const { ipcMain, nativeImage } = require('electron')
const { PATHS, APP_NAME, IPC_CHANNELS } = require('../config/constants')
const { safeSendToWindow } = require('../utils/window')
const { t } = require('../services/i18n')
const tracker = require('../services/tracker')
const lockState = require('../services/lockState')
const store = require('../services/store')
const toastManager = require('../toast/toastManager')

const lastNotifTime = {}
const REPEAT_WINDOW_MS = 1500

function registerNotificationsIpc({ getMainWindow, showMainWindow }) {
    // Сигнал от renderer/lock.js (showLockScreen()/hideLockScreen()) о текущем
    // состоянии экрана блокировки — единственный потребитель этого канала,
    // поэтому регистрируем слушатель прямо здесь, а не отдельным модулем.
    // Локальная история уведомлений (main/ipc/appNotifications.js,
    // app-notifs:add) — независимый канал, этим флагом НЕ гасится: виджет
    // "Недавняя активность" на самом лок-скрине должен продолжать пополняться.
    ipcMain.removeAllListeners('lock:set-state')
    ipcMain.on('lock:set-state', (_event, locked) => lockState.setLocked(locked))

    // What a click on a notification (the pop-up or the system toast) does: bring the app to the front, open the
    // messenger tab and ask its page to open the very chat.
    const openChat = ({ messengerId, nid, url }) => {
        showMainWindow()
        safeSendToWindow(getMainWindow, IPC_CHANNELS.NOTIFICATION_CLICKED_ID, messengerId)
        const safeNid = typeof nid === 'string' && /^n\d{1,9}$/.test(nid) ? nid : ''
        const safeUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : ''
        if (safeNid || safeUrl) {
            safeSendToWindow(getMainWindow, 'notification-open-chat', { messengerId, nid: safeNid, url: safeUrl })
        }
    }

    toastManager.registerToastIpc(ipcMain, {
        openChat,
        sendReply: (payload) => safeSendToWindow(getMainWindow, 'notification-reply', payload)
    })
    ipcMain.removeAllListeners('notification-reply-result')
    ipcMain.on('notification-reply-result', (_event, replyId, result) => toastManager.replyResult(String(replyId || ''), ['ok', 'no-input', 'not-opened'].includes(result) ? result : 'failed'))

    // Why a notification was or was not shown (messenger name and a reason only, never the message).
    ipcMain.on('notif-diag', (_event, info) => {
        const messenger = String((info && info.messenger) || '').slice(0, 40)
        const decision = String((info && info.decision) || '').slice(0, 40)
        const kind = String((info && info.tag) || '').slice(0, 12)
        let log = console
        try { log = require('electron-log') } catch { /* console is enough */ }
        log.info(`[notif] ${messenger} (${kind}): ${decision}`)
    })

    ipcMain.on('show-notification', async (event, { title, body, icon, messengerId, nid, url, app: appLabel, canReply }) => {
        try {
            // Главное требование пользователя: пока экран заблокирован, нативный
            // OS-тост поверх лок-скрина всплывать не должен — это противоречит
            // смыслу блокировки. Выходим до скачивания иконки и до создания
            // Notification, чтобы не тратить сеть/время впустую.
            if (lockState.isLocked()) return

            // Two different people writing within a second must both get a toast: only an exact repeat is dropped.
            const now = Date.now()
            const throttleKey = `${messengerId}::${title}::${body}`
            if (lastNotifTime[throttleKey] && now - lastNotifTime[throttleKey] < REPEAT_WINDOW_MS) return
            lastNotifTime[throttleKey] = now
            for (const key of Object.keys(lastNotifTime)) { if (now - lastNotifTime[key] > 60000) delete lastNotifTime[key] }

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

            // The app's own pop-up (with a reply field where the messenger supports it) unless the user chose system toasts.
            if ((store.get('settings', {}) || {}).notifPopup !== false) {
                try {
                    toastManager.show({
                        title: title || APP_NAME,
                        body: body || t('system.notificationDefault'),
                        icon: iconImage.resize({ width: 96 }).toDataURL(),
                        app: typeof appLabel === 'string' ? appLabel.slice(0, 60) : '',
                        messengerId,
                        nid: typeof nid === 'string' ? nid : '',
                        url: typeof url === 'string' ? url : '',
                        canReply: !!canReply && typeof nid === 'string' && nid !== '',
                        strings: {
                            replyPlaceholder: t('toast.replyPlaceholder'),
                            send: t('toast.send'),
                            sent: t('toast.sent'),
                            failed: t('toast.failed'),
                            noInput: t('toast.noInput'),
                            notOpened: t('toast.notOpened'),
                            openChat: t('toast.openChat'),
                            close: t('toast.close')
                        }
                    })
                    return
                } catch (popupError) {
                    console.error('notification pop-up failed, using the system toast:', popupError)
                }
            }

            const notification = new Notification({
                title: title || APP_NAME,
                body: body || t('system.notificationDefault'),
                icon: iconImage,
                silent: true
            })

            notification.on('click', () => openChat({ messengerId, nid, url }))

            notification.show()
        } catch (e) {
            console.error('show-notification error:', e)
        }
    })
}

module.exports = registerNotificationsIpc