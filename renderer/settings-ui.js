const { setCurrentLanguage, getCurrentLanguage } = require('./i18n')

// ── Adaptive Theme ────────────────────────────────────────────────────────────
let _adaptiveActive = false
let _adaptiveTimer  = null

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
    return [h * 360, s * 100, l * 100]
}

function _applyAdaptiveColor({ r, g, b }) {
    // Слишком тёмный пиксель — нейтральный тёмно-синий
    if (r + g + b < 30) { r = 28; g = 34; b = 80 }
    const [h, s] = _rgbToHsl(r, g, b)

    // ВАЖНО: не форсируем минимальную насыщенность для серых тонов.
    // При s≈0 и h=0 (Telegram dark #212121) Math.max(18,...) давал
    // hsl(0,18%,8%) — «шоколадный» коричневый. Теперь серое остаётся серым.
    //   s < 5  → почти ахроматический: sat = s (0–4%)
    //   s 5–12 → слабо окрашенный: sat = s (сохраняем тонировку)
    //   s > 12 → полноценный цвет: sat зажат в [18, 55]
    const sat = s < 12
        ? Math.min(s, 10)                   // серый/слабый → без накрутки
        : Math.max(18, Math.min(s, 55))     // цветной → насыщенный, но не кислотный

    const root = document.documentElement
    root.style.setProperty('--bg-primary',   `hsl(${h},${sat}%,8%)`)
    root.style.setProperty('--bg-secondary', `hsl(${h},${Math.min(sat,45)}%,11%)`)
    root.style.setProperty('--bg-tertiary',  `hsl(${h},${Math.min(sat,40)}%,14%)`)
    root.style.setProperty('--bg-hover',     `hsl(${h},${Math.min(sat,38)}%,16%)`)
    root.style.setProperty('--bg-active',    `hsl(${h},${Math.min(sat,42)}%,19%)`)
    root.style.setProperty('--sidebar-bg',   `hsl(${h},${sat}%,12%)`)
    root.style.setProperty('--titlebar-bg',  `hsl(${h},${Math.min(sat,48)}%,10%)`)
    root.style.setProperty('--statusbar-bg', `hsl(${h},${Math.min(sat,50)}%,7%)`)
    root.style.setProperty('--border',       `hsl(${h},${Math.min(sat,30)}%,22%)`)
    root.style.setProperty('--border-light', `hsl(${h},${Math.min(sat,25)}%,18%)`)
    root.style.setProperty('--tab-active',   `hsl(${h},${Math.min(sat,42)}%,19%)`)
    root.style.setProperty('--tab-inactive', `hsl(${h},${Math.min(sat,35)}%,13%)`)
    root.style.setProperty('--accent',       `hsl(${h},${Math.max(45, s < 12 ? 50 : 70)}%,62%)`)
    root.style.setProperty('--accent-hover', `hsl(${h},${Math.max(45, s < 12 ? 50 : 70)}%,70%)`)
    root.style.setProperty('--accent-dim',   `hsla(${h},60%,62%,0.15)`)
    root.style.setProperty('--accent-glow',  `hsla(${h},60%,62%,0.28)`)
    root.style.setProperty('--shadow-glow',  `0 0 20px hsla(${h},60%,62%,0.25)`)
    root.style.setProperty('--glass-bg',     `hsla(${h},${sat}%,8%,0.85)`)
    root.style.setProperty('--glass-border', `hsla(${h},${Math.min(sat,30)}%,80%,0.06)`)
}

function _clearAdaptiveVars() {
    const props = [
        '--bg-primary','--bg-secondary','--bg-tertiary','--bg-hover','--bg-active',
        '--sidebar-bg','--titlebar-bg','--statusbar-bg','--border','--border-light',
        '--tab-active','--tab-inactive',
        '--accent','--accent-hover','--accent-dim','--accent-glow',
        '--shadow-glow','--glass-bg','--glass-border',
    ]
    const root = document.documentElement
    props.forEach(p => root.style.removeProperty(p))
}

