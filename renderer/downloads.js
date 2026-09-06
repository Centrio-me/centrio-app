function bindDownloads({
    store,
    ipcRenderer,
    invokeIpc,
    tGet
}) {
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