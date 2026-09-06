const { ipcMain, dialog, app } = require('electron')
const fs = require('fs')
const path = require('path')
const store = require('../services/store')

// ── Фон экрана блокировки ────────────────────────────────────────────────
// По фидбеку пользователя: "Изображения - лучше локальные... кнопка -
// загрузить свою картинку". Два режима хранения:
//   - preset — один из встроенных градиентных SVG (assets/lock-backgrounds/),
//     это НАШИ собственные сгенерированные файлы (не сторонние фото), поэтому
//     их можно грузить прямым относительным путём в CSS как и остальные
//     локальные ассеты (fonts/logo.png и т.д. — см. styles.css) без
//     дополнительных сетевых/CSP вопросов.
//   - custom — картинка, которую выбрал сам пользователь через системный
//     диалог. Файл копируется в userData (переживает обновления приложения,
//     не зависит от исходного пути), а рендереру отдаётся как data:-URL —
//     CSP лок-скрина (img-src 'self' data: blob: ...) уже разрешает data:,
//     так не нужно ни трогать CSP, ни городить file://-исключения.
const PRESET_IDS = ['aurora', 'beach', 'lake']
const MAX_CUSTOM_BYTES = 12 * 1024 * 1024 // 12MB — с запасом для обычного фото, но не бесконечно
const ALLOWED_EXTS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }

function customDir() {
    return path.join(app.getPath('userData'), 'lockBackground')
}

function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch {}
    ipcMain.handle(channel, handler)
}

function readCustomAsDataUrl(filename) {
    const filePath = path.join(customDir(), filename)
    if (!fs.existsSync(filePath)) return null
    const ext = path.extname(filename).toLowerCase()
    const mime = ALLOWED_EXTS[ext]
    if (!mime) return null
    const buffer = fs.readFileSync(filePath)
    return `data:${mime};base64,${buffer.toString('base64')}`
}

function registerLockBackgroundIpc({ getMainWindow }) {
    // Текущий выбор: { type: 'none' } | { type: 'preset', value: 'aurora' } |
    // { type: 'custom', value: '<filename в userData/lockBackground>' }
    safeHandle('lock-bg:get', async () => {
        const state = store.get('lockBackground', { type: 'preset', value: 'aurora' })
        if (state?.type === 'custom') {
            const dataUrl = readCustomAsDataUrl(state.value)
            if (!dataUrl) return { type: 'none' } // файл пропал/повреждён — тихий fallback
            return { type: 'custom', dataUrl }
        }
        if (state?.type === 'preset' && PRESET_IDS.includes(state.value)) {
            return { type: 'preset', value: state.value }
        }
        return { type: 'none' }
    })

    safeHandle('lock-bg:set-preset', async (_event, presetId) => {
        if (!PRESET_IDS.includes(presetId)) return { success: false }
        store.set('lockBackground', { type: 'preset', value: presetId })
        return { success: true }
    })

    safeHandle('lock-bg:clear', async () => {
        store.set('lockBackground', { type: 'none' })
        return { success: true }
    })

    safeHandle('lock-bg:choose-custom', async () => {
        const win = getMainWindow()
        const result = await dialog.showOpenDialog(win || undefined, {
            properties: ['openFile'],
            filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
        })
        if (result.canceled || !result.filePaths?.length) return { success: false }

        const srcPath = result.filePaths[0]
        const ext = path.extname(srcPath).toLowerCase()
        if (!ALLOWED_EXTS[ext]) return { success: false, error: 'unsupported-type' }

        let stat
        try {
            stat = fs.statSync(srcPath)
        } catch {
            return { success: false, error: 'read-failed' }
        }
        if (stat.size > MAX_CUSTOM_BYTES) return { success: false, error: 'too-large' }

        const dir = customDir()
        fs.mkdirSync(dir, { recursive: true })

        // Один сохранённый кастомный фон одновременно — чистим предыдущие
        // файлы (могли остаться с другим расширением от прошлого выбора).
        for (const existing of fs.readdirSync(dir)) {
            try { fs.unlinkSync(path.join(dir, existing)) } catch {}
        }

        const filename = `custom${ext}`
        fs.copyFileSync(srcPath, path.join(dir, filename))
        store.set('lockBackground', { type: 'custom', value: filename })

        const dataUrl = readCustomAsDataUrl(filename)
        if (!dataUrl) return { success: false, error: 'read-failed' }
        return { success: true, dataUrl }
    })
}

module.exports = { registerLockBackgroundIpc, PRESET_IDS }
