const { ipcMain } = require('electron')
const store = require('../services/store')

// ── Центр уведомлений: локальная история уведомлений от мессенджеров ────────
// BUGFIX ("центр уведомлений — туда вообще не попадают уведомления"):
// renderer/app-notif-bind.js хранил уведомления от мессенджеров
// (addMessengerNotification()) только в памяти вкладки — они (а) никогда не
// сохранялись на диск, терялись при каждом перезапуске приложения, и (б)
// затирались каждые 45 секунд периодическим опросом админ/облачных
// уведомлений (fetchNotifications() делал `notifications = notifArray`,
// то есть полную замену массива). Здесь применяем ту же схему хранения и
// трансляции, что и у уже проверенного менеджера загрузок
// (main/ipc/downloads.js): main-процесс — источник истины для локальной
// истории, electron-store — персистентность, capped размер истории,
// id-based upsert на стороне рендерера вместо блайнд-оверврайта.
//
// PRIVACY: это ЧИСТО локальная функция. Заголовок/текст уведомления никогда
// никуда не отправляются — ни на сервер Centrio, ни куда-либо ещё. AI-дайджест
// (PRO, opt-in) — отдельная, более поздняя фаза, здесь её нет и close.
const MAX_APP_NOTIF_HISTORY = 200
let messengerNotifHistory = store.get('messengerNotifHistory', []) || []
let mainWindowGetter = null

function persistMessengerNotifHistory() {
    if (messengerNotifHistory.length > MAX_APP_NOTIF_HISTORY) {
        messengerNotifHistory = messengerNotifHistory.slice(0, MAX_APP_NOTIF_HISTORY)
    }
    store.set('messengerNotifHistory', messengerNotifHistory)
}

function broadcastAppNotifUpdate(record) {
    const win = mainWindowGetter && mainWindowGetter()
    if (win && !win.isDestroyed()) {
        win.webContents.send('app-notifs:item-update', record)
    }
}

function safeOn(channel, listener) {
    ipcMain.removeAllListeners(channel)
    ipcMain.on(channel, listener)
}

function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch {}
    ipcMain.handle(channel, handler)
}

// Не доверяем рендереру произвольный объект как есть — например, попытка
// протащить isRead:true в обход счётчика непрочитанных, или нехарактерно
// длинные строки. Лёгкая нормализация вместо полной схемы: соразмерно риску
// (источник — наш собственный renderer-код, не гостевой webview-контент).
function normalizeRecord(input) {
    if (!input || typeof input !== 'object') return null
    const id = typeof input.id === 'string' && input.id
        ? input.id
        : `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return {
        id,
        title: String(input.title || '').slice(0, 500),
        body: String(input.body || '').slice(0, 2000),
        isRead: false,
        createdAt: typeof input.createdAt === 'string' ? input.createdAt : new Date().toISOString(),
        messengerId: typeof input.messengerId === 'string' ? input.messengerId.slice(0, 200) : null,
        imageUrl: null,
        actionLabel: null,
        // Кандидат-URL конкретного чата/сообщения (см. queue()'s options.data
        // extraction в registerAppEvents.js/swNotifPatcher.js) — используется
        // при клике по записи в центре уведомлений, чтобы перейти не просто
        // на вкладку мессенджера, а в нужный диалог. Только длина/тип, без
        // тяжёлой валидации: источник — наш собственный renderer-код, а
        // фактическая проверка same-origin перед навигацией делается на
        // стороне рендерера (app-notif-bind.js) непосредственно перед loadURL.
        actionUrl: typeof input.actionUrl === 'string' ? input.actionUrl.slice(0, 2000) : null
    }
}

function registerAppNotificationsIpc({ getMainWindow }) {
    mainWindowGetter = getMainWindow

    safeHandle('app-notifs:get-history', async () => messengerNotifHistory)

    safeOn('app-notifs:add', (_event, input) => {
        const record = normalizeRecord(input)
        if (!record) return
        // Дедуп: если рендерер уже прислал этот id раньше (например, при
        // повторном IPC после кратковременного разрыва), не плодим дубликат.
        messengerNotifHistory = messengerNotifHistory.filter(n => n.id !== record.id)
        messengerNotifHistory.unshift(record)
        persistMessengerNotifHistory()
        broadcastAppNotifUpdate(record)
    })

    safeOn('app-notifs:mark-all-read', () => {
        messengerNotifHistory = messengerNotifHistory.map(n => ({ ...n, isRead: true }))
        persistMessengerNotifHistory()
    })

    safeOn('app-notifs:remove', (_event, id) => {
        messengerNotifHistory = messengerNotifHistory.filter(n => n.id !== id)
        persistMessengerNotifHistory()
    })

    safeOn('app-notifs:clear', () => {
        messengerNotifHistory = []
        persistMessengerNotifHistory()
    })
}

module.exports = { registerAppNotificationsIpc }
