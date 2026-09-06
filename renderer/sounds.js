function createSoundsApi({ store, ipcRenderer, getActiveMessengers }) {
    let soundPickerInited = false

    function getBuiltinSoundPath(soundName) {
        return `assets/sounds/${soundName}.wav`
    }

    function playNotifSound(messengerId = null) {
        const settings = store.get('settings', {})
        if (settings.notifSound === false) return

        let soundName = settings.notifSoundName || 'single'

        if (messengerId) {
            const messenger = getActiveMessengers().find(m => m.id === messengerId)
            if (messenger && messenger.notifSound && messenger.notifSound !== '__default__') {
                soundName = messenger.notifSound
            }
        }

        let soundPath
        if (soundName === 'custom') {
            const customPath = settings.notifSoundCustomPath || ''
            if (!customPath) return
            soundPath = customPath
        } else {
            soundPath = getBuiltinSoundPath(soundName)
        }

        ipcRenderer.send('play-sound', soundPath)
    }

    // ── Скоуп на #notifSoundList ── BUGFIX: класс `.sound-item`/`.sound-preview-btn`
    // переиспользуется и в модалке персонального звука мессенджера
    // (#messengerSoundList, см. messenger-sound-ui.js/messenger-sound-bind.js,
    // там свои data-msound/data-msound-preview атрибуты). Без скоупинга здесь
    // document.querySelectorAll('.sound-item') матчил ОБА списка сразу — клик
    // по звуку в модалке конкретного мессенджера дополнительно триггерил этот
    // глобальный обработчик, который писал `undefined` (dataset.sound там не
    // задан) в settings.notifSoundName, тихо ломая глобальный звук по умолчанию.
    function initSoundPicker() {
        const container = document.getElementById('notifSoundList')
        if (!container) return

        const settings = store.get('settings', {})
        const current = settings.notifSoundName || 'single'

        container.querySelectorAll('.sound-item').forEach(item => {
            item.classList.toggle('active', item.dataset.sound === current)
        })

        if (current === 'custom' && settings.notifSoundCustomPath) {
            const customItem = document.getElementById('soundItemCustom')
            const nameEl = document.getElementById('customSoundName')
            if (customItem) customItem.style.display = 'flex'
            if (nameEl) {
                const parts = settings.notifSoundCustomPath.split(/[\\/]/)
                nameEl.textContent = parts[parts.length - 1]
            }
        }

        if (soundPickerInited) return
        soundPickerInited = true

        container.querySelectorAll('.sound-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('.sound-preview-btn')) return
                const soundName = item.dataset.sound
                if (!soundName) return

                container.querySelectorAll('.sound-item').forEach(i => i.classList.remove('active'))
                item.classList.add('active')

                const s = store.get('settings', {})
                s.notifSoundName = soundName
                store.set('settings', s)
            })
        })

        container.querySelectorAll('.sound-preview-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const soundName = btn.dataset.sound

                let soundPath
                if (soundName === 'custom') {
                    const s = store.get('settings', {})
                    soundPath = s.notifSoundCustomPath || null
                } else {
                    soundPath = getBuiltinSoundPath(soundName)
                }

                if (!soundPath) return
                ipcRenderer.send('play-sound', soundPath)
            })
        })

        const uploadBtn = document.getElementById('uploadSoundBtn')
        const fileInput = document.getElementById('soundFileInput')

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => {
                fileInput.click()
            })

            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0]
                if (!file) return

                // BUGFIX ("свои звуки уведомлений не воспроизводятся"):
                // Electron 32+ (this app is on 39.x) no longer exposes a real
                // File#path in the renderer — it's always undefined, so this
                // used to fall back to the bare file.name (e.g. "ring.mp3"),
                // which main/services/sound.js can never resolve to an actual
                // file on disk. playSound() then failed its fs.existsSync
                // check and returned silently — no error anywhere, exactly
                // matching "загружаю, но звук вообще не играет". Resolve the
                // real absolute path via the webUtils bridge exposed in
                // preload.js instead of trusting file.path/file.name.
                const filePath = window.electronAPI?.getPathForFile?.(file) || ''

                if (!filePath) {
                    const orig = uploadBtn.textContent
                    uploadBtn.textContent = 'Не удалось получить путь к файлу'
                    uploadBtn.classList.add('input-error')
                    setTimeout(() => {
                        uploadBtn.textContent = orig
                        uploadBtn.classList.remove('input-error')
                    }, 2500)
                    e.target.value = ''
                    return
                }

                const customItem = document.getElementById('soundItemCustom')
                const nameEl = document.getElementById('customSoundName')

                if (customItem) customItem.style.display = 'flex'
                if (nameEl) nameEl.textContent = file.name

                const s = store.get('settings', {})
                s.notifSoundName = 'custom'
                s.notifSoundCustomPath = filePath
                store.set('settings', s)

                document.querySelectorAll('.sound-item').forEach(i => i.classList.remove('active'))
                if (customItem) customItem.classList.add('active')

                ipcRenderer.send('play-sound', filePath)
                e.target.value = ''
            })
        }
    }

    function previewMessengerSound(soundName) {
        if (soundName === '__default__') {
            playNotifSound()
            return
        }

        const soundPath = getBuiltinSoundPath(soundName)
        ipcRenderer.send('play-sound', soundPath)
    }

    return {
        playNotifSound,
        initSoundPicker,
        previewMessengerSound
    }
}

module.exports = {
    createSoundsApi
}