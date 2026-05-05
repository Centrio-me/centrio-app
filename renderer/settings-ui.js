const { setCurrentLanguage } = require('./i18n')

function createSettingsUiApi({
    store,
    invokeIpc,
    tGet,
    updateDownloadDirUI,
    initProxySection,
    initSoundPicker,
    applyFoldersEnabled,
    resetPinSetup,
    setActivePinBlock
}) {
    function getSettings() {
        return store.get('settings', {}) || {}
    }

    function applySidebarPosition(position) {
        const mainContainer = document.querySelector('.main-container')
        const activityBar = document.querySelector('.activity-bar')
        const contentArea = document.querySelector('.content-area')

        if (!mainContainer || !activityBar || !contentArea) return

        mainContainer.classList.remove('sidebar-left', 'sidebar-right', 'sidebar-top', 'sidebar-bottom')
        mainContainer.classList.add(`sidebar-${position}`)

        if (position === 'right' || position === 'bottom') {
            mainContainer.appendChild(activityBar)
        } else {
            mainContainer.insertBefore(activityBar, contentArea)
        }
    }

    function applyTheme(theme) {
        const root = document.documentElement
        root.setAttribute('data-theme', theme)

        const settings = getSettings()
        if (settings.accentColor) {
            root.style.setProperty('--accent', settings.accentColor)
            root.style.setProperty('--accent-hover', settings.accentColor)
        }
    }

    function applySettings(settings = {}) {
        document.body.style.fontSize = `${settings.fontSize || 13}px`

        const folderLabelEl = document.getElementById('folderPanelName')
        const folderPanelLabelWrap = document.querySelector('.folder-panel-label')
        const showLabel = settings.folderLabel !== false

        applyFoldersEnabled(settings.foldersEnabled !== false)

        if (folderLabelEl) folderLabelEl.style.display = showLabel ? 'block' : 'none'
        if (folderPanelLabelWrap) folderPanelLabelWrap.style.display = showLabel ? 'flex' : 'none'

        const tabsBarEl = document.getElementById('tabsBar')
        if (tabsBarEl) {
            const showTabs = settings.showTabs !== false
            tabsBarEl.style.display = showTabs ? 'flex' : 'none'
            document.querySelector('.titlebar')?.classList.toggle('tabs-hidden', !showTabs)
        }

        if (settings.accentColor) {
            const root = document.documentElement
            root.style.setProperty('--accent', settings.accentColor)
            root.style.setProperty('--accent-hover', `${settings.accentColor}dd`)
            root.style.setProperty('--accent-dim', `${settings.accentColor}20`)
            root.style.setProperty('--accent-glow', `${settings.accentColor}40`)
        }

        document.documentElement.setAttribute('data-density', settings.density || 'comfortable')
        applyTheme(settings.theme || 'dark')
        applySidebarPosition(settings.sidebarPosition || 'left')

        if (settings.language) {
            setCurrentLanguage(settings.language)
        }
    }

    function collectSettings() {
        const currentSettings = getSettings()

        return {
            ...currentSettings,
            language: document.getElementById('settingLanguage')?.value || currentSettings.language || 'ru',
            closeBehavior: document.getElementById('settingCloseBehavior')?.value || currentSettings.closeBehavior || 'tray',
            startMinimized: document.getElementById('settingStartMinimized')?.checked || false,
            fontSize: document.getElementById('settingFontSize')?.value || currentSettings.fontSize || 13,
            showTabs: document.getElementById('settingShowTabs')?.checked ?? true,
            notifications: document.getElementById('settingNotifications')?.checked ?? true,
            notifSound: document.getElementById('settingNotifSound')?.checked ?? true,
            trayBadge: document.getElementById('settingTrayBadge')?.checked ?? true,
            foldersEnabled: document.getElementById('settingFoldersEnabled')?.checked ?? true,
            folderLabel: document.getElementById('settingFolderLabel')?.checked ?? true,
            theme: document.querySelector('.theme-item.active')?.dataset.theme || currentSettings.theme || 'dark',
            accentColor: document.querySelector('.accent-item.active')?.dataset.color || currentSettings.accentColor || '#7b68ee',
            density: document.querySelector('.density-item.active')?.dataset.density || currentSettings.density || 'comfortable',
            sidebarPosition: document.querySelector('.position-item.active')?.dataset.position || currentSettings.sidebarPosition || 'left',
            downloadDir: currentSettings.downloadDir || '',
            askDownload: document.getElementById('settingAskDownload')?.checked ?? (currentSettings.askDownload ?? true)
        }
    }

    async function openSettings() {
        const modal = document.getElementById('settingsModal')
        if (!modal) return

        modal.classList.add('show')

        const settings = getSettings()

        const settingLanguage = document.getElementById('settingLanguage')
        const settingCloseBehavior = document.getElementById('settingCloseBehavior')
        const settingStartMinimized = document.getElementById('settingStartMinimized')
        const settingFontSize = document.getElementById('settingFontSize')
        const settingShowTabs = document.getElementById('settingShowTabs')
        const settingNotifications = document.getElementById('settingNotifications')
        const settingNotifSound = document.getElementById('settingNotifSound')
        const settingTrayBadge = document.getElementById('settingTrayBadge')
        const settingFoldersEnabled = document.getElementById('settingFoldersEnabled')
        const settingFolderLabel = document.getElementById('settingFolderLabel')

        if (settingLanguage) settingLanguage.value = settings.language || 'ru'
        if (settingCloseBehavior) settingCloseBehavior.value = settings.closeBehavior || 'tray'
        if (settingStartMinimized) settingStartMinimized.checked = settings.startMinimized || false
        if (settingFontSize) settingFontSize.value = settings.fontSize || '13'
        if (settingShowTabs) settingShowTabs.checked = settings.showTabs !== false
        if (settingNotifications) settingNotifications.checked = settings.notifications !== false
        if (settingNotifSound) settingNotifSound.checked = settings.notifSound !== false
        if (settingTrayBadge) settingTrayBadge.checked = settings.trayBadge !== false
        if (settingFoldersEnabled) settingFoldersEnabled.checked = settings.foldersEnabled !== false
        if (settingFolderLabel) settingFolderLabel.checked = settings.folderLabel !== false

        document.querySelectorAll('.theme-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.theme === (settings.theme || 'dark'))
        })

        document.querySelectorAll('.accent-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.color === (settings.accentColor || '#7b68ee'))
        })
        const customItem = document.getElementById('accentCustomItem')
        const colorPicker = document.getElementById('accentColorPicker')
        if (customItem && settings.accentColor && !document.querySelector('.accent-item.active')) {
            customItem.classList.add('active')
            customItem.dataset.color = settings.accentColor
            if (colorPicker) colorPicker.value = settings.accentColor
        }

        document.querySelectorAll('.density-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.density === (settings.density || 'comfortable'))
        })

        document.querySelectorAll('.position-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.position === (settings.sidebarPosition || 'left'))
        })

        const autoLaunchCheckbox = document.getElementById('settingAutoLaunch')
        if (autoLaunchCheckbox) {
            try {
                const result = await invokeIpc('get-auto-launch')
                autoLaunchCheckbox.checked = result?.success ? !!result.data : false
            } catch {
                autoLaunchCheckbox.checked = false
            }
        }

        const status = document.getElementById('settingsStatus')
        if (status) {
            status.textContent = ''
            status.classList.remove('success')
        }

        const sec = store.get('security', {}) || {}
        const settingPasswordEnable = document.getElementById('settingPasswordEnable')
        const settingLockOnHide = document.getElementById('settingLockOnHide')
        const passwordFields = document.getElementById('passwordFields')

        if (settingPasswordEnable) settingPasswordEnable.checked = !!sec.enabled
        if (settingLockOnHide) settingLockOnHide.checked = !!sec.lockOnHide

        resetPinSetup()

        if (passwordFields) {
            if (sec.enabled) {
                passwordFields.style.display = 'block'
                setTimeout(() => setActivePinBlock('new'), 150)
            } else {
                passwordFields.style.display = 'none'
            }
        }

        const askDownloadCheckbox = document.getElementById('settingAskDownload')
        if (askDownloadCheckbox) {
            askDownloadCheckbox.checked = settings.askDownload ?? true
        }

        updateDownloadDirUI(settings.downloadDir || '')
        initProxySection()
        initSoundPicker()
        initCollapsibles()
    }

    let collapsiblesInited = false
    function initCollapsibles() {
        if (collapsiblesInited) return
        collapsiblesInited = true

        const pairs = [
            ['settingsVpnToggle', 'settingsVpnBody', 'settingsVpnChevron'],
            ['settingsProxyToggle', 'settingsProxyBody', 'settingsProxyChevron']
        ]

        pairs.forEach(([toggleId, bodyId, chevronId]) => {
            const toggle = document.getElementById(toggleId)
            const body = document.getElementById(bodyId)
            const chevron = document.getElementById(chevronId)
            if (!toggle || !body) return

            toggle.addEventListener('click', () => {
                const open = body.style.display !== 'none'
                body.style.display = open ? 'none' : 'block'
                if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)'
            })
        })
    }

    function initSettings() {
        const settings = getSettings()
        applySettings(settings)
    }

    return {
        applySidebarPosition,
        applyTheme,
        applySettings,
        collectSettings,
        openSettings,
        initSettings
    }
}

module.exports = {
    createSettingsUiApi
}