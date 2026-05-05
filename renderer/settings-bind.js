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
    openExtensionsSection
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

    if (closeSettingsBtn && settingsModal) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsModal.classList.remove('show')
        })
    }

    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('show')
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
        })
    })

    if (applySettingsBtn) {
        applySettingsBtn.addEventListener('click', async () => {
            const previousSettings = store.get('settings', {}) || {}
            const settings = collectSettings()
            const oldLang = previousSettings.language || 'ru'

            await store.setAsync?.('settings', settings) || store.set('settings', settings)
            applySettings(settings)

            const autoLaunch = document.getElementById('settingAutoLaunch')
            ipcRenderer.send('set-auto-launch', !!autoLaunch?.checked)

            ipcRenderer.send('set-download-dir', settings.downloadDir || '')
            ipcRenderer.send('set-ask-download', settings.askDownload ?? true)

            if (settings.language !== oldLang) {
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
                document.getElementById('accentColorPicker')?.click()
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

    const accentColorPicker = document.getElementById('accentColorPicker')
    if (accentColorPicker) {
        accentColorPicker.addEventListener('input', (e) => {
            const color = e.target.value
            const customItem = document.getElementById('accentCustomItem')
            document.querySelectorAll('.accent-item').forEach((i) => i.classList.remove('active'))
            if (customItem) {
                customItem.classList.add('active')
                customItem.dataset.color = color
            }
        })
    }

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
            checkUpdatesBtn.textContent = tGet('settings.checkUpdatesChecking') || 'Проверяем...'
            try {
                await ipcRenderer.invoke('check-for-updates')
            } catch (e) {
                console.error('[settings] checkForUpdates error:', e)
            } finally {
                setTimeout(() => {
                    checkUpdatesBtn.disabled = false
                    checkUpdatesBtn.textContent = tGet('settings.checkUpdatesBtn') || 'Проверить обновления'
                }, 3000)
            }
        })
    }

    if (resetAllBtn) {
        resetAllBtn.addEventListener('click', async () => {
            if (!confirm(tGet('settings.resetConfirm'))) return

            const keysToDelete = [
                'menuCollapsed',
                'appZoomLevel',
                'tabZoomLevel',
                'settings',
                'messengers',
                'folders',
                'mutedMessengers',
                'globalMuteAll',
                'security',
                'pinEnabled',
                'pinHash',
                'lockOnStartup'
            ]

            for (const key of keysToDelete) {
                try {
                    await store.delete(key)
                } catch (error) {
                    console.error(`Failed to delete key "${key}"`, error)
                }
            }

            ipcRenderer.send('quit-app', true)
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