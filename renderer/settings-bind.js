function bindSettingsUi({
    store,
    ipcRenderer,
    tGet,
    openSettings,
    collectSettings,
    applySettings,
    resetPinSetup,
    setActivePinBlock,
    openPinDisableModal,
    updateLockBtn,
    requirePro,
    openExtensionsSection,
    openAssistantSection,
    replayOnboardingTour
}) {
    const settingsBtn = document.getElementById('settingsBtn')
    const closeSettingsBtn = document.getElementById('closeSettingsBtn')
    const settingsModal = document.getElementById('settingsModal')
    const applySettingsBtn = document.getElementById('applySettingsBtn')
    const resetAllBtn = document.getElementById('resetAllBtn')
    const settingPasswordEnable = document.getElementById('settingPasswordEnable')

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => openSettings())
    }

    // Кнопка "Показать тур снова" в Настройки → Система — закрывает модалку
    // настроек и форсированно перезапускает онбординг-тур (force=true в
    // onboardingTourApi.start, минуя флаг settings.onboardingSeen).
    const replayOnboardingBtn = document.getElementById('replayOnboardingBtn')
    if (replayOnboardingBtn) {
        replayOnboardingBtn.addEventListener('click', () => {
            if (settingsModal) {
                settingsModal.classList.remove('show')
                document.body.classList.remove('settings-open')
            }
            if (typeof replayOnboardingTour === 'function') replayOnboardingTour()
        })
    }

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('show')
            document.body.classList.remove('settings-open')
        })
    }

    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('show')
                document.body.classList.remove('settings-open')
            }
        })
    }

    document.querySelectorAll('.settings-nav-item').forEach((item) => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.settings-nav-item').forEach((i) => i.classList.remove('active'))
            document.querySelectorAll('.settings-section').forEach((s) => s.classList.remove('active'))

            item.classList.add('active')

            const sectionId = `section-${item.dataset.section}`
            const section = document.getElementById(sectionId)
            if (section) section.classList.add('active')

            if (item.dataset.section === 'extensions' && typeof openExtensionsSection === 'function') {
                openExtensionsSection()
            }
            if (item.dataset.section === 'assistant' && typeof openAssistantSection === 'function') {
                openAssistantSection()
            }
        })
    })

    if (applySettingsBtn) {
        applySettingsBtn.addEventListener('click', async () => {
            const previousSettings = store.get('settings', {}) || {}
            const settings = collectSettings()
            const oldLang = (previousSettings.language || 'ru').trim()
            const newLang = (settings.language || 'ru').trim()

            // Используем setAsync чтобы гарантировать запись в main-процесс до reload
            if (store.setAsync) {
                await store.setAsync('settings', settings)
            } else {
                await (store.set('settings', settings) || Promise.resolve())
            }
            applySettings(settings)

            const autoLaunch = document.getElementById('settingAutoLaunch')
            const autoLaunchRequested = !!autoLaunch?.checked

            // BUGFIX ("настройка 'запускать с системой' не работает"): this
            // used to be pure fire-and-forget — 'auto-launch-result' was sent
            // back from main/ipc/autoLaunch.js but nothing ever listened for
            // it, so a failed OS-level registration was 100% silent. The user
            // would see the generic "✓ Настройки применены" toast either way,
            // then find the checkbox unchecked again next time they opened
            // Settings (get-auto-launch correctly reporting the real,
            // unchanged OS state) with zero indication why. Listen for the
            // reply and surface failures explicitly instead of masking them.
            // BUGFIX ("Не удалось применить настройку автозапуска" — always
            // shown, even on real success): preload.js's once() wrapper calls
            // listener(...args) with the IPC payload only (no synthetic event
            // object — see preload.js, every other .on()/.once() listener in
            // this codebase follows that shape). This listener was written as
            // if it were raw ipcRenderer.once(channel, (event, result) => ...)
            // — so `result` was always undefined and every attempt, success or
            // not, hit the "!result?.success" failure branch.
            ipcRenderer.once('auto-launch-result', (result) => {
                if (!result?.success && autoLaunch) autoLaunch.checked = !autoLaunchRequested

                const autoLaunchWarning = document.getElementById('settingAutoLaunchWarning')
                if (autoLaunchWarning) {
                    // Same Windows StartupApproved gap as get-auto-launch (see
                    // main/ipc/autoLaunch.js) — surface it right away instead of
                    // waiting for the next Settings open.
                    autoLaunchWarning.style.display = result?.success && result?.disabledByOS ? '' : 'none'
                }

                const status = document.getElementById('settingsStatus')
                if (status && !result?.success) {
                    // Показываем и реальную причину сбоя (result.error, из
                    // main/ipc/autoLaunch.js) — раньше был только общий текст,
                    // из-за чего диагностировать конкретную причину провала
                    // app.setLoginItemSettings() на машине пользователя было
                    // невозможно без доступа к его log-файлу.
                    const reason = result?.error ? ` (${result.error})` : ''
                    status.textContent = tGet('autoLaunch.error') + reason
                    status.classList.remove('success')
                    status.classList.add('error')
                    setTimeout(() => {
                        status.textContent = ''
                        status.classList.remove('error')
                    }, 8000)
                }
            })
            ipcRenderer.send('set-auto-launch', autoLaunchRequested)

            ipcRenderer.send('set-download-dir', settings.downloadDir || '')
            ipcRenderer.send('set-ask-download', settings.askDownload ?? true)

            if (newLang !== oldLang) {
                // Перезагружаем рендерер — быстрее и надёжнее чем app.relaunch(),
                // настройки уже сохранены в store, initI18n подхватит новый язык.
                window.location.reload()
                return
            }

            const status = document.getElementById('settingsStatus')
            if (status) {
                status.textContent = tGet('settings.applied')
                status.classList.add('success')

                setTimeout(() => {
                    status.textContent = ''
                    status.classList.remove('success')
                }, 3000)
            }
        })
    }

    document.querySelectorAll('.theme-item').forEach((item) => {
        item.addEventListener('click', () => {
            const theme = item.dataset.theme
            if (theme !== 'dark') {
                if (requirePro && !requirePro('themes')) return
            }
            document.querySelectorAll('.theme-item').forEach((i) => i.classList.remove('active'))
            item.classList.add('active')
        })
    })

    document.querySelectorAll('.accent-item').forEach((item) => {
        item.addEventListener('click', () => {
            if (item.id === 'accentCustomItem') {
                if (requirePro && !requirePro('accent')) return
                openColorPickerModal()
                return
            }
            const color = item.dataset.color
            if (color !== '#7b68ee') {
                if (requirePro && !requirePro('accent')) return
            }
            document.querySelectorAll('.accent-item').forEach((i) => i.classList.remove('active'))
            item.classList.add('active')
        })
    })

    // ── Custom color picker modal ─────────────────────────────────────────────
    const COLOR_PRESETS = [
        '#7b68ee','#e17055','#00b894','#fd79a8','#fdcb6e','#a29bfe',
        '#0984e3','#e84393','#00cec9','#d63031','#6c5ce7','#55efc4',
        '#f39c12','#2d3436','#74b9ff','#ff7675',
    ]

    function openColorPickerModal() {
        const modal = document.getElementById('colorPickerModal')
        if (!modal) return
        const customItem = document.getElementById('accentCustomItem')
        const currentColor = customItem?.dataset.color || '#7b68ee'

        // Build presets
        const presetsEl = document.getElementById('colorPickerPresets')
        if (presetsEl) {
            presetsEl.innerHTML = ''
            COLOR_PRESETS.forEach(c => {
                const dot = document.createElement('div')
                dot.className = 'color-picker-preset' + (c === currentColor ? ' active' : '')
                dot.style.background = c
                dot.dataset.color = c
                dot.addEventListener('click', () => {
                    presetsEl.querySelectorAll('.color-picker-preset').forEach(d => d.classList.remove('active'))
                    dot.classList.add('active')
                    setPickerColor(c)
                })
                presetsEl.appendChild(dot)
            })
        }

        setPickerColor(currentColor)
        modal.style.display = 'flex'
        // Рисуем колесо после показа (canvas должен быть виден)
        requestAnimationFrame(() => drawColorWheel(currentColor))
    }

    // ── Color wheel (HSL circle) ──────────────────────────────────────────────
    let _wheelDragging = false

    function drawColorWheel(selectedHex) {
        const canvas = document.getElementById('colorWheelCanvas')
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const W = canvas.width, H = canvas.height
        const cx = W / 2, cy = H / 2, r = W / 2 - 2

        // Draw hue ring (thin sections with radial white→hue gradient)
        for (let deg = 0; deg < 360; deg++) {
            const a0 = (deg - 1) * Math.PI / 180
            const a1 = (deg + 1) * Math.PI / 180
            const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
            grad.addColorStop(0, 'white')
            grad.addColorStop(1, `hsl(${deg},100%,50%)`)
            ctx.beginPath()
            ctx.moveTo(cx, cy)
            ctx.arc(cx, cy, r, a0, a1)
            ctx.closePath()
            ctx.fillStyle = grad
            ctx.fill()
        }

        // Restore dot position from selected hex
        if (selectedHex) {
            const pos = _hexToWheelPos(selectedHex, cx, cy, r)
            _updateWheelDot(pos.x, pos.y)
        }
    }

    function _hexToRgb(hex) {
        const c = hex.replace('#', '')
        return {
            r: parseInt(c.slice(0, 2), 16),
            g: parseInt(c.slice(2, 4), 16),
            b: parseInt(c.slice(4, 6), 16)
        }
    }

    function _rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255
        const max = Math.max(r, g, b), min = Math.min(r, g, b)
        let h, s, l = (max + min) / 2
        if (max === min) { h = s = 0 }
        else {
            const d = max - min
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
                case g: h = ((b - r) / d + 2) / 6; break
                case b: h = ((r - g) / d + 4) / 6; break
            }
        }
        return { h: h * 360, s, l }
    }

    function _hexToWheelPos(hex, cx, cy, r) {
        try {
            const { r: rv, g, b } = _hexToRgb(hex)
            const { h, s } = _rgbToHsl(rv, g, b)
            const angle = h * Math.PI / 180
            const dist = s * r
            return { x: cx + dist * Math.cos(angle), y: cy + dist * Math.sin(angle) }
        } catch { return { x: cx, y: cy } }
    }

    function _wheelPosToHex(px, py, cx, cy, r) {
        const dx = px - cx, dy = py - cy
        const dist = Math.min(Math.sqrt(dx * dx + dy * dy), r)
        const angle = Math.atan2(dy, dx) * 180 / Math.PI
        const h = ((angle % 360) + 360) % 360
        const s = dist / r
        // Convert HSL (s, 50% lightness) → hex
        const l = 0.5
        const a = s * Math.min(l, 1 - l)
        function f(n) {
            const k = (n + h / 30) % 12
            const col = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
            return Math.round(255 * col).toString(16).padStart(2, '0')
        }
        return f(0) + f(8) + f(4)
    }

    function _updateWheelDot(x, y) {
        const dot = document.getElementById('colorWheelDot')
        if (!dot) return
        dot.style.left = x + 'px'
        dot.style.top  = y + 'px'
    }

    function _onWheelInteract(e) {
        const canvas = document.getElementById('colorWheelCanvas')
        if (!canvas) return
        const rect = canvas.getBoundingClientRect()
        const scaleX = canvas.width  / rect.width
        const scaleY = canvas.height / rect.height
        const px = (e.clientX - rect.left) * scaleX
        const py = (e.clientY - rect.top)  * scaleY
        const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 2
        const dx = px - cx, dy = py - cy
        if (Math.sqrt(dx * dx + dy * dy) > r + 4) return

        const hex = _wheelPosToHex(px, py, cx, cy, r)
        _updateWheelDot(px, py)
        setPickerColor(hex)
    }

    // Attach wheel events once
    ;(function attachWheelEvents() {
        const canvas = document.getElementById('colorWheelCanvas')
        if (!canvas) return
        canvas.addEventListener('mousedown', (e) => {
            _wheelDragging = true
            _onWheelInteract(e)
        })
        canvas.addEventListener('mousemove', (e) => {
            if (_wheelDragging) _onWheelInteract(e)
        })
        document.addEventListener('mouseup', () => { _wheelDragging = false })
    })()

    function setPickerColor(hex) {
        const clean = hex.replace('#', '').slice(0, 6)
        const preview = document.getElementById('colorPickerPreview')
        const hexInput = document.getElementById('colorPickerHex')
        if (preview) preview.style.background = '#' + clean
        if (hexInput) hexInput.value = clean
        // Update wheel dot if wheel already visible
        const canvas = document.getElementById('colorWheelCanvas')
        if (canvas && canvas.width > 0) {
            const cx = canvas.width / 2, cy = canvas.height / 2, r = cx - 2
            const pos = _hexToWheelPos('#' + clean, cx, cy, r)
            _updateWheelDot(pos.x, pos.y)
        }
    }

    function applyPickerColor(hex) {
        const color = '#' + hex.replace('#', '').slice(0, 6)
        const customItem = document.getElementById('accentCustomItem')
        document.querySelectorAll('.accent-item').forEach(i => i.classList.remove('active'))
        if (customItem) {
            customItem.classList.add('active', 'has-color')
            customItem.dataset.color = color
            customItem.style.setProperty('--accent-custom-color', color)
        }
    }

    const colorPickerHex = document.getElementById('colorPickerHex')
    if (colorPickerHex) {
        colorPickerHex.addEventListener('input', (e) => {
            const v = e.target.value.replace(/[^0-9a-fA-F]/g, '')
            e.target.value = v
            if (v.length === 6) {
                const preview = document.getElementById('colorPickerPreview')
                if (preview) preview.style.background = '#' + v
            }
        })
    }

    const colorPickerApply = document.getElementById('colorPickerApply')
    if (colorPickerApply) {
        colorPickerApply.addEventListener('click', () => {
            const hex = document.getElementById('colorPickerHex')?.value || ''
            if (hex.length >= 3) applyPickerColor(hex)
            document.getElementById('colorPickerModal').style.display = 'none'
        })
    }

    const colorPickerCancel = document.getElementById('colorPickerCancel')
    const colorPickerClose = document.getElementById('colorPickerClose')
    const closePicker = () => { document.getElementById('colorPickerModal').style.display = 'none' }
    if (colorPickerCancel) colorPickerCancel.addEventListener('click', closePicker)
    if (colorPickerClose) colorPickerClose.addEventListener('click', closePicker)

    const colorPickerBackdrop = document.querySelector('.color-picker-backdrop')
    if (colorPickerBackdrop) colorPickerBackdrop.addEventListener('click', closePicker)

    document.querySelectorAll('.density-item').forEach((item) => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.density-item').forEach((i) => i.classList.remove('active'))
            item.classList.add('active')
        })
    })

    document.querySelectorAll('.position-item').forEach((item) => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.position-item').forEach((i) => i.classList.remove('active'))
            item.classList.add('active')
        })
    })

    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn')
    if (checkUpdatesBtn) {
        checkUpdatesBtn.addEventListener('click', async () => {
            checkUpdatesBtn.disabled = true
            checkUpdatesBtn.textContent = tGet('settings.checkUpdatesChecking') || 'Checking...'
            try {
                await ipcRenderer.invoke('check-for-updates')
            } catch (e) {
                console.error('[settings] checkForUpdates error:', e)
            } finally {
                setTimeout(() => {
                    checkUpdatesBtn.disabled = false
                    checkUpdatesBtn.textContent = tGet('settings.checkUpdatesBtn') || 'Check for updates'
                }, 3000)
            }
        })
    }

    const exportSettingsBtn = document.getElementById('exportSettingsBtn')
    if (exportSettingsBtn) {
        exportSettingsBtn.addEventListener('click', async () => {
            const status = document.getElementById('settingsStatus')
            exportSettingsBtn.disabled = true
            try {
                const result = await ipcRenderer.invoke('settings:export')
                if (status && result && result.success) {
                    status.textContent = tGet('settings.applied') || 'OK'
                    status.classList.add('success')
                    setTimeout(() => {
                        status.textContent = ''
                        status.classList.remove('success')
                    }, 3000)
                }
            } catch (e) {
                console.error('[settings] export error:', e)
            } finally {
                exportSettingsBtn.disabled = false
            }
        })
    }

    const importSettingsBtn = document.getElementById('importSettingsBtn')
    if (importSettingsBtn) {
        importSettingsBtn.addEventListener('click', async () => {
            importSettingsBtn.disabled = true
            try {
                const result = await ipcRenderer.invoke('settings:import')
                if (result && result.success) {
                    // Настройки применены в главном процессе (electron-store) —
                    // перезагружаем окно, чтобы UI подхватил их так же, как при
                    // смене языка в applySettingsBtn выше.
                    window.location.reload()
                } else if (result && !result.canceled) {
                    console.warn('[settings] import failed:', result?.error)
                }
            } catch (e) {
                console.error('[settings] import error:', e)
            } finally {
                importSettingsBtn.disabled = false
            }
        })
    }

    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', async () => {
            if (!confirm(tGet('settings.resetConfirm'))) return

            try {
                if (window.electronAPI?.invoke) {
                    // Используем API главного процесса для полной очистки хранилища
                    await window.electronAPI.invoke('store:clear-all')
                } else {
                    // Fallback если спец-метод недоступен
                    const keysToDelete = [
                        'menuCollapsed', 'appZoomLevel', 'tabZoomLevel', 'settings',
                        'messengers', 'folders', 'mutedMessengers', 'globalMuteAll',
                        'security', 'pinEnabled', 'pinHash', 'lockOnStartup', 'cloud'
                    ]
                    for (const key of keysToDelete) {
                        await store.delete(key)
                    }
                }
            } catch (error) {
                console.error('Failed to reset settings:', error)
            }

            ipcRenderer.send('quit-app', true)
        })
    }

    const settingLockOnHide = document.getElementById('settingLockOnHide')
    if (settingLockOnHide) {
        settingLockOnHide.addEventListener('change', (e) => {
            const sec = store.get('security', {}) || {}
            store.set('security', { ...sec, lockOnHide: e.target.checked })
        })
    }

    const settingLockOnIdle = document.getElementById('settingLockOnIdle')
    if (settingLockOnIdle) {
        settingLockOnIdle.addEventListener('change', (e) => {
            const sec = store.get('security', {}) || {}
            const minutes = parseInt(e.target.value, 10) || 0
            store.set('security', { ...sec, lockOnIdleMinutes: minutes })
        })
    }

    if (settingPasswordEnable) {
        settingPasswordEnable.addEventListener('change', (e) => {
            const fields = document.getElementById('passwordFields')
            const enabled = e.target.checked

            if (!enabled) {
                const sec = store.get('security', {}) || {}
                if (sec.hash) {
                    openPinDisableModal()
                    return
                }

                store.set('security', {
                    enabled: false,
                    hash: null,
                    lockOnHide: false
                })

                if (fields) fields.style.display = 'none'
                resetPinSetup()
                updateLockBtn()
                return
            }

            if (fields) fields.style.display = 'block'
            resetPinSetup()
            setTimeout(() => setActivePinBlock('new'), 150)
        })
    }
}

module.exports = {
    bindSettingsUi
}