async function _extractWebviewColor(webview) {
    if (!webview || typeof webview.executeJavaScript !== 'function') return null
    try {
        return await webview.executeJavaScript(`
            (function() {
                function hexToRgb(hex) {
                    hex = hex.replace('#','');
                    if (hex.length === 3) hex = hex.split('').map(function(c){return c+c;}).join('');
                    if (hex.length !== 6) return null;
                    return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
                }
                function parseColor(s) {
                    if (!s || s === 'transparent') return null;
                    var m = s.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?/);
                    if (m) {
                        var a = m[4] !== undefined ? parseFloat(m[4]) : 1;
                        if (a < 0.1) return null;
                        var rgb = [+m[1],+m[2],+m[3]];
                        return (rgb[0]+rgb[1]+rgb[2]) > 10 ? rgb : null;
                    }
                    if (s[0] === '#') return hexToRgb(s);
                    return null;
                }
                // Идём вверх по DOM, пока не найдём непрозрачный фон
                function getBgWalking(el) {
                    var cur = el;
                    while (cur && cur.tagName !== 'HTML') {
                        var rgb = parseColor(getComputedStyle(cur).backgroundColor);
                        if (rgb) return rgb;
                        cur = cur.parentElement;
                    }
                    return null;
                }
                // 1. meta theme-color — самый надёжный: Telegram, WhatsApp, Discord и др.
                var meta = document.querySelector('meta[name="theme-color"]');
                if (meta) {
                    var c = meta.getAttribute('content');
                    var rgb = c && c[0] === '#' ? hexToRgb(c) : parseColor(c);
                    if (rgb) return {r:rgb[0],g:rgb[1],b:rgb[2]};
                }
                // 2. Специфичные селекторы популярных мессенджеров
                var sels = [
                    // Telegram Web
                    '#column-left','.LeftColumn','.sidebar-header',
                    // WhatsApp Web
                    '#pane-side','[data-testid="chat-list"]',
                    // Discord
                    '[class*="sidebar"]','[class*="Sidebar"]',
                    // VK
                    '.left-column','.sidebar','.ConversationsLayout--sidebar',
                    // Slack
                    '.p-channel_sidebar','[class*="ChannelSidebar"]',
                    // Generic patterns
                    '[class*="side-bar"]','[class*="leftPanel"]','[class*="left-panel"]',
                    '[class*="nav-panel"]','[class*="LeftNav"]','[class*="leftNav"]',
                    '[data-testid*="sidebar"]',
                    'aside','[role="navigation"]','nav'
                ];
                for (var i = 0; i < sels.length; i++) {
                    try {
                        var el = document.querySelector(sels[i]);
                        if (!el) continue;
                        var rgb = getBgWalking(el);
                        if (rgb) return {r:rgb[0],g:rgb[1],b:rgb[2]};
                    } catch(e) {}
                }
                // 3. body → html
                var bodyRgb = parseColor(getComputedStyle(document.body).backgroundColor);
                if (bodyRgb) return {r:bodyRgb[0],g:bodyRgb[1],b:bodyRgb[2]};
                var htmlRgb = parseColor(getComputedStyle(document.documentElement).backgroundColor);
                if (htmlRgb) return {r:htmlRgb[0],g:htmlRgb[1],b:htmlRgb[2]};
                return null;
            })()
        `)
    } catch {
        return null
    }
}

let _adaptiveGetWebview = null  // сохранённый геттер для немедленного вызова

async function updateAdaptiveTheme(getActiveWebview, _delay = 900) {
    if (!_adaptiveActive) return
    if (typeof getActiveWebview === 'function') _adaptiveGetWebview = getActiveWebview
    const getter = _adaptiveGetWebview
    if (!getter) return
    clearTimeout(_adaptiveTimer)
    _adaptiveTimer = setTimeout(async () => {
        const wv = getter()
        if (!wv) return
        const color = await _extractWebviewColor(wv)
        if (color) {
            _applyAdaptiveColor(color)
        } else {
            // Ретрай: страница могла ещё рендериться
            if (_delay < 4000) {
                _adaptiveTimer = setTimeout(async () => {
                    const color2 = await _extractWebviewColor(getter())
                    if (color2) _applyAdaptiveColor(color2)
                }, _delay * 1.6)
            }
        }
    }, _delay)
}

