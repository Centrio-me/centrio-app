const { showSaveToast, showProgressToast, hideSaveToast } = require('./save-toast')
const { progressView, applyUpdate } = require('../shared/download-progress')

// After «Файл сохранён» the next «Скачивается…» tick of another file waits a moment, so the result can be read
const RESULT_QUIET_MS = 2500
function bindDownloads({
    store,
    ipcRenderer,
    invokeIpc,
    tGet
}) {
    // How a file the messenger downloaded ended (main/ipc/downloads.js sends it): saved with a way to see it, or a plain failure
    let activeDownloads = new Map()
    let quietUntil = 0
    const showActive = () => {
        const view = progressView([...activeDownloads.values()], {
            one: tGet('ctx.fileLoading'),
            oneWithPercent: tGet('ctx.fileLoadingPercent'),
            many: tGet('ctx.filesLoading')
        })
        if (view) showProgressToast(view.text, view.fraction)
        else hideSaveToast()
    }

    // (the bridge hands over the payload only, no event: with the old (_event, info) signature this toast never showed at all)
    ipcRenderer.on('download-toast', (info) => {
        const name = (info && info.name) || ''
        activeDownloads = applyUpdate(activeDownloads, info)
        // a file is coming down: say so, with how far it got (changed in place), instead of silence until it is saved
        if (info && (info.state === 'started' || info.state === 'progress')) {
            if (Date.now() >= quietUntil) showActive()
            return
        }
        if (info && info.state === 'cancelled') { showActive(); return }
        // a file the reader took: its window opens in a moment (a Word file is made into a PDF first, which takes a second or two)
        if (info && info.state === 'handled') {
            if (activeDownloads.size > 0) showActive()
            else showSaveToast({ kind: 'ok', text: tGet('ctx.fileOpening').replace('{name}', name) })
            return
        }
        quietUntil = Date.now() + RESULT_QUIET_MS
        if (info && info.state === 'completed') {
            showSaveToast({
                kind: 'ok',
                text: tGet('ctx.fileSaved').replace('{name}', name),
                actionLabel: tGet('ctx.imgShow'),
                onAction: () => ipcRenderer.send('downloads:show-in-folder', info.id)
            })
        } else if (info) {
            showSaveToast({ kind: 'error', text: tGet('ctx.fileFail').replace('{name}', name) })
        }
    })

    function updateDownloadDirUI(dir) {
        const text = document.getElementById('downloadDirText')
        const clearBtn = document.getElementById('clearDownloadDirBtn')
        if (!text || !clearBtn) return

        if (dir) {
            text.textContent = dir
            text.style.color = 'var(--text-primary)'
            clearBtn.style.display = 'block'
        } else {
            text.textContent = tGet('settings.downloadDirEmpty')
            text.style.color = 'var(--text-secondary)'
            clearBtn.style.display = 'none'
        }
    }

    // BUGFIX ("выбрал папку, а сохранение всё равно спрашивает куда сохранять"):
    // store.set('settings.downloadDir', dir) — dot-path — writes correctly to
    // disk (main-процесс's electron-store умеет вложенные пути), но локальный
    // storeCache в renderer.js — плоский Map: он кладёт значение под отдельным
    // ключом 'settings.downloadDir', а не мёржит его в уже закешированный
    // объект 'settings'. Любой код, читающий store.get('settings', {})
    // синхронно (а именно так settings-ui.js собирает объект для сохранения
    // при "Применить") видел старый settings БЕЗ downloadDir и при следующем
    // сохранении настроек перезаписывал уже сохранённый на диске downloadDir
    // обратно в пустую строку — отсюда же и "не спрашивать куда сохранять"
    // не работало,
    // поскольку эта настройка сама по себе работает только когда downloadDir
    // не пуст. Правильно — читать/менять/записывать целиком объект 'settings',
    // тем же ключом, который читает getSettings().
    function updateCachedSetting(key, value) {
        const settings = store.get('settings', {}) || {}
        settings[key] = value
        store.set('settings', settings)
    }

    function bind() {
        document.getElementById('chooseDownloadDirBtn').addEventListener('click', async () => {
            const result = await invokeIpc('choose-download-dir')
            if (!result.success) return

            const dir = result.data
            if (dir) {
                updateCachedSetting('downloadDir', dir)
                updateDownloadDirUI(dir)
                ipcRenderer.send('set-download-dir', dir)
            }
        })

        document.getElementById('clearDownloadDirBtn').addEventListener('click', () => {
            updateCachedSetting('downloadDir', '')
            updateDownloadDirUI('')
            ipcRenderer.send('set-download-dir', '')
        })

        document.getElementById('settingAskDownload').addEventListener('change', (e) => {
            updateCachedSetting('askDownload', e.target.checked)
            ipcRenderer.send('set-ask-download', e.target.checked)
        })
    }

    return {
        bind,
        updateDownloadDirUI
    }
}

module.exports = {
    bindDownloads
}