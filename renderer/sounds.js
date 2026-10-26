// The ringtones that ship with the app: assets/sounds/ringtone-<id>.mp3. Anything else a saved setting names (the sounds of
// older versions) counts as "not chosen", so it plays the default.
// 11 is the notification sound of Telegram Web ("tuk-tuk").
const RINGTONES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11']
// Older sounds kept on request, with their own file names.
const EXTRA_SOUND_FILES = { single: 'single.wav' }
const DEFAULT_RINGTONE = '10'
const CUSTOM_SOUND = 'custom'

function isRingtone(name) {
    const key = String(name)
    return RINGTONES.includes(key) || Object.prototype.hasOwnProperty.call(EXTRA_SOUND_FILES, key)
}

function soundFileName(name) {
    const key = isRingtone(name) ? String(name) : DEFAULT_RINGTONE
    return EXTRA_SOUND_FILES[key] || `ringtone-${key}.mp3`
}

function createSoundsApi({ store, ipcRenderer, getActiveMessengers }) {
    let soundPickerInited = false

    function getBuiltinSoundPath(soundName) {
        return `assets/sounds/${soundFileName(soundName)}`
    }

    // The sound the user chose for everyone, as a valid name.
    function chosenSoundName(settings) {
        const name = settings.notifSoundName
        return isRingtone(name) || (name === CUSTOM_SOUND && settings.notifSoundCustomPath) ? name : DEFAULT_RINGTONE
    }

    // Sounds play inside the app window with the browser's own audio. The old way (a PowerShell process per beep, see
    // main/services/sound.js) silently did nothing on PCs where PowerShell is restricted, on paths with an apostrophe
    // and in corporate setups — "pressing play does nothing". The old path stays as a fallback if the page cannot play it.
    const SOUND_VOLUME = 0.7
    let lastAudio = null
    const toFileUrl = (p) => {
        const parts = String(p).split(/[\\/]+/).filter(Boolean)
        return 'file:///' + parts.map((part, i) => (i === 0 && /^[a-zA-Z]:$/.test(part) ? part : encodeURIComponent(part))).join('/')
    }
    const isAbsolutePath = (p) => /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/')

    function playSoundFile(soundPath) {
        const fallback = () => ipcRenderer.send('play-sound', soundPath)
        try {
            const audio = new Audio(isAbsolutePath(soundPath) ? toFileUrl(soundPath) : soundPath)
            audio.volume = SOUND_VOLUME
            audio.addEventListener('error', fallback, { once: true })
            lastAudio = audio // keep it alive until it has finished
            const started = audio.play()
            if (started && typeof started.catch === 'function') started.catch(fallback)
        } catch { fallback() }
    }

    // One message can reach the app through more than one door (the page's own notification, its service worker, the
    // unread counter), and each used to play the sound: two beeps for one message. Within this window a second one is skipped.
    const SAME_MESSAGE_WINDOW_MS = 1200
    let lastNotifSoundAt = 0

    // force: a button the user pressed to hear the sound (never skipped).
    function playNotifSound(messengerId = null, { force = false } = {}) {
        const settings = store.get('settings', {})
        if (settings.notifSound === false) return
        if (!force) {
            const now = Date.now()
            if (now - lastNotifSoundAt < SAME_MESSAGE_WINDOW_MS) return
            lastNotifSoundAt = now
        }

        let soundName = chosenSoundName(settings)

        if (messengerId) {
            const messenger = getActiveMessengers().find(m => m.id === messengerId)
            if (messenger && isRingtone(messenger.notifSound)) {
                soundName = messenger.notifSound
            }
        }

        let soundPath
        if (soundName === CUSTOM_SOUND) {
            soundPath = settings.notifSoundCustomPath
        } else {
            soundPath = getBuiltinSoundPath(soundName)
        }

        playSoundFile(soundPath)
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
        const current = chosenSoundName(settings)

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
                playSoundFile(soundPath)
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

                playSoundFile(filePath)
                e.target.value = ''
            })
        }
    }

    function previewMessengerSound(soundName) {
        if (soundName === '__default__') {
            playNotifSound(null, { force: true })
            return
        }

        const soundPath = getBuiltinSoundPath(soundName)
        playSoundFile(soundPath)
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