function createSettingsUiApi({
    store,
    invokeIpc,
    tGet,
    updateDownloadDirUI,
    initProxySection,
    initSoundPicker,
    applyFoldersEnabled,
    resetPinSetup,
    setActivePinBlock,
    getActiveWebview,
}) {
    function getSettings() {
        return store.get('settings', {}) || {}
    }

    // ПРИМЕЧАНИЕ: настройка "Положение панели" убрана из UI (сайдбар теперь
    // всегда слева, справа появился отдельный сайдбар с ассистентом/задачами/
    // уведомлениями) — но раньше эта функция ещё и вешала класс
    // .sidebar-<position> на main-container, а куча density-правил в
    // styles.css (.sidebar-left .activity-bar/.activity-btn/.messenger-item/
    // .messenger-icon/.messenger-badge { ... !important }) были завязаны
    // именно на этот класс. Поскольку position всегда 'left', эти правила
    // молча перебивали любые новые размеры сайдбара/иконок через !important
    // независимо от того, что задано в styles.css напрямую. Класс больше не
    // вешаем — только перестановка DOM (harmless no-op при position='left').
    function applySidebarPosition(position) {
        const mainContainer = document.querySelector('.main-container')
        const activityBar = document.querySelector('.activity-bar')
        const contentArea = document.querySelector('.content-area')

        if (!mainContainer || !activityBar || !contentArea) return

        if (position === 'right' || position === 'bottom') {
            mainContainer.appendChild(activityBar)
        } else {
            mainContainer.insertBefore(activityBar, contentArea)
        }
    }

    function applyTheme(theme) {
        const root = document.documentElement
        _adaptiveActive = (theme === 'adaptive')
        if (!_adaptiveActive) {
            _clearAdaptiveVars()
        }
        root.setAttribute('data-theme', theme)

        const settings = getSettings()
        if (settings.accentColor && theme !== 'adaptive') {
            root.style.setProperty('--accent', settings.accentColor)
            root.style.setProperty('--accent-hover', settings.accentColor)
        }

        // Немедленно применяем цвет текущего мессенджера при активации темы
        if (_adaptiveActive && typeof getActiveWebview === 'function') {
            updateAdaptiveTheme(getActiveWebview, 300)
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

        document.documentElement.setAttribute('data-density', settings.density || 'normal')
        applyTheme(settings.theme || 'embedded')
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
            theme: document.querySelector('.theme-item.active')?.dataset.theme || currentSettings.theme || 'embedded',
            accentColor: document.querySelector('.accent-item.active')?.dataset.color || currentSettings.accentColor || '#7b68ee',
            density: document.querySelector('.density-item.active')?.dataset.density || currentSettings.density || 'normal',
            sidebarPosition: document.querySelector('.position-item.active')?.dataset.position || currentSettings.sidebarPosition || 'left',
            downloadDir: currentSettings.downloadDir || '',
            askDownload: document.getElementById('settingAskDownload')?.checked ?? (currentSettings.askDownload ?? true),
            adblockEnabled: document.getElementById('extAdblockToggle')?.checked ?? (currentSettings.adblockEnabled !== false)
        }
    }

    async function openSettings() {
        const modal = document.getElementById('settingsModal')
        if (!modal) return

        modal.classList.add('show')
        document.body.classList.add('settings-open')

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

        if (settingLanguage) settingLanguage.value = getCurrentLanguage() || settings.language || 'ru'
        if (settingCloseBehavior) settingCloseBehavior.value = settings.closeBehavior || 'tray'
        if (settingStartMinimized) settingStartMinimized.checked = settings.startMinimized || false
        if (settingFontSize) settingFontSize.value = settings.fontSize || '13'
        if (settingShowTabs) settingShowTabs.checked = settings.showTabs !== false
        if (settingNotifications) settingNotifications.checked = settings.notifications !== false
        if (settingNotifSound) settingNotifSound.checked = settings.notifSound !== false
        if (settingTrayBadge) settingTrayBadge.checked = settings.trayBadge !== false
        if (settingFoldersEnabled) settingFoldersEnabled.checked = settings.foldersEnabled !== false
        if (settingFolderLabel) settingFolderLabel.checked = settings.folderLabel !== false

        const extAdblockToggle = document.getElementById('extAdblockToggle')
        if (extAdblockToggle) extAdblockToggle.checked = settings.adblockEnabled !== false

        document.querySelectorAll('.theme-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.theme === (settings.theme || 'embedded'))
        })

        document.querySelectorAll('.accent-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.color === (settings.accentColor || '#7b68ee'))
        })
        const customItem = document.getElementById('accentCustomItem')
        if (customItem && settings.accentColor && !document.querySelector('.accent-item.active')) {
            customItem.classList.add('active', 'has-color')
            customItem.dataset.color = settings.accentColor
            customItem.style.setProperty('--accent-custom-color', settings.accentColor)
        } else if (customItem) {
            customItem.classList.remove('has-color')
        }

        document.querySelectorAll('.density-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.density === (settings.density || 'normal'))
        })

        document.querySelectorAll('.position-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.position === (settings.sidebarPosition || 'left'))
        })

        const autoLaunchCheckbox = document.getElementById('settingAutoLaunch')
        const autoLaunchWarning = document.getElementById('settingAutoLaunchWarning')
        if (autoLaunchCheckbox) {
            try {
                // BUGFIX ("галочка 'запускать с системой' не сохраняет статус
                // Включено"): main/ipc/autoLaunch.js's get-auto-launch handler
                // returns a flat { openAtLogin, disabledByOS } object — it was
                // never wrapped in { success, data }. This code expected that
                // wrapper, so result.success was always undefined, data was
                // always null, and the checkbox showed unchecked on every
                // settings reopen no matter what the real (correctly-set) OS
                // autostart state was.
                const data = await invokeIpc('get-auto-launch')
                autoLaunchCheckbox.checked = !!data?.openAtLogin
                if (autoLaunchWarning) autoLaunchWarning.style.display = data?.disabledByOS ? '' : 'none'
            } catch {
                autoLaunchCheckbox.checked = false
                if (autoLaunchWarning) autoLaunchWarning.style.display = 'none'
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
        const settingLockOnIdle = document.getElementById('settingLockOnIdle')
        const passwordFields = document.getElementById('passwordFields')

        if (settingPasswordEnable) settingPasswordEnable.checked = !!sec.enabled
        if (settingLockOnHide) settingLockOnHide.checked = !!sec.lockOnHide
        if (settingLockOnIdle) settingLockOnIdle.value = String(sec.lockOnIdleMinutes || 0)

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
    createSettingsUiApi,
    updateAdaptiveTheme,
}