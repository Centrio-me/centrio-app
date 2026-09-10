// ==============================
// renderer.js
// Полностью адаптирован под:
// - contextIsolation: true
// - nodeIntegration: false
// - работу через window.electronAPI
// ==============================

// ==============================
// ИМПОРТЫ ВНУТРЕННИХ МОДУЛЕЙ
// ==============================
const state = require('./renderer/state')
const { tGet, applyI18n, initI18n, setCurrentLanguage, getCurrentLanguage } = require('./renderer/i18n')
const { getCurrentLocale, getUserInitial, hashPassword } = require('./renderer/helpers')
const { popularMessengers, syntaxAiPromo, folderIcons, PAGE_SIZE } = require('./renderer/constants')
const { createCloudStore, createCloudApi } = require('./renderer/cloud')
const { createSoundsApi } = require('./renderer/sounds')
const { bindDownloads } = require('./renderer/downloads')
const { createProxyApi } = require('./renderer/proxy')
const { bindUpdater, showUpdateBanner } = require('./renderer/updater')

const { createStatusBarApi } = require('./renderer/status-bar')
const { createTooltipsApi } = require('./renderer/tooltips')
const { createUnreadApi } = require('./renderer/unread')
const { createLockApi } = require('./renderer/lock')
const { createCloudUiApi } = require('./renderer/cloud-ui')
const { applyOrgLogo } = require('./renderer/org-branding')
const { createOrgTeamApi } = require('./renderer/org-team')
const { createContextMenusApi } = require('./renderer/context-menus')
const { bindPopupBackdrop } = require('./renderer/popup-backdrop-bind')
const { createFoldersUiApi } = require('./renderer/folders-ui')
const { createSearchUiApi } = require('./renderer/search-ui')
const { createAddModalUiApi } = require('./renderer/add-modal-ui')
const { createSettingsUiApi, updateAdaptiveTheme } = require('./renderer/settings-ui')
const { createExtensionsUiApi } = require('./renderer/extensions-ui')
const { createChangeIconUiApi } = require('./renderer/change-icon-ui')
const { createMessengerSoundUiApi } = require('./renderer/messenger-sound-ui')
const { createSidebarDndApi } = require('./renderer/sidebar-dnd-bind')
const { createWebviewNotifyApi } = require('./renderer/webview-notify')
const { createWebviewTabsApi } = require('./renderer/webview-tabs-bind')
const { createMediaPlayerUiApi } = require('./renderer/media-player-ui')
const { createSplitApi } = require('./renderer/split')
const { createOnboardingTourApi } = require('./renderer/onboarding-tour')

const { bindSettingsUi } = require('./renderer/settings-bind')
const { bindLockUi } = require('./renderer/lock-bind')
const { bindCloudUi } = require('./renderer/cloud-bind')
const { bindOnboardingScreen } = require('./renderer/onboarding-auth')
const { bindMenuUi } = require('./renderer/menu-bind')
const { bindWindowUi } = require('./renderer/window-bind')
const { bindAppEvents } = require('./renderer/app-events-bind')
const { bindEditModalUi } = require('./renderer/edit-modal-bind')
const { bindAddModalUi } = require('./renderer/add-modal-bind')
const { bindContextActionsUi } = require('./renderer/context-actions-bind')
const { bindChangeIconUi } = require('./renderer/change-icon-bind')
const { bindMessengerSoundUi } = require('./renderer/messenger-sound-bind')
const { bindSidebarShellUi } = require('./renderer/sidebar-shell-bind')
const { bindAppNotifUi } = require('./renderer/app-notif-bind')
const { bindTodosUi } = require('./renderer/todos-bind')
const { bindNotesUi } = require('./renderer/notes-bind')
const { bindDownloadsUi } = require('./renderer/downloads-bind')
const { bindVpnUi, bindVpnSettings } = require('./renderer/vpn-bind')
const { bindAssistantTools } = require('./renderer/assistant-tools')
const { bindAssistantUi } = require('./renderer/assistant-bind')
const { bindAssistantSettingsUi } = require('./renderer/assistant-settings-bind')

// ==============================
// SHIM ДЛЯ STORE
// Делаем объект, похожий на electron-store,
// чтобы старые модули не пришлось срочно переписывать
// ==============================
const storeCache = new Map()

// ==============================
// АВТО-СИНХРОНИЗАЦИЯ С ОБЛАКОМ
// BUGFIX (класс бага "настройки не сохраняются"): раньше каждый вызывающий
// код должен был САМ не забыть дёрнуть cloudSyncPush() после store.set —
// про это забывали регулярно (VPN, порядок сайдбара, окно настроек...).
// Централизуем: любая запись в один из этих ключей (это ровно то, что
// getSyncPayload() ниже реально отправляет в облако) сама планирует пуш.
// Дебаунс — чтобы пачка записей подряд (например при applySettings)
// не улетала в сеть отдельным запросом на каждую.
// ==============================
const SYNCED_STORE_KEYS = new Set([
    'messengers', 'folders', 'settings', 'security', 'lockOnStartup',
    'globalProxy', 'sidebarOrder', 'menuCollapsed', 'appZoomLevel',
    'vpnAppModes', 'extensionsState', 'splitLeftPctPref', 'splitPresets',
    'mutedMessengers'
])

let suppressAutoCloudSync = false
let scheduleAutoCloudSync = null // назначается ниже, после создания cloudApi
let autoCloudSyncTimer = null

function notifySyncedStoreWrite(key) {
    if (!SYNCED_STORE_KEYS.has(key)) return
    if (suppressAutoCloudSync) return
    if (typeof scheduleAutoCloudSync !== 'function') return

    clearTimeout(autoCloudSyncTimer)
    autoCloudSyncTimer = setTimeout(scheduleAutoCloudSync, 1500)
}

const store = {
    async hydrate(keysWithDefaults = []) {
        for (const [key, def] of keysWithDefaults) {
            try {
                if (window.electronAPI?.storeGet) {
                    const value = await window.electronAPI.storeGet(key, def)
                    storeCache.set(key, value === undefined ? def : value)
                } else {
                    storeCache.set(key, def)
                }
            } catch (error) {
                console.error(`store.hydrate error for key "${key}":`, error)
                storeCache.set(key, def)
            }
        }
    },

    get(key, def) {
        return storeCache.has(key) ? storeCache.get(key) : def
    },

    async getAsync(key, def) {
        if (storeCache.has(key)) return storeCache.get(key)

        try {
            if (window.electronAPI?.storeGet) {
                const value = await window.electronAPI.storeGet(key, def)
                const finalValue = value === undefined ? def : value
                storeCache.set(key, finalValue)
                return finalValue
            }
        } catch (error) {
            console.error(`store.getAsync error for key "${key}":`, error)
        }

        storeCache.set(key, def)
        return def
    },

    set(key, value) {
        storeCache.set(key, value)
        notifySyncedStoreWrite(key)

        if (window.electronAPI?.storeSet) {
            const result = window.electronAPI.storeSet(key, value)
            // BUGFIX: writes to keys missing from main.js's ALLOWED_STORE_ROOTS
            // used to fail silently (main returns { success: false }, nobody
            // ever looked at it) — surface it loudly so this class of bug is
            // never invisible again.
            result?.then?.(res => {
                if (res && res.success === false) {
                    console.error(`[store] set('${key}') was rejected by main process:`, res.error)
                }
            })
            return result
        }

        return undefined
    },

    async setAsync(key, value) {
        storeCache.set(key, value)
        notifySyncedStoreWrite(key)

        if (window.electronAPI?.storeSet) {
            const res = await window.electronAPI.storeSet(key, value)
            if (res && res.success === false) {
                console.error(`[store] setAsync('${key}') was rejected by main process:`, res.error)
            }
            return res
        }

        return undefined
    },

    delete(key) {
        storeCache.delete(key)

        if (window.electronAPI?.storeDelete) {
            return window.electronAPI.storeDelete(key)
        }

        return undefined
    },

    // SECURITY: for keys main.js treats as protected/main-process-owned
    // (currently 'cloud.user' and 'localProTrialExpiresAt' — see
    // PROTECTED_SET_KEYS in main.js). Real persistence for those already
    // happens inside main itself (main/ipc/api.js, main/ipc/oauth.js,
    // main/services/entitlement.js) right after a genuine server response —
    // calling the regular store:set IPC channel for them would just be
    // rejected (by design) and log a "protected key" warning. This updates
    // only the renderer's own optimistic read-cache so UI (hasEffectivePro(),
    // cloudStore.getUser(), etc.) reflects the change immediately without
    // trying — and failing — to re-persist data main already wrote to disk.
    setLocal(key, value) {
        storeCache.set(key, value)
    },

    // ── Encrypted secure storage (OS safeStorage: DPAPI / Keychain / libsecret) ──
    // Writes encrypted on disk, cache holds plaintext for runtime use.
    secureSet(key, value) {
        storeCache.set(key, value) // cache as plaintext for this session
        if (window.electronAPI?.storeSecureSet) {
            return window.electronAPI.storeSecureSet(key, value)
        }
        // Fallback: plain write if secure API not yet available
        if (window.electronAPI?.storeSet) {
            return window.electronAPI.storeSet(key, value)
        }
        return undefined
    },

    async secureGetAsync(key, def = null) {
        // Return from cache first (already decrypted if hydrated)
        if (storeCache.has(key)) return storeCache.get(key)

        if (window.electronAPI?.storeSecureGet) {
            const value = await window.electronAPI.storeSecureGet(key, def)
            const final = (value === undefined || value === null) ? def : value
            storeCache.set(key, final)
            return final
        }
        // Fallback
        if (window.electronAPI?.storeGet) {
            const value = await window.electronAPI.storeGet(key, def)
            const final = (value === undefined || value === null) ? def : value
            storeCache.set(key, final)
            return final
        }
        return def
    },

    secureDelete(key) {
        storeCache.delete(key)
        if (window.electronAPI?.storeSecureDelete) {
            return window.electronAPI.storeSecureDelete(key)
        }
        if (window.electronAPI?.storeDelete) {
            return window.electronAPI.storeDelete(key)
        }
        return undefined
    }
}

// ==============================
// SHIM ДЛЯ IPC
// Имитируем старый ipcRenderer / invokeIpc,
// чтобы модули, которые их ждут, продолжили работать
// ==============================
const ipcRenderer = {
    send(channel, ...args) {
        if (window.electronAPI?.send) {
            return window.electronAPI.send(channel, ...args)
        }

        if (channel === 'set-app-zoom' && window.electronAPI?.setAppZoom) {
            return window.electronAPI.setAppZoom(args[0])
        }

        if (window.electronAPI?.ipcSend) {
            return window.electronAPI.ipcSend(channel, ...args)
        }
    },

    invoke(channel, ...args) {
        if (window.electronAPI?.invoke) {
            return window.electronAPI.invoke(channel, ...args)
        }

        if (window.electronAPI?.ipcInvoke) {
            return window.electronAPI.ipcInvoke(channel, ...args)
        }

        return Promise.resolve(null)
    },

    on(channel, listener) {
        if (window.electronAPI?.on) {
            return window.electronAPI.on(channel, listener)
        }

        if (window.electronAPI?.ipcOn) {
            return window.electronAPI.ipcOn(channel, listener)
        }
    },

    once(channel, listener) {
        if (window.electronAPI?.once) {
            return window.electronAPI.once(channel, listener)
        }
    },

    removeListener(channel, listener) {
        if (window.electronAPI?.removeListener) {
            return window.electronAPI.removeListener(channel, listener)
        }
    }
}

function invokeIpc(channel, ...args) {
    if (window.electronAPI?.invoke) {
        return window.electronAPI.invoke(channel, ...args)
    }

    if (window.electronAPI?.ipcInvoke) {
        return window.electronAPI.ipcInvoke(channel, ...args)
    }

    if (channel === 'app:getVersion' && window.electronAPI?.getAppVersion) {
        return window.electronAPI.getAppVersion()
    }

    if (channel === 'app:checkForUpdates' && window.electronAPI?.checkForUpdates) {
        return window.electronAPI.checkForUpdates()
    }

    return Promise.resolve(null)
}

const STARTUP_STAGES_FALLBACK = {
    boot:     { label: 'Initializing',         hint: 'Starting core services...' },
    store:    { label: 'Loading data',         hint: 'Reading settings and local state...' },
    i18n:     { label: 'Localization',         hint: 'Applying interface language...' },
    ui:       { label: 'Preparing UI',         hint: 'Building interface and components...' },
    bindings: { label: 'Connecting modules',   hint: 'Binding handlers and system functions...' },
    data:     { label: 'Loading workspace',    hint: 'Connecting messengers, tabs and folders...' },
    security: { label: 'Security check',       hint: 'Verifying security settings...' },
    done:     { label: 'Ready',                hint: 'Workspace is ready to use.' },
}

function getStartupStage(key) {
    const fallback = STARTUP_STAGES_FALLBACK[key] || { label: key, hint: '' }
    return {
        label: tGet(`startup.${key}.label`) || fallback.label,
        hint:  tGet(`startup.${key}.hint`)  || fallback.hint,
    }
}

function getStartupUi() {
    return {
        splash: document.getElementById('startupSplash'),
        appRoot: document.getElementById('appRoot'),
        progressFill: document.getElementById('startupProgressFill'),
        progressText: document.getElementById('startupProgressText'),
        stageText: document.getElementById('startupStageText'),
        hintText: document.getElementById('startupHintText')
    }
}

function setStartupStage(stageKey) {
    const { stageText, hintText } = getStartupUi()
    const stage = getStartupStage(stageKey)
    if (!stage) return

    if (stageText) {
        stageText.style.opacity = '0.35'
        stageText.style.transform = 'translateY(2px)'

        setTimeout(() => {
            stageText.textContent = stage.label
            stageText.style.opacity = '1'
            stageText.style.transform = 'translateY(0)'
        }, 90)
    }

    if (hintText) {
        hintText.style.opacity = '0.35'
        hintText.style.transform = 'translateY(2px)'

        setTimeout(() => {
            hintText.textContent = stage.hint
            hintText.style.opacity = '1'
            hintText.style.transform = 'translateY(0)'
        }, 90)
    }
}

function setStartupProgress(value) {
    const { progressFill, progressText } = getStartupUi()
    const safeValue = Math.max(0, Math.min(100, Math.round(value)))

    if (progressFill) {
        progressFill.style.width = `${safeValue}%`
    }

    if (progressText) {
        progressText.textContent = `${safeValue}%`
    }
}

function showAppRoot() {
    const { appRoot } = getStartupUi()
    if (!appRoot) return

    appRoot.classList.remove('app-root-hidden')
    appRoot.classList.add('app-root-ready')
}

function hideStartupSplash() {
    const { splash } = getStartupUi()
    if (!splash) return

    splash.classList.add('hidden')
}

function finishStartup({ locked = false } = {}) {
    showAppRoot()

    if (locked) {
        document.body.classList.add('startup-locked')
    } else {
        document.body.classList.remove('startup-locked')
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            hideStartupSplash()
        })
    })
}

function animateProgress(from, to, duration = 320) {
    const start = performance.now()
    const safeFrom = Math.max(0, Math.min(100, from))
    const safeTo = Math.max(0, Math.min(100, to))

    return new Promise((resolve) => {
        function frame(now) {
            const progress = Math.min(1, (now - start) / duration)
            const eased = 1 - Math.pow(1 - progress, 3)
            const value = safeFrom + (safeTo - safeFrom) * eased

            setStartupProgress(value)

            if (progress < 1) {
                requestAnimationFrame(frame)
                return
            }

            setStartupProgress(safeTo)
            resolve()
        }

        requestAnimationFrame(frame)
    })
}

async function fakeProgressTo(target, { minStepTime = 180 } = {}) {
    const currentText = document.getElementById('startupProgressText')?.textContent || '0%'
    const current = parseInt(currentText, 10) || 0
    const finalTarget = Math.max(current, Math.min(100, target))

    if (current >= finalTarget) {
        setStartupProgress(finalTarget)
        return
    }

    await Promise.all([
        animateProgress(current, finalTarget, Math.max(minStepTime, (finalTarget - current) * 18)),
        new Promise((resolve) => setTimeout(resolve, minStepTime))
    ])
}

async function advanceStartup(stageKey, percent, options = {}) {
    setStartupStage(stageKey)
    await fakeProgressTo(percent, options)
}

async function bootstrap() {
    setStartupStage('boot')
    setStartupProgress(2)
    await advanceStartup('boot', 10, { minStepTime: 220 })
    await store.hydrate([
        ['menuCollapsed', false],
        ['appZoomLevel', 0],
        ['tabZoomLevel', 1],
        ['settings', {}],
        ['security', {}],
        ['pinEnabled', false],
        ['pinHash', ''],
        ['lockOnStartup', false],
        ['messengers', []],
        ['folders', []],
        ['dividers', []],
        ['sidebarOrder', []],
        ['mutedMessengers', {}],
        ['globalMuteAll', false],
        ['extensionsState', {}],
        // BUGFIX ("состояние сплита/пресеты не восстанавливаются после
        // перезапуска"): store.get() in this renderer shim is a pure
        // cache-only read (see `get(key, def)` above — never fetches, only
        // returns whatever hydrate() already populated). These keys were
        // added to split.js/renderer.js after this hydrate() list was
        // written and never added here, so every startup-time
        // store.get('split.saved', ...) etc. silently returned the default
        // (empty) no matter what was actually saved on disk.
        ['split.saved', null],
        ['splitPresets', []],
        ['splitLeftPctPref', 50],
        ['gridRowPctPref', 50],
        ['gridSidePctPref', 50],
        // BUGFIX ("выбранный мессенджер не восстанавливался"): last-active
        // tab id, written by switchTab() on every tab switch.
        ['activeTabId', null],
        // BUGFIX ("ВПН стартует включённым для всех мессенджеров"): this
        // synchronous store.get() shim only ever returns whatever hydrate()
        // populated (see get(key, def) above) — never fetches on demand.
        // vpnAppModes was read synchronously in createMessengerItem() below
        // without ever being hydrated, so it always fell back to {} on every
        // startup, which (per "unset === enabled" default in main/ipc/vpn.js)
        // made every messenger's VPN badge show "protected" regardless of
        // what the user had actually toggled off before restart.
        ['vpnAppModes', {}],
        // Cloud non-secret fields
        ['cloud.user', null],
        ['cloud.lastSyncAt', null],
        ['cloud.lastSyncError', null],
        ['onboardingAuthSeen', false],
        ['localProTrialExpiresAt', null],
        // BUGFIX (2026-09-10, "в настройке ИИ-ассистент — всегда подсвечен
        // типа выбран 'Свой ключ'" — live user report): same disease as
        // every other entry's comment above — renderer/assistant-settings-bind.js
        // getConfig() reads this synchronously via store.get('assistant', {}),
        // which only ever returns whatever hydrate() populated. Never having
        // been added here meant it silently fell back to {} on every launch
        // (mode undefined → 'byok') no matter which mode (BYOK/Local/
        // Centrio AI) was actually saved from a previous session.
        ['assistant', {}]
        // NOTE: cloud.accessToken and cloud.refreshToken are hydrated below
        //       via secure (encrypted) channel to avoid plain-text disk exposure
    ])

    // Hydrate auth tokens via encrypted channel (safeStorage)
    // Migration-safe: decryptValue() returns plain value if not yet encrypted
    await store.secureGetAsync('cloud.accessToken', null)
    await store.secureGetAsync('cloud.refreshToken', null)

    await advanceStartup('store', 24, { minStepTime: 240 })

    // Помечаем платформу на <body> для CSS-адаптаций
    if (window.electronAPI?.platform) {
        document.body.classList.add(`platform-${window.electronAPI.platform}`)
    }

    await initI18n()
    const _bootLanguage = getCurrentLanguage() // Сохраняем язык до loadData/cloud-sync
    const _subtitleEl = document.querySelector('.startup-subtitle[data-i18n]')
    if (_subtitleEl) _subtitleEl.textContent = tGet('startup.subtitle')
    await advanceStartup('i18n', 34, { minStepTime: 220 })
    // ==============================
    // НАЧАЛЬНОЕ СОСТОЯНИЕ
    // ==============================
    state.modalFiltered = [...popularMessengers]
    state.menuCollapsed = await store.getAsync('menuCollapsed', false)
    state.sidebarBarExpanded = await store.getAsync('sidebarBarExpanded', false)
    state.appZoomLevel = await store.getAsync('appZoomLevel', 0)
    state.tabZoomLevel = await store.getAsync('tabZoomLevel', 1)

    // ==============================
    // СОЗДАНИЕ СЛУЖЕБНЫХ DOM-ЭЛЕМЕНТОВ
    // ==============================
    const folderPanel = document.createElement('div')
    folderPanel.id = 'folderPanel'
    folderPanel.className = 'folder-panel'
    folderPanel.innerHTML = `
        <div class="folder-panel-label">
            <button class="folder-panel-close" id="folderPanelClose">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
            <span class="folder-panel-name" id="folderPanelName"></span>
        </div>
        <div class="folder-panel-content" id="folderPanelContent"></div>
    `
    document.body.appendChild(folderPanel)

    const tooltip = document.createElement('div')
    tooltip.className = 'sidebar-tooltip'
    tooltip.id = 'sidebarTooltip'
    document.body.appendChild(tooltip)

    const pinInputNew = document.createElement('input')
    pinInputNew.type = 'tel'
    pinInputNew.maxLength = 4
    pinInputNew.autocomplete = 'off'
    pinInputNew.style.cssText = 'position:fixed;top:-999px;left:-999px;width:1px;height:1px;opacity:0;pointer-events:none;'
    pinInputNew.id = '_pinInputNew'
    document.body.appendChild(pinInputNew)

    const pinInputConfirm = document.createElement('input')
    pinInputConfirm.type = 'tel'
    pinInputConfirm.maxLength = 4
    pinInputConfirm.autocomplete = 'off'
    pinInputConfirm.style.cssText = 'position:fixed;top:-999px;left:-999px;width:1px;height:1px;opacity:0;pointer-events:none;'
    pinInputConfirm.id = '_pinInputConfirm'
    document.body.appendChild(pinInputConfirm)

    const pinDisableInput = document.createElement('input')
    pinDisableInput.type = 'tel'
    pinDisableInput.maxLength = 4
    pinDisableInput.autocomplete = 'off'
    pinDisableInput.style.cssText = 'position:fixed;top:-999px;left:-999px;width:1px;height:1px;opacity:0;'
    pinDisableInput.id = '_pinDisableInput'
    document.body.appendChild(pinDisableInput)

    // ==============================
    // ОСНОВНЫЕ DOM-ССЫЛКИ
    // ==============================
    const messengerList = document.getElementById('messengerList')
    const tabsBar = document.getElementById('tabsBar')
    const tabsContent  = document.getElementById('tabsContent')
    const contentArea  = document.getElementById('contentArea')
    const welcomeScreen = document.getElementById('welcomeScreen')
    const addModal = document.getElementById('addModal')
    const messengerGrid = document.getElementById('messengerGrid')
    const contextMenu = document.getElementById('contextMenu')
    const folderContextMenu = document.getElementById('folderContextMenu')
    const folderPickMenu = document.getElementById('folderPickMenu')
    const editModal = document.getElementById('editModal')
    const findBar = document.getElementById('findBar')
    const findInput = document.getElementById('findInput')
    const findCount = document.getElementById('findCount')
    const findAllBtn = document.getElementById('findAllBtn')
    const findAllResults = document.getElementById('findAllResults')
    const quickSearch = document.getElementById('quickSearch')
    const quickSearchInput = document.getElementById('quickSearchInput')
    const quickSearchResults = document.getElementById('quickSearchResults')
    const webviewContextMenu = document.getElementById('webviewContextMenu')
    const sidebarContextMenu = document.getElementById('sidebarContextMenu')
    const dividerContextMenu = document.getElementById('dividerContextMenu')
    const menuToggleBtn = document.getElementById('menuToggleBtn')
    const titlebarMenu = document.getElementById('titlebarMenu')
    const menuToggleIcon = document.getElementById('menuToggleIcon')
    const activityBar = document.querySelector('.activity-bar')
    const sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn')


     await advanceStartup('ui', 46, { minStepTime: 260 })
    // ==============================
    // CLOUD API
    // ==============================
    const cloudStore = createCloudStore(store)

    const cloudApi = createCloudApi({
        store,
        cloudStore,
        invokeIpc,
        getSyncPayload: () => {
            // FEATURE (2026-09-10, TEAM owner-control epic — assigned
            // messengers): org-assigned slots live in state.activeMessengers
            // (orgAssigned: true, see renderer/org-team.js) purely so they
            // render in the sidebar/tabs alongside personal ones — they must
            // NEVER be pushed through this sync payload. POST /api/sync
            // deleteMany+recreates the user's OWN Messenger rows from
            // whatever's sent here; letting an org-assigned entry leak in
            // would turn it into a personal messenger (surviving
            // unassignment, counting against FREE_MESSENGER_LIMIT) the next
            // time any of the user's devices syncs.
            const messengers = state.activeMessengers.filter((m) => !m.orgAssigned).map((m, idx) => ({
                id: m.id,
                name: m.name,
                url: m.url,
                icon: m.icon,
                color: m.color,
                isMuted: state.mutedMessengers[m.id] || false,
                notifSound: m.notifSound || '__default__',
                folderId: m.folderId || null,
                position: idx,
                zoomLevel: typeof m.zoomLevel === 'number' ? m.zoomLevel : 1
            }))

            const folders = state.folders.map((f, idx) => ({
                id: f.id,
                name: f.name,
                icon: f.icon,
                position: idx
            }))

            const settings = store.get('settings', {}) || {}

            return {
                messengers,
                folders,
                settings: {
                    theme: settings.theme || 'embedded',
                    accentColor: settings.accentColor || '#7b68ee',
                    density: settings.density || 'normal',
                    language: settings.language || 'ru',
                    sidebarPosition: settings.sidebarPosition || 'left',
                    showTabs: settings.showTabs !== false,
                    notifications: settings.notifications !== false,
                    notifSound: settings.notifSound !== false,
                    foldersEnabled: settings.foldersEnabled !== false,
                    globalMuteAll: state.globalMuteAll || false,
                    extra: {
                        // Блокировка: читаем из 'security' (именно там сохраняет lock.js)
                        pinEnabled:    store.get('security', {}).enabled  || false,
                        pinHash:       store.get('security', {}).hash     || '',
                        lockOnHide:    store.get('security', {}).lockOnHide || false,
                        lockOnStartup: store.get('lockOnStartup', false),
                        tabZoomLevel:  settings.tabZoomLevel || 1,
                        activeTabId:   state.activeTabId || null,
                        // Прокси синхронизируем без пароля — пароль хранится отдельно через
                        // store.secureSet('globalProxy.password', ...) и никогда не попадает в облако
                        globalProxy:     (() => {
                            const { password, ...rest } = store.get('globalProxy', {}) || {}
                            return rest
                        })(),
                        sidebarOrder:    store.get('sidebarOrder', []),
                        menuCollapsed:   store.get('menuCollapsed', false),
                        appZoomLevel:    store.get('appZoomLevel', 0),
                        vpnAppModes:     store.get('vpnAppModes', {}) || {},
                        // extensionsState включает состояние всех расширений, в т.ч. нативного 'split'
                        extensionsState: store.get('extensionsState', {}) || {},
                        // Позиция разделителя сплит-экрана и сохранённые пресеты — чтобы
                        // пользователь получал привычную раскладку сразу на любой машине,
                        // а не подгонял её заново при каждом входе (см. renderer/split.js).
                        splitLeftPctPref: store.get('splitLeftPctPref', 50),
                        splitPresets:     store.get('splitPresets', []) || []
                    }
                }
            }
        },
        onAuthUpdated: () => updateCloudBtn()
    })

    const { cloudSyncPush, cloudSyncPull, authorizedInvoke } = cloudApi

    // Подключаем отложенный автопуш (см. notifySyncedStoreWrite выше) —
    // до этой точки cloudSyncPush ещё не существовал.
    scheduleAutoCloudSync = () => {
        if (!cloudStore.isLoggedIn()) return
        cloudSyncPush().catch(err => console.error('[store] auto cloudSyncPush failed:', err))
    }

    // BUGFIX ("выключаю звук уведомлений — включается обратно после
    // перезапуска"): notifySyncedStoreWrite() debounce'ит автопуш на 1500мс,
    // чтобы не слать запрос на каждую отдельную запись. Если пользователь
    // меняет настройку и закрывает приложение до истечения этих 1500мс,
    // scheduleAutoCloudSync() ни разу не вызывается — pendingSyncPush в
    // main-процессе (main/ipc/api.js) остаётся пустым, и уже существующий
    // before-quit waitForPendingSyncPush() ждать нечего. Локальный диск
    // получает верное значение, но облако — нет, и следующий cloudSyncPull()
    // при старте тихо перезаписывает локальное значение старым облачным —
    // это применимо к ЛЮБОЙ настройке из SYNCED_STORE_KEYS, не только к звуку.
    // main шлёт 'app-quitting' перед quit; сбрасываем таймер и пушим сразу,
    // не дожидаясь дебаунса.
    ipcRenderer.on('app-quitting', () => {
        clearTimeout(autoCloudSyncTimer)
        autoCloudSyncTimer = null

        const ack = () => ipcRenderer.send('app-quitting-flushed')

        if (!cloudStore.isLoggedIn() || suppressAutoCloudSync) {
            ack()
            return
        }

        cloudSyncPush()
            .catch(err => console.error('[store] quit-time cloudSyncPush failed:', err))
            .finally(ack)
    })

    // После входа на новом устройстве: тянем облако → применяем → перезагружаем
    // Если облако пустое — пушим локальные данные
    async function cloudSyncAfterLogin() {
        try {
            // Обновляем данные пользователя с сервера (план, аватар и т.д.)
            await cloudApi.refreshUser()
            if (typeof updateCloudBtn === 'function') updateCloudBtn()
            updateAddButtonState()
            updateTrialStatusBar()
            // Covers the no-reload branch below (empty cloud → local push);
            // the has-data branch reloads the whole page, which re-derives
            // locks itself via loadData().
            reapplyMessengerLocks()
            reapplyExtensionLocks()
            reapplySettingsLocks()
            reapplyFolderLocks()

            reapplySoundLocks()

            const cloudData = await cloudSyncPull()
            const hasData = (cloudData?.messengers?.length > 0) || (cloudData?.folders?.length > 0)
            if (hasData) {
                // Пишем данные, только что стянутые ИЗ облака — не планировать
                // автопуш этих же данных обратно (страница всё равно перезагрузится).
                suppressAutoCloudSync = true
                // Используем setAsync чтобы гарантировать запись в store до перезагрузки
                await store.setAsync('messengers', cloudData.messengers.map(m => ({
                    id: m.id,
                    name: m.name,
                    url: m.url,
                    icon: m.icon || null,
                    color: m.color || null,
                    folderId: m.folderId || null,
                    notifSound: m.notifSound || '__default__',
                    zoomLevel: typeof m.zoomLevel === 'number' ? m.zoomLevel : 1
                })))
                await store.setAsync('folders', cloudData.folders || [])
                if (cloudData.settings) {
                    const { extra, ...baseSettings } = cloudData.settings
                    const cur = store.get('settings', {}) || {}
                    // Language is device-local — never let cloud overwrite it
                    const merged = { ...cur, ...baseSettings }
                    if (cur.language) merged.language = cur.language
                    await store.setAsync('settings', merged)
                    if (extra) {
                        // Восстанавливаем блокировку в 'security' (именно там читает lock.js)
                        if (extra.pinEnabled !== undefined || extra.pinHash !== undefined) {
                            const sec = store.get('security', {})
                            await store.setAsync('security', {
                                ...sec,
                                enabled:    extra.pinEnabled  !== undefined ? extra.pinEnabled  : sec.enabled,
                                hash:       extra.pinHash     !== undefined ? extra.pinHash      : sec.hash,
                                lockOnHide: extra.lockOnHide  !== undefined ? extra.lockOnHide   : sec.lockOnHide
                            })
                        }
                        if (extra.lockOnStartup !== undefined) await store.setAsync('lockOnStartup', extra.lockOnStartup)
                        if (extra.globalProxy !== undefined) {
                            // Пароль прокси никогда не приходит из облака — сохраняем текущий,
                            // объединяя с остальными (безопасными) полями из облака
                            const curProxy = store.get('globalProxy', {}) || {}
                            await store.setAsync('globalProxy', { ...curProxy, ...extra.globalProxy })
                        }
                        if (extra.sidebarOrder !== undefined) await store.setAsync('sidebarOrder', extra.sidebarOrder)
                        if (extra.menuCollapsed !== undefined) await store.setAsync('menuCollapsed', extra.menuCollapsed)
                        if (extra.appZoomLevel !== undefined) await store.setAsync('appZoomLevel', extra.appZoomLevel)
                        if (extra.vpnAppModes !== undefined) await store.setAsync('vpnAppModes', extra.vpnAppModes)
                        if (extra.extensionsState !== undefined) await store.setAsync('extensionsState', extra.extensionsState)
                        if (extra.splitLeftPctPref !== undefined) await store.setAsync('splitLeftPctPref', extra.splitLeftPctPref)
                        if (extra.splitPresets !== undefined) await store.setAsync('splitPresets', extra.splitPresets)
                        if (extra.activeTabId !== undefined) await store.setAsync('activeTabId', extra.activeTabId)
                    }
                }
                const muted = {}
                cloudData.messengers.forEach(m => { if (m.isMuted) muted[m.id] = true })
                await store.setAsync('mutedMessengers', muted)
                // Перезагружаем приложение чтобы применить все данные
                sessionStorage.setItem('_centrio_post_login_reload', '1')
                window.location.reload()
            } else {
                // Облако пустое — загружаем локальные данные на сервер
                await cloudSyncPush()
                // Подгружаем уведомления (пользователь залогинен, перезагрузки нет)
                appNotifApi?.fetchNotifications?.()
            }
        } catch {
            await cloudSyncPush()
        }
    }

    // ==============================
    // SOUNDS API
    // ==============================
    const soundsApi = createSoundsApi({
        store,
        ipcRenderer,
        getActiveMessengers: () => state.activeMessengers
    })

    const { playNotifSound, initSoundPicker, previewMessengerSound } = soundsApi

    // ==============================
    // DOWNLOADS API
    // ==============================
    const downloadsApi = bindDownloads({
        store,
        ipcRenderer,
        invokeIpc,
        tGet
    })

    const { updateDownloadDirUI } = downloadsApi

    // ==============================
    // STATUS BAR API
    // ==============================
    const statusBarApi = createStatusBarApi({
        store,
        state,
        tGet,
        getCurrentLocale
    })

    const { updateStatusBar, updateZoomStatus } = statusBarApi
    updateStatusBar() // сразу показываем время и дату при старте

    // ==============================
    // TOOLTIPS API
    // ==============================
    const tooltipsApi = createTooltipsApi({
        state,
        tooltip
    })

    const { showTooltip, hideTooltip } = tooltipsApi

    // ==============================
    // UNREAD API
    // ==============================
    const unreadApi = createUnreadApi({
        state,
        store,
        tGet,
        ipcRenderer,
        updateStatusBar,
        updateFolderBadge: (...args) => updateFolderBadge(...args)
    })

    const {
        isMessengerMuted,
        resetMessengerNotifyState,
        updateMuteIcon,
        updateContextMuteLabel,
        updateMuteAllBtn,
        updateUnreadCount,
        repaintAllUnreadBadges,
        toggleMuteAll
    } = unreadApi

    // ==============================
    // WEBVIEW NOTIFY API
    // ==============================
    let addMessengerNotifRef = null

    const webviewNotifyApi = createWebviewNotifyApi({
        state,
        store,
        tGet,
        ipcRenderer,
        invokeIpc,
        playNotifSound,
        isMessengerMuted,
        updateUnreadCount,
        addMessengerNotification: (title, body, name, messengerId, actionUrl) => {
            if (typeof addMessengerNotifRef === 'function') {
                addMessengerNotifRef(title, body, name, messengerId, actionUrl)
            }
        }
    })

    const { watchWebview } = webviewNotifyApi

    // ==============================
    // СОХРАНЕНИЕ ДАННЫХ
    // ==============================
    function saveData() {
        // See the matching comment in getSyncPayload() above — org-assigned
        // messengers must never be persisted into the personal 'messengers'
        // store key either, or they'd survive unassignment locally too.
        const messengers = state.activeMessengers.filter((m) => !m.orgAssigned).map(m => ({
            name: m.name,
            url: m.url,
            icon: m.icon,
            color: m.color,
            id: m.id,
            folderId: m.folderId || null,
            notifSound: m.notifSound || '__default__',
            zoomLevel: typeof m.zoomLevel === 'number' ? m.zoomLevel : 1
        }))

        // store.set('messengers', ...) returns the underlying storeSet IPC
        // promise (see `store` object above) — returned here so a caller that
        // needs the main process's store to be authoritative BEFORE a
        // dependent side effect (see addMessenger below) can `await
        // saveData()`. Existing call sites that don't await this keep
        // firing-and-forgetting exactly as before, so this is safe to add.
        const messengersSaved = store.set('messengers', messengers)
        store.set('folders', state.folders)
        store.set('dividers', state.dividers)
        store.set('mutedMessengers', state.mutedMessengers)
        store.set('globalMuteAll', state.globalMuteAll)

        if (cloudStore.isLoggedIn()) cloudSyncPush()

        return messengersSaved
    }

    // ==============================
    // СОЗДАНИЕ ЭЛЕМЕНТА МЕССЕНДЖЕРА
    // ==============================
    function createMessengerItem(messenger) {
        const item = document.createElement('div')
        item.className = 'messenger-item'
        item.id = `sidebar-${messenger.id}`

        const hostname = (() => {
            try {
                return new URL(messenger.url).hostname
            } catch {
                return ''
            }
        })()

        const iconSources = [
            messenger.icon,
            `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            `https://icon.horse/icon/${hostname}`
        ]

        const vpnModes = store.get('vpnAppModes', {}) || {}
        // По умолчанию VPN включён для всех мессенджеров (см. main/ipc/vpn.js: "true = use VPN (default)"),
        // поэтому отсутствие явного false в vpnModes означает "включён", а не "выключен".
        // Дополнительно гасим бейдж, если сам VPN сейчас не подключён (state.vpnActive) — щит не должен
        // говорить "защищено", когда туннель фактически не поднят.
        const hasVpn   = (vpnModes[messenger.id] !== false) && !!state.vpnActive

        item.innerHTML = `
            <div class="messenger-icon-wrap">
                <img class="messenger-icon"
                     src="${iconSources[0]}"
                     alt="${messenger.name}"
                     data-sources='${JSON.stringify(iconSources)}'
                     data-index="0">
                ${hasVpn ? '<span class="vpn-badge" title="VPN включён">🛡</span>' : ''}
            </div>
            <span class="messenger-name">${messenger.name}</span>
        `

        const img = item.querySelector('img')
        img.addEventListener('error', function () {
            const sources = JSON.parse(this.dataset.sources)
            const nextIndex = parseInt(this.dataset.index, 10) + 1

            if (nextIndex < sources.length) {
                this.dataset.index = String(nextIndex)
                this.src = sources[nextIndex]
                return
            }

            this.style.display = 'none'
            const letter = document.createElement('div')
            letter.className = 'messenger-letter'
            letter.textContent = messenger.name[0].toUpperCase()
            this.parentElement.insertBefore(letter, this)
        })

        item.addEventListener('click', () => {
            // SECURITY / BUGFIX (retroactive FREE-limit enforcement): messengers
            // beyond the free plan's first 3 (see reapplyMessengerLocks() below)
            // stay visible in the sidebar but must not actually switch to them —
            // otherwise a lapsed Pro/trial user could keep using messengers added
            // while still Pro forever, just by clicking the icon.
            if (isMessengerLocked(messenger.id)) {
                showUpgradeModal(
                    tGet('pro.messengerLimitTitle'),
                    tGet('pro.messengerLimitDesc').replace('{n}', FREE_MESSENGER_LIMIT)
                )
                return
            }
            switchTab(messenger.id)
        })
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            showContextMenu(e, messenger.id)
        })

        if (isMessengerMuted(messenger.id)) updateMuteIcon(messenger.id)

        initDrag(item, messenger.id, 'messenger')
        initDropTarget(item, messenger.id, 'messenger')

        item.addEventListener('mouseenter', () => {
            if (item.closest('.folder-panel-content')) return
            showTooltip(item, messenger.name, state.unreadCounts[messenger.id] || 0)
        })

        item.addEventListener('mouseleave', hideTooltip)
        return item
    }

    // ==============================
    // АНИМАЦИЯ ДОБАВЛЕНИЯ
    // ==============================
    function animateMessengerAdd(element) {
        if (!element) return
        element.classList.add('just-added')
        element.addEventListener('animationend', () => element.classList.remove('just-added'), { once: true })
    }

    // ==============================
    // ДОБАВЛЕНИЕ В SIDEBAR
    // ==============================
    function addToSidebar(messenger) {
        const item = createMessengerItem(messenger)
        const zone = messengerList.querySelector('.sidebar-root-drop-zone')
        if (zone) messengerList.insertBefore(item, zone)
        else messengerList.appendChild(item)
        animateMessengerAdd(item)
    }

    // ==============================
    // FOLDERS UI API
    // ==============================
    const foldersUiApi = createFoldersUiApi({
        state,
        store,
        folderPanel,
        messengerList,
        renderMessengerItem: createMessengerItem,
        addToSidebar,
        saveData
    })

    const {
        updateFolderBadge,
        renderFolderPanel,
        closeFolderPanel,
        toggleFolderPanel,
        addToFolder,
        removeFolder,
        applyFoldersEnabled
    } = foldersUiApi

    // ==============================
    // LOCK API
    // ==============================
    const lockApi = createLockApi({
        state,
        store,
        tGet,
        ipcRenderer,
        hashPassword,
        pinInputNew,
        pinInputConfirm,
        pinDisableInput
    })

    const {
        isPasswordEnabled,
        updateLockBtn,
        checkLockOnStart,
        updateLockDots,
        showLockScreen,
        tryUnlock,
        updateSetPinDots,
        setActivePinBlock,
        resetPinSetup,
        savePinClick,
        handlePinInput,
        updateDisableDots,
        openPinDisableModal,
        closePinDisableModal,
        tryDisablePin,
        showForgotPinConfirm
    } = lockApi

    // BUGFIX (2026-09-06, аудит безопасности): настройка "Запрашивать PIN
    // при запуске" (lockOnStartup, renderer/settings-bind.js) годами
    // сохранялась и импортировалась/экспортировалась (see
    // main/ipc/settingsPortability.js), но checkLockOnStart() — функция,
    // явно написанная и экспортированная именно для этого случая — нигде
    // не вызывалась. show-lock-screen (app-hidden/автоблокировка по
    // бездействию) покрывает сворачивание/простой, но НЕ холодный запуск
    // приложения: пользователь, включивший эту настройку, ожидал, что
    // после полного перезапуска Centrio сразу попросит PIN, а фактически
    // сразу показывались вкладки мессенджеров без единого запроса пароля.
    if (store.get('lockOnStartup', false)) checkLockOnStart()

    // ==============================
    // CLOUD UI API
    // ==============================
    const cloudUiApi = createCloudUiApi({
        cloudStore,
        tGet,
        getUserInitial,
        getLocalStats: () => ({
            messengers: state.activeMessengers.length,
            folders:    state.folders.length,
            lastSyncAt: cloudStore.getLastSyncAt()
        }),
        getCloudStats: async () => {
            const result = await authorizedInvoke('api-get-stats')
            return result?.success ? result.data : null
        },
        applyOrgLogo
    })

    const {
        updateCloudBtn,
        updateAvatarInModal,
        openCloudLogin,
        openCloudProfile,
        renderLocalStats
    } = cloudUiApi

    // ==============================
    // ПЕРЕМЕЩЕНИЕ МЕССЕНДЖЕРА В ПАПКУ
    // ==============================
    function moveMessengerToFolder(messengerId, folderId) {
        const messenger = state.activeMessengers.find(m => m.id === messengerId)
        if (!messenger) return

        const oldFolderId = messenger.folderId
        document.getElementById(`sidebar-${messengerId}`)?.remove()
        messenger.folderId = folderId || null

        if (folderId) {
            addToFolder(messenger, folderId)
            updateFolderBadge(folderId)
        } else {
            addToSidebar(messenger)
        }

        if (oldFolderId) updateFolderBadge(oldFolderId)

        if (state.activeFolderPanelId === folderId || state.activeFolderPanelId === oldFolderId) {
            if (state.activeFolderPanelId) renderFolderPanel(state.activeFolderPanelId)
        }

        saveData()
    }

    // ==============================
    // CONTEXT MENUS API
    // ==============================
    const contextMenusApi = createContextMenusApi({
        state,
        contextMenu,
        folderContextMenu,
        folderPickMenu,
        sidebarContextMenu,
        webviewContextMenu,
        dividerContextMenu,
        folderIcons,
        tGet,
        getActiveMessengers: () => state.activeMessengers,
        moveMessengerToFolder,
        updateContextMuteLabel
    })

    const {
        hideAllMenus,
        showContextMenu,
        showFolderContextMenu,
        showDividerContextMenu
    } = contextMenusApi

    // ==============================
    // РЕНДЕР ПАПКИ
    // ==============================
    function renderFolder(folder) {
        const folderEl = document.createElement('div')
        folderEl.className = 'folder-item'
        folderEl.id = `folder-${folder.id}`

        const iconSvg = folderIcons[folder.icon] || folderIcons.folder
        folderEl.innerHTML = `
            <div class="folder-header">
                <div class="folder-icon-wrap">${iconSvg}</div>
            </div>
            <div class="folder-children" id="folder-children-${folder.id}"></div>
        `

        const header = folderEl.querySelector('.folder-header')
        header.addEventListener('click', () => toggleFolderPanel(folder.id))
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            state.contextTargetFolderId = folder.id
            showFolderContextMenu(e, folder.id)
        })

        initDrag(folderEl, folder.id, 'folder')
        initDropTarget(folderEl, folder.id, 'folder')

        header.addEventListener('mouseenter', () => {
            const total = state.activeMessengers
                .filter(m => m.folderId === folder.id)
                .reduce((sum, m) => sum + (state.unreadCounts[m.id] || 0), 0)

            showTooltip(header, folder.name, total)
        })

        header.addEventListener('mouseleave', hideTooltip)
        const zone = messengerList.querySelector('.sidebar-root-drop-zone')
        if (zone) messengerList.insertBefore(folderEl, zone)
        else messengerList.appendChild(folderEl)
    }

    // ==============================
    // РЕНДЕР РАЗДЕЛИТЕЛЯ (sidebar divider)
    // ==============================
    // Разделитель — чисто визуальная сущность сайдбара без своих данных
    // (в отличие от мессенджера/папки), нужна только для группировки иконок.
    // Хранится в state.dividers / store('dividers') и участвует в общем
    // порядке sidebarOrder наравне с мессенджерами и папками.
    function renderDivider(divider) {
        const dividerEl = document.createElement('div')
        dividerEl.className = 'sidebar-divider'
        dividerEl.id = `divider-${divider.id}`

        dividerEl.addEventListener('contextmenu', (e) => {
            e.preventDefault()
            e.stopPropagation()
            showDividerContextMenu(e, divider.id)
        })

        initDrag(dividerEl, divider.id, 'divider')
        initDropTarget(dividerEl, divider.id, 'divider')

        const zone = messengerList.querySelector('.sidebar-root-drop-zone')
        if (zone) messengerList.insertBefore(dividerEl, zone)
        else messengerList.appendChild(dividerEl)
    }

    function addDivider() {
        const divider = { id: Date.now().toString() }
        state.dividers.push(divider)
        renderDivider(divider)
        store.set('dividers', state.dividers)
        saveOrder()
    }

    function removeDivider(dividerId) {
        if (!dividerId) return
        state.dividers = state.dividers.filter(d => d.id !== dividerId)
        const el = document.getElementById(`divider-${dividerId}`)
        if (el) el.remove()
        store.set('dividers', state.dividers)
        saveOrder()
    }

    function markWebviewReady(webview) {
    if (!webview) return

    if (webview.dataset.domReadyBound === 'true') return
    webview.dataset.domReadyBound = 'true'

    webview.addEventListener('dom-ready', () => {
        webview.dataset.domReady = 'true'

        const pendingZoom = Number(webview.dataset.pendingZoom)
        if (!Number.isNaN(pendingZoom) && pendingZoom > 0) {
            try {
                webview.setZoomFactor(pendingZoom)
            } catch (error) {
                console.error('Failed to apply pending zoom:', error)
            }
            delete webview.dataset.pendingZoom
        }
    })
}

function applyZoomWhenReady(webview, zoomLevel) {
    if (!webview) return

    markWebviewReady(webview)

    // Try immediately — works if webview is already loaded.
    // setZoomFactor throws when webContents isn't ready yet; pendingZoom handles that case.
    try {
        webview.setZoomFactor(zoomLevel)
        webview.dataset.pendingZoom = String(zoomLevel)
        return
    } catch (_) {
        // webview not ready yet — defer to dom-ready via markWebviewReady
    }

    webview.dataset.pendingZoom = String(zoomLevel)
}

    // ==============================
    // ПЕРЕКЛЮЧЕНИЕ ВКЛАДКИ
    // ==============================

    // ── Tab time tracker state ────────────────────────────────────
    let _tkPrevId    = null   // previous messenger id
    let _tkPrevName  = null   // previous messenger name
    let _tkStart     = 0      // when current tab became active

// ── Split API (initialised below, after DOM refs are ready) ───
    let splitApi = null
    // ── Мини-плеер медиа (initialised below, after switchTab/tGet are ready) ──
    let mediaPlayerUiApi = null

function switchTab(id) {
    // In split mode route to the focused pane
    if (state.splitMode) {
        if (state.splitLayout !== '2col') {
            if (state.splitZoneFocus !== 0) {
                splitApi?.switchGridZone(state.splitZoneFocus, id)
                return
            }
            // Zone 0 (primary): don't let it overlap another already-assigned zone
            if (state.splitZoneIds.slice(1).includes(id)) return
        } else if (state.splitFocus === 'right') {
            splitApi?.switchSplitTab(id)
            return
        } else if (id === state.splitTabId) {
            // Left pane: don't let primary overlap secondary
            return
        }
    }

    // Track time spent on previous tab
    if (_tkPrevId && _tkPrevName && _tkStart > 0) {
        const secs = Math.floor((Date.now() - _tkStart) / 1000)
        if (secs > 0) {
            invokeIpc('tracker:service-time', { service: _tkPrevName, serviceTime: secs })
                .catch(() => {})
        }
    }
    // Update tracker state for new tab
    const _nextMessenger = state.activeMessengers.find(m => m.id === id)
    _tkPrevId   = id
    _tkPrevName = _nextMessenger?.name || null
    _tkStart    = Date.now()

    state.activeTabId = id
    // BUGFIX ("не сохраняется выбранный мессенджер"): state.activeTabId only
    // ever lived in memory — it was read into the cloud-push payload's
    // settings.extra.activeTabId (see getPushPayload above), but nothing
    // wrote it to local persistent storage, and nothing on cloud-pull wrote
    // it back either. loadData() expected to find it at
    // store.get('settings').extra.activeTabId, a path that was never
    // populated locally by anyone — so the restore always silently fell
    // back to the first tab. Persist it directly under its own top-level key
    // (added to main.js's ALLOWED_STORE_ROOTS) instead.
    store.set('activeTabId', id)

    document.querySelectorAll('.messenger-item').forEach(item => item.classList.remove('active'))
    const sidebarItem = document.getElementById(`sidebar-${id}`)
    if (sidebarItem) {
        sidebarItem.classList.add('active')
        const folderChildren = sidebarItem.closest('.folder-children')
        if (folderChildren) folderChildren.closest('.folder-item')?.classList.add('open')
    }

    document.querySelectorAll('.tab').forEach(tabEl => tabEl.classList.remove('active'))
    const tab = document.getElementById(`tab-${id}`)
    if (tab) {
        tab.classList.add('active')
        tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }

    // BUGFIX ("окно мессенджера выше окна сплита"): onPrimaryChanged() is what
    // sets the correct inline left/top/width/height for the new primary
    // webview in split mode (2col via _applyWebviewInlineStyles, grid layouts
    // via _applyGridZoneWebview). It used to run at the very end of this
    // function, AFTER the webview already got its 'active' class added below
    // — for a webview that had never been positioned as a split pane before
    // (e.g. switching straight to a brand-new tab), that meant it briefly
    // became visible at the *default* full-size CSS geometry (webview {
    // width:100%; height:100% } / inset:0) before the correct split geometry
    // was applied a few lines later. Both happen synchronously so a normal
    // DOM element wouldn't visibly flash, but Electron's <webview> is a
    // separate compositor layer that doesn't reliably pick up a same-tick
    // follow-up resize the way regular elements do (same class of quirk
    // documented at the top of split.js re: z-index/stacking) — the
    // oversized first-paint geometry was sticking. Fix: compute the correct
    // split geometry BEFORE the webview is ever shown (before the 'active'
    // class is added), so there's no wrong size to ever get latched in.
    splitApi?.onPrimaryChanged(id)

    document.querySelectorAll('webview').forEach(wv => wv.classList.remove('active'))

    const activeWebview = document.getElementById(`webview-${id}`)
    const activeMessenger = state.activeMessengers.find(m => m.id === id)

    if (activeMessenger) {
        state.tabZoomLevel = typeof activeMessenger.zoomLevel === 'number'
            ? activeMessenger.zoomLevel
            : (store.get('tabZoomLevel', 1) || 1)
    } else {
        state.tabZoomLevel = store.get('tabZoomLevel', 1) || 1
    }

    if (activeWebview) {
        activeWebview.classList.add('active')
        applyZoomWhenReady(activeWebview, state.tabZoomLevel)
    }


    updateZoomStatus()

    // Адаптивная тема: обновить цвета под новую вкладку
    updateAdaptiveTheme(() => document.getElementById(`webview-${id}`))
}

    // ==============================
    // SEARCH UI API
    // ==============================
    const searchUiApi = createSearchUiApi({
        state,
        quickSearch,
        quickSearchInput,
        quickSearchResults,
        findBar,
        findInput,
        findCount,
        findAllBtn,
        findAllResults,
        tGet,
        switchTab,
        isMessengerMuted,
        updateMuteAllBtn: () => updateMuteAllBtn()
    })

    const onboardingTourApi = createOnboardingTourApi({ store, tGet })

    const {
        openFindBar,
        closeFindBar,
        openQuickSearch,
        closeQuickSearch
    } = searchUiApi

    // ==============================
    // ПОЛУЧЕНИЕ АКТИВНОГО WEBVIEW
    // ==============================
    function getActiveWebview() {
        // In split mode return the focused pane's webview
        if (state.splitMode && state.splitFocus === 'right') {
            if (!state.splitTabId) return null
            return document.getElementById(`webview-${state.splitTabId}`)
        }
        if (!state.activeTabId) return null
        return document.getElementById(`webview-${state.activeTabId}`)
    }

    // ==============================
    // ИЗМЕНЕНИЕ TAB ZOOM
    // ==============================
function applyTabZoom(level) {
    const nextZoom = Math.max(0.25, Math.min(5, level))
    state.tabZoomLevel = nextZoom
    store.set('tabZoomLevel', nextZoom)

    const activeMessenger = state.activeMessengers.find(m => m.id === state.activeTabId)
    if (activeMessenger) {
        activeMessenger.zoomLevel = nextZoom
    }

    const webview = getActiveWebview()
    if (webview) {
        applyZoomWhenReady(webview, nextZoom)
    }

    saveData()
    updateZoomStatus()
}

    // ==============================
    // УДАЛЕНИЕ МЕССЕНДЖЕРА
    // ==============================
    function removeMessenger(id) {
        const messenger = state.activeMessengers.find(m => m.id === id)
        const folderId = messenger?.folderId

        state.activeMessengers = state.activeMessengers.filter(m => m.id !== id)
        delete state.unreadCounts[id]
        delete state.rawUnreadCounts[id]
        delete state.mutedMessengers[id]
        delete state.messengerNotifyState[id]
        delete state.siteNotificationState[id]
        state.webviewWatchBound.delete(`webview-${id}`)

        document.getElementById(`sidebar-${id}`)?.remove()
        document.getElementById(`tab-${id}`)?.remove()
        document.getElementById(`webview-${id}`)?.remove()

        // Вкладка закрыта — не ждём 'ended' от её preload'а (webview уже
        // удалён из DOM и никогда его не пришлёт), прячем мини-плеер сразу,
        // если это был единственный/текущий играющий источник.
        mediaPlayerUiApi?.onMessengerRemoved(id)

        if (folderId) updateFolderBadge(folderId)

        if (state.activeMessengers.length > 0) {
            switchTab(state.activeMessengers[state.activeMessengers.length - 1].id)
        } else {
            welcomeScreen.style.display = 'flex'
            state.activeTabId = null
        }

        // Notify split API (closes split or shows picker if secondary was removed)
        splitApi?.onMessengerRemoved(id)

        tabsContent.style.pointerEvents = state.activeMessengers.length > 0 ? 'auto' : 'none'
        saveData()
        updateStatusBar()
        updateAddButtonState()
        updateTrialStatusBar()
        // Removing a messenger can free up a slot under FREE_MESSENGER_LIMIT —
        // re-check so an existing locked messenger unlocks immediately.
        reapplyMessengerLocks()
    }

    const preloadPath = window.electronAPI?.getWebviewPreloadPath
    ? await window.electronAPI.getWebviewPreloadPath()
    : ''
    // ==============================
    // МИНИ-ПЛЕЕР МЕДИА (аудио/видео во вкладках)
    // ==============================
    // Создаём до webviewTabsApi — её onMediaState передаётся туда ниже как
    // колбэк для канала 'media-state' у каждого <webview> (см. addWebview в
    // renderer/webview-tabs-bind.js).
    mediaPlayerUiApi = createMediaPlayerUiApi({
        state,
        tGet,
        switchTab,
        mediaPlayerBtn: document.getElementById('mediaPlayerBtn')
    })

    // ==============================
    // WEBVIEW TABS API
    // ==============================
    const webviewTabsApi = createWebviewTabsApi({
        state,
        store,
        tabsBar,
        tabsContent,
        findCount,
        webviewContextMenu,
        showContextMenu,
        preloadPath,
        ipcRenderer,
        invokeIpc,
        tGet,
        openFindBar,
        openSettings: () => { if (typeof openSettingsRef === 'function') openSettingsRef() },
        getActiveWebview,
        applyTabZoom,
        applyAppZoom,
        onMediaState: mediaPlayerUiApi.onMediaState,
        switchTab,
        removeMessenger,
        watchWebview
    })

    const {
        addTab,
        addWebview,
        bindWebviewContextMenuActions
    } = webviewTabsApi

    // ==============================
    // SPLIT MODE
    // ==============================
    splitApi = createSplitApi({
        state,
        tabsContent,
        contentArea,
        store,
        switchTab,
        cloudSyncPush,
        isCloudLoggedIn: () => cloudStore.isLoggedIn()
    })

    // Expose focus-tracker for webview-tabs-bind.js
    window.__centrioSplitFocus = (webview) => splitApi.onWebviewFocus(webview)

    // ==============================
    // ADD MODAL UI API
    // ==============================
    const addModalUiApi = createAddModalUiApi({
        state,
        popularMessengers,
        syntaxAiPromo,
        PAGE_SIZE,
        addModal,
        messengerGrid,
        addMessenger,
        tGet
    })

    const {
        fillMessengerGrid,
        updateScrollProgress,
        openModal,
        closeModal
    } = addModalUiApi

    // ==============================
    // UPGRADE MODAL HELPERS
    // ==============================
    function showUpgradeModal(title, desc) {
        const modal = document.getElementById('upgradeModal')
        if (!modal) return
        const titleEl = document.getElementById('upgradeModalTitle')
        const descEl  = document.getElementById('upgradeModalDesc')
        if (title && titleEl) titleEl.textContent = title
        if (desc  && descEl)  descEl.textContent  = desc
        modal.classList.add('show')
    }

    const _closeUpgradeModal = () => document.getElementById('upgradeModal')?.classList.remove('show')
    document.getElementById('upgradeModalClose')?.addEventListener('click', _closeUpgradeModal)
    document.getElementById('upgradeModalLater')?.addEventListener('click', _closeUpgradeModal)
    document.getElementById('upgradeModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('upgradeModal')) _closeUpgradeModal()
    })
    // BUGFIX ("окна не открывают личный кабинет"): this used to be an inline
    // onclick that opened the external centrio.me/pricing marketing page —
    // a dead end with no way to actually pay. The real purchase flow (plan
    // cards + YooKassa/crypto/FRIDE buttons) lives in the in-app cloud
    // profile modal, so route there instead — via login first if the user
    // isn't authenticated yet, since a purchase needs an account.
    // Corrected per user feedback: goes to the website's personal cabinet
    // (real purchase flow — YooKassa/crypto/FRIDE method selection all live
    // there), not the in-app cloud modal.
    document.getElementById('upgradeModalBtn')?.addEventListener('click', () => {
        _closeUpgradeModal()
        window.electronAPI?.openExternal?.('https://centrio.me/dashboard')
    })

    const FREE_MESSENGER_LIMIT = 3

    // SECURITY: "Add your own messenger" (add-modal-bind.js's addCustomBtn
    // handler) is gated by requirePro('customMessenger') at click time only —
    // once addMessenger() has pushed the entry into state.activeMessengers /
    // persisted `messengers`, nothing distinguishes it from a catalog entry
    // (same {id, name, url, icon, color} shape as popularMessengers in
    // renderer/constants.js). Match by hostname rather than exact URL so a
    // catalog entry's saved url can drift slightly (a different Telegram web
    // client path, etc.) without being misclassified as "custom".
    const CATALOG_HOSTNAMES = new Set(
        popularMessengers
            .map(m => { try { return new URL(m.url).hostname } catch { return null } })
            .filter(Boolean)
    )
    function isCatalogMessenger(m) {
        if (!m || !m.url) return false
        try {
            return CATALOG_HOSTNAMES.has(new URL(m.url).hostname)
        } catch {
            return false
        }
    }

    // Учитывает не только серверный план аккаунта, но и локальный
    // 14-дневный триал для пользователей без аккаунта (онбординг →
    // «Пропустить» → api-device-trial-redeem, см. renderer/onboarding-auth.js).
    // Пока триал не истёк, устройство считается Pro независимо от того,
    // вошёл ли пользователь в аккаунт.
    // FEATURE (2026-09-10, "свяжи Pro-доступ с оплаченным местом в команде.
    // И бесплатно никому не даём" — live product decision): mirrors the
    // identical third OR branch just added to isEffectivePro() in
    // main/services/entitlement.js — orgSummary.orgProSeat is computed
    // server-side (never client-writable, arrives read-only inside the same
    // cloud.user object `plan` itself comes from) and grants Pro purely from
    // occupying one of the org's actually-PAID seats. The free base seats
    // intentionally grant nothing.
    function hasEffectivePro() {
        const user = cloudStore.getUser()
        const plan = (user?.plan || 'FREE').toUpperCase()
        if (plan !== 'FREE') return true

        const trialExpiresAt = store.get('localProTrialExpiresAt', null)
        if (trialExpiresAt && new Date(trialExpiresAt) > new Date()) return true

        if (user?.orgSummary?.orgProSeat === true) return true

        return false
    }

    // Плюсик в сайдбаре получает бейдж "PRO" и блокируется превентивно, как
    // только достигнут бесплатный лимит — раньше пользователь узнавал об
    // этом только после клика (реактивно), теперь видно сразу на кнопке.
    function updateAddButtonState() {
        const btn = document.getElementById('addMessengerBtn')
        if (!btn) return
        const atLimit = !hasEffectivePro() && state.activeMessengers.length >= FREE_MESSENGER_LIMIT
        btn.classList.toggle('add-btn-locked', atLimit)
    }

    // Компактная подпись подписки в нижнем статус-баре, справа от счётчика
    // непрочитанных: "с 19 авг — осталось 92 дн." + ссылка "Продлить".
    // Скрыта, если план FREE без активного локального триала (нечего
    // показывать).
    function updateTrialStatusBar() {
        const sep    = document.getElementById('statusSubSep')
        const item   = document.getElementById('statusSub')
        const text   = document.getElementById('statusSubText')
        const renew  = document.getElementById('statusSubRenew')
        if (!sep || !item || !text || !renew) return

        const user = cloudStore.getUser()
        const plan = (user?.plan || 'FREE').toUpperCase()

        const daysLeft = (expiresAt) => {
            const msLeft = new Date(expiresAt).getTime() - Date.now()
            if (!Number.isFinite(msLeft) || msLeft <= 0) return 0
            return Math.max(1, Math.ceil(msLeft / 86400000))
        }
        const fmtShortDate = (iso) => new Date(iso).toLocaleDateString(getCurrentLanguage() || 'ru', { day: 'numeric', month: 'short' })

        let info = null
        if (plan !== 'FREE') {
            const expiry = user?.planExpiresAt || null
            if (expiry) {
                const left = daysLeft(expiry)
                if (left > 0) {
                    const started = user?.planStartedAt || null
                    info = {
                        text: started
                            ? `${fmtShortDate(started)} — ${left} ${tGet('sidebar.daysShort') || 'дн.'}`
                            : `${left} ${tGet('sidebar.daysShort') || 'дн.'}`,
                        showRenew: true
                    }
                }
            }
        } else {
            const trialExpiresAt = store.get('localProTrialExpiresAt', null)
            if (trialExpiresAt) {
                const left = daysLeft(trialExpiresAt)
                if (left > 0) {
                    const started = new Date(trialExpiresAt)
                    started.setDate(started.getDate() - 14)
                    info = {
                        text: `${tGet('sidebar.trialDaysLeft') || 'Триал'}: ${fmtShortDate(started.toISOString())} — ${left} ${tGet('sidebar.daysShort') || 'дн.'}`,
                        showRenew: false
                    }
                }
            }
        }

        sep.style.display = info ? '' : 'none'
        item.style.display = info ? '' : 'none'
        if (!info) return

        text.textContent = info.text
        renew.style.display = info.showRenew ? '' : 'none'
    }

    document.getElementById('statusSubRenew')?.addEventListener('click', (e) => {
        e.preventDefault()
        window.electronAPI?.openExternal?.('https://centrio.me/dashboard')
    })

    // Возвращает true если план PRO/TEAM (или активен локальный триал),
    // иначе показывает модалку и возвращает false
    // featureKey: 'themes' | 'accent' | 'folders' | 'sound' | 'messengerLimit'
    function requirePro(featureKey) {
        if (hasEffectivePro()) return true
        showUpgradeModal(
            tGet(`pro.${featureKey}Title`),
            tGet(`pro.${featureKey}Desc`)
        )
        return false
    }

    // ==============================
    // РЕТРОАКТИВНАЯ БЛОКИРОВКА ЛИШНИХ МЕССЕНДЖЕРОВ (FREE-лимит)
    // ==============================
    // SECURITY / BUGFIX: addMessenger() above only blocks ADDING a new
    // messenger past FREE_MESSENGER_LIMIT. It does nothing about messengers
    // that were added while the account WAS Pro (or during an active local
    // trial) and are still sitting in state.activeMessengers/store after Pro
    // lapses — subscription expiry, cancellation, chargeback, or the local
    // 14-day trial simply running out. Without this, those extra messengers
    // stayed fully functional forever once added: the "3 messengers on FREE"
    // limit was only ever enforced going forward, never actually enforced
    // against existing state. This must be re-run every time entitlement
    // could have changed: on startup (loadData), after a post-login cloud
    // sync (cloudSyncAfterLogin), after removing a messenger (freeing up a
    // slot), after adding one, and on every periodic/focus PRO revalidation.
    //
    // Per explicit product decision: "просто первые 3" — no priority/sort
    // logic, just array order (same order already used by the sidebar and
    // tab bar). Whichever 3 happen to be first in state.activeMessengers
    // stay active; the rest lock. Deliberately NOT re-run on drag/reorder —
    // locks are only recomputed at the points above, keeping this simple.
    const lockedMessengerIds = new Set()

    function isMessengerLocked(id) {
        return lockedMessengerIds.has(id)
    }

    function reapplyMessengerLocks() {
        const pro = hasEffectivePro()
        const shouldBeLocked = new Set()
        if (!pro) {
            state.activeMessengers.forEach((m, i) => {
                // SECURITY: same lock (not delete) treatment as the free-plan
                // position cap — a custom (non-catalog) messenger added while
                // Pro must stop being usable the moment Pro lapses, exactly
                // like the count-based lock below, and unlock again the same
                // way if Pro is regained. See isCatalogMessenger() above.
                if (i >= FREE_MESSENGER_LIMIT || !isCatalogMessenger(m)) shouldBeLocked.add(m.id)
            })
        }

        let activeTabWasLocked = false

        // Unlock: Pro regained, or this messenger shifted back inside the
        // free limit after an earlier one was removed. Recreate its tab and
        // webview exactly as loadData()/addMessenger() do.
        Array.from(lockedMessengerIds).forEach(id => {
            if (shouldBeLocked.has(id)) return
            lockedMessengerIds.delete(id)
            document.getElementById(`sidebar-${id}`)?.classList.remove('messenger-item-locked')
            const messenger = state.activeMessengers.find(m => m.id === id)
            if (messenger && !document.getElementById(`tab-${id}`)) {
                addTab(messenger)
                addWebview(messenger)
            }
        })

        // Lock: newly over the limit. Detach tab + webview (mirrors
        // removeMessenger()'s DOM cleanup) but keep the sidebar icon and all
        // persisted state untouched — this is purely a visibility/access
        // lock, not a deletion.
        shouldBeLocked.forEach(id => {
            if (lockedMessengerIds.has(id)) return
            lockedMessengerIds.add(id)
            document.getElementById(`sidebar-${id}`)?.classList.add('messenger-item-locked')
            document.getElementById(`tab-${id}`)?.remove()
            document.getElementById(`webview-${id}`)?.remove()
            if (state.activeTabId === id) activeTabWasLocked = true
        })

        if (activeTabWasLocked) {
            const fallback = state.activeMessengers.find(m => !lockedMessengerIds.has(m.id))
            if (fallback) {
                switchTab(fallback.id)
            } else {
                state.activeTabId = null
                welcomeScreen.style.display = 'flex'
                tabsContent.style.pointerEvents = 'none'
            }
        }

        updateAddButtonState()
    }

    // ==============================
    // РЕТРОАКТИВНОЕ ОТКЛЮЧЕНИЕ PRO-РАСШИРЕНИЙ (extensionsState)
    // ==============================
    // SECURITY / BUGFIX: same disease as reapplyMessengerLocks() above, but
    // for the native extension toggles (adblock/screenshot/darkmode/split —
    // see NATIVE_EXTENSIONS in renderer/extensions-ui.js). Those toggles are
    // themselves Pro-gated in the UI (getUserIsPro() there) and now also
    // blocked from being forged `true` on the main-process store:set gate
    // (see main.js's extensionsState backstop), but neither of those stops a
    // flag that was legitimately switched on while the account WAS Pro from
    // silently staying `true` — and therefore functionally active — after Pro
    // lapses. Must be re-run at the same entitlement-change points as
    // reapplyMessengerLocks() (startup, post-login sync, and every
    // focus/periodic refreshUser() revalidation) — NOT on addMessenger/
    // removeMessenger, since those never change entitlement.
    const NATIVE_EXTENSION_IDS = ['adblock', 'screenshot', 'darkmode', 'split']

    function reapplyExtensionLocks() {
        if (hasEffectivePro()) return
        const extState = store.get('extensionsState', {}) || {}
        const toDisable = NATIVE_EXTENSION_IDS.filter(id => extState[id] === true)
        if (toDisable.length === 0) return

        const nextState = { ...extState }
        toDisable.forEach(id => { nextState[id] = false })
        store.set('extensionsState', nextState)

        // Mirror onExtensionToggle(id, false)'s side effects (see EXTENSIONS
        // API section below) since that handler only fires from the settings
        // toggle's own 'change' event, never from this out-of-band
        // revalidation path.
        if (toDisable.includes('screenshot')) {
            const btn = document.getElementById('screenshotBtn')
            if (btn) btn.style.display = 'none'
        }
        if (toDisable.includes('split')) {
            const btn = document.getElementById('splitBtn')
            if (btn) btn.style.display = 'none'
            if (state.splitMode) splitApi?.exitSplitMode?.()
        }
        if (toDisable.includes('adblock')) {
            // Main process re-derives isEnabled() straight from
            // extensionsState (see main/services/adblock.js) — this just
            // wakes it up immediately instead of waiting for the next
            // natural trigger.
            ipcRenderer.send('update-adblock-state')
        }
        if (toDisable.includes('darkmode')) {
            // The toggle only gated *turning on* new forced dark mode
            // (context-actions-bind.js's ctxDarkMode handler); any messenger
            // that already had it applied would otherwise keep rendering
            // inverted forever post-downgrade. Reload clears the injected
            // CSS the same way the manual "turn off" path does.
            state.activeMessengers.forEach(m => {
                if (!m.forceDarkMode) return
                m.forceDarkMode = false
                document.getElementById(`webview-${m.id}`)?.reload()
            })
            saveData()
        }
    }

    // ==============================
    // РЕТРОАКТИВНЫЙ СБРОС PRO-ТЕМЫ/АКЦЕНТА (settings.theme / settings.accentColor)
    // ==============================
    // SECURITY / BUGFIX: same disease as reapplyMessengerLocks()/
    // reapplyExtensionLocks() above. settings-bind.js's theme/accent click
    // handlers only gate *selecting* a Pro theme/accent (requirePro('themes')/
    // requirePro('accent')), and main.js's store:set backstop only strips a
    // forged value going forward. Neither undoes a theme/accent that was
    // legitimately chosen while Pro and is still sitting in the `settings`
    // store key after Pro lapses — settings-ui.js's applySettings()/
    // initSettings() would otherwise keep painting it on every load/apply
    // indefinitely. Must mirror main.js's own FREE_THEME/FREE_ACCENT defaults
    // exactly, or a downgraded user would get bounced between two different
    // "free" values depending on which layer last wrote the key.
    const FREE_THEME = 'embedded'
    const FREE_ACCENT = '#7b68ee'

    function reapplySettingsLocks() {
        if (hasEffectivePro()) return
        const settings = store.get('settings', {}) || {}
        const violatesTheme = !!settings.theme && settings.theme !== FREE_THEME
        const violatesAccent = !!settings.accentColor && settings.accentColor !== FREE_ACCENT
        if (!violatesTheme && !violatesAccent) return

        const corrected = { ...settings }
        if (violatesTheme) corrected.theme = FREE_THEME
        if (violatesAccent) corrected.accentColor = FREE_ACCENT
        store.set('settings', corrected)
        // Repaint immediately — applySettings is assigned by the time this can
        // actually run (only ever called from loadData()/cloudSyncAfterLogin()/
        // the refreshUser() revalidation callbacks, all of which fire well
        // after createSettingsUiApi() below has executed).
        if (typeof applySettings === 'function') applySettings(corrected)
    }

    // ==============================
    // РЕТРОАКТИВНОЕ РАСФОРМИРОВАНИЕ PRO-ПАПОК (state.folders)
    // ==============================
    // SECURITY / BUGFIX: same disease as reapplyMessengerLocks()/
    // reapplyExtensionLocks()/reapplySettingsLocks() above. Unlike those
    // features, folders aren't gated by a count/value check — creating ANY
    // folder at all requires Pro (context-actions-bind.js's ctxSidebarNewFolder
    // / ctxNewFolder handlers are the only two places that call
    // requirePro('folders')). edit-modal-bind.js's saveEditBtn handler, which
    // actually pushes into state.folders on `state.editMode === 'newFolder'`,
    // has no Pro check of its own — it trusts that editMode can only reach
    // 'newFolder' via one of the two gated entry points. That's fine going
    // forward (main.js's store:set backstop below closes the direct-IPC/
    // hand-edited-store-file bypass), but nothing previously undid folders
    // that already exist from a lapsed trial/subscription — they'd just keep
    // rendering and accepting new messengers forever. Reuse the exact same
    // teardown removeFolder() (folders-ui.js) already performs one folder at
    // a time — unfold every messenger back to root level, drop the folder's
    // DOM node — instead of duplicating that logic here.
    function reapplyFolderLocks() {
        if (hasEffectivePro()) return
        if (!state.folders || state.folders.length === 0) return

        // removeFolder() mutates state.folders (filters the removed id out)
        // and calls saveData() itself each time, so iterate over a snapshot
        // of the ids rather than the live array.
        const staleFolderIds = state.folders.map(f => f.id)
        staleFolderIds.forEach(id => {
            if (typeof removeFolder === 'function') removeFolder(id)
        })
    }

    // ==============================
    // РЕТРОАКТИВНЫЙ СБРОС PRO-ЗВУКОВ УВЕДОМЛЕНИЙ (messenger.notifSound)
    // ==============================
    // SECURITY / BUGFIX: same disease as the other reapply*Locks() functions
    // above. messenger-sound-ui.js's openMessengerSoundModal() gates *opening*
    // the per-messenger sound picker with requirePro('sound'), but
    // messenger-sound-bind.js's saveMessengerSoundBtn handler — which
    // actually writes messenger.notifSound — has no Pro check of its own; it
    // trusts the modal could only have been reached while Pro. Nothing
    // previously undid a custom sound left over once Pro lapses, so it would
    // keep playing indefinitely (sounds.js's playNotifSound() reads
    // messenger.notifSound unconditionally). '__default__' is the same
    // free-plan sentinel main.js's own store:set backstop resets to.
    function reapplySoundLocks() {
        if (hasEffectivePro()) return

        let changed = false
        state.activeMessengers.forEach(m => {
            if (m.notifSound && m.notifSound !== '__default__') {
                m.notifSound = '__default__'
                changed = true
            }
        })
        if (changed) saveData()
    }

    // ==============================
    // ДОБАВЛЕНИЕ МЕССЕНДЖЕРА
    // ==============================
    async function addMessenger(messenger) {
        // ── Plan limits ──────────────────────────────────────────
        if (!hasEffectivePro() && state.activeMessengers.length >= FREE_MESSENGER_LIMIT) {
            showUpgradeModal(
                tGet('pro.messengerLimitTitle'),
                tGet('pro.messengerLimitDesc').replace('{n}', FREE_MESSENGER_LIMIT)
            )
            return
        }
        // ─────────────────────────────────────────────────────────

        const id = Date.now().toString()
        const sameCount = state.activeMessengers.filter(m => m.name.startsWith(messenger.name)).length
        const name = sameCount > 0 ? `${messenger.name} ${sameCount + 1}` : messenger.name

        const newMessenger = {
            ...messenger,
            id,
            name,
            folderId: null,
            notifSound: '__default__',
            zoomLevel: state.tabZoomLevel || store.get('tabZoomLevel', 1) || 1
        }

        state.activeMessengers.push(newMessenger)
        addToSidebar(newMessenger)
        addTab(newMessenger)

        // RACE FIX (see CHANGELOG 1.8.7): persist to the main-process store
        // and WAIT for it before creating the <webview> for this messenger.
        // main/bootstrap/registerAppEvents.js's will-attach-webview handler
        // validates the guest's partition against store.get('messengers') in
        // the MAIN process. addWebview() below appends a <webview> element,
        // which triggers Electron's native attach-guest-view request almost
        // immediately — if that request reaches main before this messenger's
        // id has actually been written to the main-process store (saveData()
        // persists via async IPC), the security check fails closed and the
        // tab is left permanently blank with no error visible to the user.
        // Awaiting saveData() here guarantees main's store is authoritative
        // before the webview ever asks to attach.
        await saveData()

        addWebview(newMessenger)
        switchTab(id)

        // VPN LEAK FIX: a brand-new partition (persist:${id}) has never had
        // session.setProxy() called on it, so by default it falls back to
        // the OS system proxy — i.e. this messenger would silently bypass
        // an already-active VPN entirely (not just WebRTC — ALL of its
        // traffic), even though its sidebar badge would show the VPN as on
        // for every other tab. main/ipc/vpn.js's 'vpn-set-app-vpn' handler
        // already does exactly what's needed here: records the per-app mode
        // (default is enabled, matching getAppModes()'s `!== false` check
        // elsewhere) and — critically — applies the real proxy immediately
        // if VPN is currently connected. When VPN isn't active this is a
        // harmless no-op that just persists the default mode.
        invokeIpc('vpn-set-app-vpn', id, true).catch(() => {})

        welcomeScreen.style.display = 'none'
        tabsContent.style.pointerEvents = 'auto'
        state.rawUnreadCounts[id] = 0
        state.unreadCounts[id] = 0
        resetMessengerNotifyState(id, 0)

        updateStatusBar()
        updateAddButtonState()
        updateTrialStatusBar()
        reapplyMessengerLocks()
    }

    // FEATURE (2026-09-10, TEAM owner-control epic — "владелец распределяет
    // мессенджеры по сотрудникам"): mirrors addMessenger() above but is
    // meant to be called repeatedly from a background poll
    // (renderer/org-team.js), so — unlike addMessenger — it must be
    // idempotent (skip if this assignment is already injected), must NOT
    // steal focus (no unconditional switchTab), must NOT count against
    // FREE_MESSENGER_LIMIT (it's the owner's grant, not the employee's own
    // messenger), and must NOT reset an unread count already being tracked.
    // `messenger.id` is caller-supplied and stable (the assignment's own id,
    // prefixed) precisely so repeated polls recognize an already-injected
    // slot instead of duplicating it.
    async function addOrgAssignedMessenger(messenger) {
        if (state.activeMessengers.some(m => m.id === messenger.id)) return

        const newMessenger = {
            ...messenger,
            orgAssigned: true,
            folderId: null,
            notifSound: '__default__',
            zoomLevel: state.tabZoomLevel || store.get('tabZoomLevel', 1) || 1
        }

        state.activeMessengers.push(newMessenger)
        addToSidebar(newMessenger)
        addTab(newMessenger)
        addWebview(newMessenger)
        invokeIpc('vpn-set-app-vpn', newMessenger.id, true).catch(() => {})

        if (state.unreadCounts[newMessenger.id] === undefined) {
            state.rawUnreadCounts[newMessenger.id] = 0
            state.unreadCounts[newMessenger.id] = 0
            resetMessengerNotifyState(newMessenger.id, 0)
        }

        if (!state.activeTabId) {
            welcomeScreen.style.display = 'none'
            switchTab(newMessenger.id)
        }
        tabsContent.style.pointerEvents = 'auto'

        updateStatusBar()
    }

    // Counterpart cleanup for a slot the owner has since unassigned. Unlike
    // removeMessenger() above (built for a deliberate single manual click,
    // which always jumps focus to the last remaining tab), this only moves
    // focus if the removed tab was the one actually active — a background
    // poll silently yanking the user to a random other tab every few
    // minutes would be far more disruptive than leaving a closed tab alone.
    function removeOrgAssignedMessenger(id) {
        const wasActive = state.activeTabId === id

        state.activeMessengers = state.activeMessengers.filter(m => m.id !== id)
        delete state.unreadCounts[id]
        delete state.rawUnreadCounts[id]
        delete state.messengerNotifyState[id]
        delete state.siteNotificationState[id]
        state.webviewWatchBound.delete(`webview-${id}`)

        document.getElementById(`sidebar-${id}`)?.remove()
        document.getElementById(`tab-${id}`)?.remove()
        document.getElementById(`webview-${id}`)?.remove()

        mediaPlayerUiApi?.onMessengerRemoved(id)
        splitApi?.onMessengerRemoved(id)

        if (wasActive) {
            if (state.activeMessengers.length > 0) {
                switchTab(state.activeMessengers[0].id)
            } else {
                welcomeScreen.style.display = 'flex'
                state.activeTabId = null
            }
        }

        tabsContent.style.pointerEvents = state.activeMessengers.length > 0 ? 'auto' : 'none'
        updateStatusBar()
    }

    // ==============================
    // ИЗМЕНЕНИЕ APP ZOOM
    // ==============================
    function applyAppZoom(level) {
        state.appZoomLevel = Math.max(-3, Math.min(3, level))
        store.set('appZoomLevel', state.appZoomLevel)

        if (window.electronAPI?.setAppZoom) {
            window.electronAPI.setAppZoom(state.appZoomLevel)
        } else {
            ipcRenderer.send('set-app-zoom', state.appZoomLevel)
        }

        updateZoomStatus()
    }

    // ==============================
    // COLLAPSE/EXPAND MENU
    // ==============================
    function applyMenuCollapsed() {
        titlebarMenu.classList.toggle('collapsed', state.menuCollapsed)
        menuToggleBtn.classList.toggle('collapsed', state.menuCollapsed)

        menuToggleIcon.innerHTML = state.menuCollapsed
            ? '<path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
            : '<path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    }

    // Раскрываемый левый сайдбар (как во FRANZ) — независимо от меню сверху.
    function applySidebarCollapsed() {
        if (!activityBar || !sidebarCollapseBtn) return
        activityBar.classList.toggle('sidebar-expanded', state.sidebarBarExpanded)
        sidebarCollapseBtn.classList.toggle('sidebar-expanded-btn', state.sidebarBarExpanded)
        const label = state.sidebarBarExpanded ? tGet('sidebar.collapse') : tGet('sidebar.expand')
        sidebarCollapseBtn.setAttribute('aria-label', label)
        sidebarCollapseBtn.setAttribute('title', label)
        const labelEl = document.getElementById('sidebarCollapseLabel')
        if (labelEl) labelEl.textContent = label
    }

    sidebarCollapseBtn?.addEventListener('click', () => {
        state.sidebarBarExpanded = !state.sidebarBarExpanded
        store.set('sidebarBarExpanded', state.sidebarBarExpanded)
        applySidebarCollapsed()
    })

    // ==============================
    // SIDEBAR DRAG-N-DROP API
    // ==============================

    const sidebarDndApi = createSidebarDndApi({
        state,
        store,
        messengerList,
        moveMessengerToFolder,
        cloudSyncPush,
        isCloudLoggedIn: () => cloudStore.isLoggedIn()
    })

    const {
        initDrag,
        initDropTarget,
        initRootDropZone,
        loadOrder,
        saveOrder
    } = sidebarDndApi

    // ==============================
    // PROXY API
    // ==============================
    let openSettingsRef = null

    const proxyApi = createProxyApi({
        store,
        invokeIpc,
        tGet,
        openSettings: () => {
            if (typeof openSettingsRef === 'function') openSettingsRef()
        }
    })

    const {
        initProxySection,
        updateGlobalProxyBtn,
        bind: bindProxy,
        applySavedProxyOnStart,
        openProxyModal
    } = proxyApi

    // ==============================
    // SETTINGS UI API
    // ==============================
    const settingsUiApi = createSettingsUiApi({
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
    })

    const {
        applyTheme,
        applySettings,
        collectSettings,
        openSettings,
        initSettings
    } = settingsUiApi

    openSettingsRef = openSettings

    // ==============================
    // EXTENSIONS API
    // ==============================
    // notesUiApiRef заполняется ниже, когда вызывается bindNotesUi() — сам
    // onExtensionToggle определён раньше этой точки, поэтому используем
    // отложенную ссылку вместо прямого замыкания на notesUiApi.
    let notesUiApiRef = null

    function onExtensionToggle(extId, isEnabled) {
        if (extId === 'notes') {
            notesUiApiRef?.updateButtonVisibility()
        }
        if (extId === 'screenshot') {
            const btn = document.getElementById('screenshotBtn')
            if (btn) btn.style.display = isEnabled ? 'flex' : 'none'
        }
        if (extId === 'adblock') {
            ipcRenderer.send('update-adblock-state') // If we have a dedicated IPC
            // or just rely on store change if the main process watches it
        }
        if (extId === 'split') {
            const btn = document.getElementById('splitBtn')
            if (btn) btn.style.display = isEnabled ? 'flex' : 'none'
            if (!isEnabled && state.splitMode) splitApi?.exitSplitMode?.()
        }
        // Force refresh context menus if needed
    }

    // BUGFIX (2026-09-09, "PRO поставил ручками, а плагины/нейросеть/заметки
    // не открываются" — live user report): same revalidation the
    // startup/focus/30-min handlers below already do (updateCloudBtn +
    // updateAddButtonState + reapply*Locks + notesUiApiRef), triggered
    // specifically when the Extensions tab opens — see
    // extensions-ui.js openExtensionsSection for why that's the right
    // moment. notesUiApiRef is assigned later in this file but this
    // function isn't invoked until the user actually opens the tab, so the
    // closure sees the real value by then.
    function refreshUserAndReapply() {
        return cloudApi.refreshUser().then(() => {
            if (typeof updateCloudBtn === 'function') updateCloudBtn()
            updateAddButtonState()
            updateTrialStatusBar()
            reapplyMessengerLocks()
            reapplyExtensionLocks()
            reapplySettingsLocks()
            reapplyFolderLocks()
            reapplySoundLocks()
            notesUiApiRef?.invalidate()
            notesUiApiRef?.updateButtonVisibility()
        })
    }

    const extensionsUiApi = createExtensionsUiApi({
        store,
        tGet,
        requirePro,
        onExtensionToggle,
        refreshUser: refreshUserAndReapply
    })

    const { openExtensionsSection } = extensionsUiApi

    // Screenshot button action
    document.getElementById('screenshotBtn')?.addEventListener('click', async () => {
        const result = await invokeIpc('screenshot:capture', state.activeTabId)
        console.log('[screenshot] Capture result:', result)
    })

    // Initial screenshot button state
    const initialExtState = store.get('extensionsState', {})
    if (initialExtState.screenshot === true) {
        const btn = document.getElementById('screenshotBtn')
        if (btn) btn.style.display = 'flex'
    }

    // Initial split button state — без этого кнопка остаётся скрытой (display:none
    // из index.html) после каждого перезапуска, даже если сплит включён в настройках:
    // onExtensionToggle('split', ...) вызывается только из обработчика change тумблера,
    // а не при старте приложения.
    if (initialExtState.split === true) {
        const btn = document.getElementById('splitBtn')
        if (btn) btn.style.display = 'flex'
    }

    // ==============================
    // CHANGE ICON UI API
    // ==============================
    const changeIconUiApi = createChangeIconUiApi({
        state,
        applyI18n
    })

    const {
        openChangeIconModal,
        updateChangeIconPreview,
        readIconFile
    } = changeIconUiApi

    // ==============================
    // MESSENGER SOUND UI API
    // ==============================
    const messengerSoundUiApi = createMessengerSoundUiApi({ requirePro })
    const { openMessengerSoundModal } = messengerSoundUiApi

    // ==============================
    // ЗАГРУЗКА ДАННЫХ
    // ==============================

    // BUGFIX ("на 91% долго стоит, как будто зависла"): cloudSyncPull() ниже
    // может ждать до 30с (15с таймаут запроса + 1 ретрай в api.js) на плохой
    // сети, и до этого момента loadData() ничего не рендерит — прогресс-бар
    // застревает на fake-creep потолке 91%. Стартовый пул не обязан ждать
    // полный сетевой таймаут: если он не успел за BOOT_CLOUD_PULL_TIMEOUT_MS,
    // грузимся с локальными данными (они и так самые свежие, что видело это
    // устройство) — сам запрос не отменяется и тихо доедает в фоне, но его
    // результат для загрузки уже не нужен.
    const BOOT_CLOUD_PULL_TIMEOUT_MS = 6000

    function raceWithTimeout(promise, ms, fallback) {
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(fallback), ms)
            promise.then(
                (value) => { clearTimeout(timer); resolve(value) },
                () => { clearTimeout(timer); resolve(fallback) }
            )
        })
    }

    async function loadData() {
        const postLoginReload = sessionStorage.getItem('_centrio_post_login_reload')
        if (postLoginReload) {
            sessionStorage.removeItem('_centrio_post_login_reload')
            // Данные уже записаны в store до перезагрузки — пропускаем cloud pull
        } else if (cloudStore.isLoggedIn()) {
            // Пишем данные, только что стянутые ИЗ облака — не планировать
            // автопуш этих же данных обратно (см. notifySyncedStoreWrite).
            suppressAutoCloudSync = true
            try {
                const cloudData = await raceWithTimeout(cloudSyncPull(), BOOT_CLOUD_PULL_TIMEOUT_MS, null)

                if (cloudData?.messengers?.length > 0) {
                    store.set('messengers', cloudData.messengers.map(m => ({
                        id: m.id,
                        name: m.name,
                        url: m.url,
                        icon: m.icon || null,
                        color: m.color || null,
                        folderId: m.folderId || null,
                        notifSound: m.notifSound || '__default__',
                        zoomLevel: typeof m.zoomLevel === 'number' ? m.zoomLevel : 1
                    })))

                    store.set('folders', cloudData.folders || [])

                    if (cloudData.settings) {
                        const currentSettings = store.get('settings', {}) || {}
                        const { extra, ...baseSettings } = cloudData.settings
                        // Language is device-local — never let cloud overwrite it
                        const merged = { ...currentSettings, ...baseSettings }
                        if (currentSettings.language) merged.language = currentSettings.language
                        store.set('settings', merged)
                        // Restore extra settings (PIN, zoom, last active tab)
                        if (extra) {
                            // Блокировка: пишем в 'security' (именно там читает lock.js),
                            // а не в мёртвые верхнеуровневые ключи pinEnabled/pinHash
                            if (extra.pinEnabled !== undefined || extra.pinHash !== undefined || extra.lockOnHide !== undefined) {
                                const sec = store.get('security', {})
                                store.set('security', {
                                    ...sec,
                                    enabled:    extra.pinEnabled  !== undefined ? extra.pinEnabled  : sec.enabled,
                                    hash:       extra.pinHash     !== undefined ? extra.pinHash     : sec.hash,
                                    lockOnHide: extra.lockOnHide  !== undefined ? extra.lockOnHide   : sec.lockOnHide
                                })
                            }
                            if (extra.lockOnStartup !== undefined) store.set('lockOnStartup', extra.lockOnStartup)
                            if (extra.tabZoomLevel !== undefined) {
                                const s = store.get('settings', {}) || {}
                                store.set('settings', { ...s, tabZoomLevel: extra.tabZoomLevel })
                            }
                            if (extra.globalProxy !== undefined) {
                                const curProxy = store.get('globalProxy', {}) || {}
                                store.set('globalProxy', { ...curProxy, ...extra.globalProxy })
                            }
                            if (extra.sidebarOrder !== undefined) store.set('sidebarOrder', extra.sidebarOrder)
                            if (extra.menuCollapsed !== undefined) store.set('menuCollapsed', extra.menuCollapsed)
                            if (extra.appZoomLevel !== undefined) store.set('appZoomLevel', extra.appZoomLevel)
                            if (extra.vpnAppModes !== undefined) store.set('vpnAppModes', extra.vpnAppModes)
                            if (extra.extensionsState !== undefined) store.set('extensionsState', extra.extensionsState)
                            if (extra.splitLeftPctPref !== undefined) store.set('splitLeftPctPref', extra.splitLeftPctPref)
                            if (extra.splitPresets !== undefined) store.set('splitPresets', extra.splitPresets)
                            // BUGFIX ("не сохраняется выбранный мессенджер"): restore
                            // last-active tab from cloud too, mirroring every other
                            // extra.* field here — see switchTab()/loadData() above.
                            if (extra.activeTabId !== undefined) store.set('activeTabId', extra.activeTabId)
                        }
                    }

                    const muted = {}
                    cloudData.messengers.forEach(m => {
                        if (m.isMuted) muted[m.id] = true
                    })
                    store.set('mutedMessengers', muted)
                }
            } catch (error) {
                console.error('Cloud load error:', error)
            } finally {
                suppressAutoCloudSync = false
            }
        }

        const savedMessengers = await store.getAsync('messengers', [])
        const savedFolders = await store.getAsync('folders', [])
        const savedDividers = await store.getAsync('dividers', [])
        state.mutedMessengers = await store.getAsync('mutedMessengers', {})
        state.globalMuteAll = await store.getAsync('globalMuteAll', false)
        state.folders = savedFolders || []
        state.dividers = savedDividers || []

        updateMuteAllBtn()

        if (savedMessengers.length === 0 && savedFolders.length === 0) {
            welcomeScreen.style.display = 'flex'
            tabsContent.style.pointerEvents = 'none'
            updateStatusBar()
            return
        }

        welcomeScreen.style.display = 'none'
        tabsContent.style.pointerEvents = 'auto'

        state.folders.forEach(renderFolder)
        state.dividers.forEach(renderDivider)

        const settings = await store.getAsync('settings', {})
        const foldersEnabled = settings?.foldersEnabled !== false
        if (!foldersEnabled) setTimeout(() => applyFoldersEnabled(false), 100)

        // Pre-load extensions into ALL sessions BEFORE webviews load URLs
        // This ensures content scripts inject properly on first navigation
        try {
            await Promise.all(
                savedMessengers.map(m =>
                    invokeIpc('ext:apply-to-session', `persist:${m.id}`).catch(() => {})
                )
            )
        } catch {}

        savedMessengers.forEach(messenger => {
            const normalizedMessenger = {
                ...messenger,
                zoomLevel: typeof messenger.zoomLevel === 'number'
                    ? messenger.zoomLevel
                    : (store.get('tabZoomLevel', 1) || 1),
                forceDarkMode: messenger.forceDarkMode || false
            }

            state.activeMessengers.push(normalizedMessenger)

            if (normalizedMessenger.folderId) addToFolder(normalizedMessenger, normalizedMessenger.folderId)
            else addToSidebar(normalizedMessenger)

            addTab(normalizedMessenger)
            addWebview(normalizedMessenger)
        })

        if (savedMessengers.length > 0) {
            // BUGFIX ("не сохраняется выбранный мессенджер"): settings.extra.activeTabId
            // was never actually written locally by anyone (see switchTab() above) —
            // read the dedicated top-level key it now persists to instead.
            const lastActiveId = await store.getAsync('activeTabId', null)
            const tabToOpen = lastActiveId && savedMessengers.find(m => m.id === lastActiveId)
                ? lastActiveId
                : savedMessengers[0].id
            switchTab(tabToOpen)
        }

        loadOrder()
        initRootDropZone()
        webviewTabsApi.loadTabOrder()

        state.activeMessengers.forEach(m => {
            state.rawUnreadCounts[m.id] = 0
            state.unreadCounts[m.id] = 0
            resetMessengerNotifyState(m.id, 0)
        })

        // BUGFIX ("бейджи пропали из сайдбара, но в трее/таскбаре число
        // верное"): main-процесс начинает опрашивать каждый webview на
        // dom-ready и шлёт первый результат почти сразу — если это случится
        // ДО того, как этот код дойдёт до сброса выше (или до того, как
        // #sidebar-<id> вообще смонтирован), первый реальный счётчик либо
        // затирается сбросом в 0 сразу после, либо просто не находит DOM-
        // элемент и молча пропадает — а поскольку main не переотправляет
        // НЕИЗМЕНИВШЕЕСЯ значение повторно, бейдж в сайдбаре так и остаётся
        // пустым навсегда, хотя state.rawUnreadCounts (и потому бейдж
        // таскбара/трея, использующий те же данные) внутри всё ещё
        // правильный. Перерисовываем ещё раз спустя паузу, когда сайдбар
        // точно смонтирован и опрос точно успел хотя бы раз отработать.
        //
        // BUGFIX #2 ("иногда всё равно не отрисовывает"): a single fixed
        // 3s shot still loses the race on a slow machine / many webviews /
        // slow network — the first real dom-ready poll can land well after
        // 3s. Repaint is idempotent and cheap (skips messengers with no
        // tracked unread count), so retry a few times at increasing delays
        // instead of gambling on one fixed timeout.
        [3000, 6000, 10000].forEach(delay => setTimeout(repaintAllUnreadBadges, delay))

        // SECURITY / BUGFIX (retroactive FREE-limit enforcement): re-derive
        // locks against whatever entitlement state was cached at last
        // refreshUser() — the revalidation calls below will correct this
        // shortly after if the cached plan turns out to be stale.
        reapplyMessengerLocks()
        reapplyExtensionLocks()
        reapplySettingsLocks()
        reapplyFolderLocks()

        reapplySoundLocks()

        updateStatusBar()
        // Тур — только для новых пользователей (см. ветку выше с пустым
        // welcomeScreen). Раньше он запускался и здесь, безусловно, при
        // каждом старте с уже настроенными мессенджерами — из-за этого все
        // существующие пользователи (у которых settings.onboardingSeen ещё
        // не было выставлено до этого релиза) видели тур поверх, а если
        // приложение стартовало заблокированным — тур перекрывал экран PIN
        // и блокировал вход целиком.
    }

    // ==============================
    // ПРИВЯЗКА UI / EVENTS
    // ==============================
    downloadsApi.bind()
    bindProxy()
    searchUiApi.bind()
    onboardingTourApi.bind()
    bindWebviewContextMenuActions()

    const { openAssistantSection } = bindAssistantSettingsUi({
        store,
        invokeIpc,
        tGet,
        requirePro,
        hasEffectivePro,
        refreshUser: refreshUserAndReapply
    })

    bindSettingsUi({
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
        replayOnboardingTour: () => onboardingTourApi.start(true)
    })

    bindLockUi({
        state,
        store,
        isPasswordEnabled,
        showLockScreen,
        updateLockDots,
        tryUnlock,
        showForgotPinConfirm,
        handlePinInput,
        setActivePinBlock,
        savePinClick,
        resetPinSetup,
        updateSetPinDots,
        updateDisableDots,
        tryDisablePin,
        closePinDisableModal
    })

    bindChangeIconUi({
        state,
        saveData,
        hideAllMenus,
        openChangeIconModal,
        updateChangeIconPreview,
        readIconFile,
        getMessengerById: (id) => state.activeMessengers.find(m => m.id === id)
    })

    bindMessengerSoundUi({
        state,
        saveData,
        hideAllMenus,
        previewMessengerSound,
        openMessengerSoundModal,
        getMessengerById: (id) => state.activeMessengers.find(m => m.id === id)
    })

    bindCloudUi({
        cloudStore,
        cloudApi,
        cloudSyncPush,
        cloudSyncAfterLogin,
        tGet,
        openCloudLogin,
        openCloudProfile,
        updateAvatarInModal,
        renderLocalStats,
        openUrl: (url) => window.electronAPI?.openExternal?.(url)
    })

    bindOnboardingScreen({
        store,
        cloudApi,
        cloudStore,
        cloudSyncAfterLogin,
        cloudSyncPush,
        tGet,
        getCurrentLanguage,
        setCurrentLanguage,
        applyI18n,
        popularMessengers,
        addMessenger,
        updateTrialStatusBar
    })

    updateAddButtonState()
    updateTrialStatusBar()

    // Кнопка "Войти в аккаунт" на приветственном экране
    document.getElementById('welcomeLoginBtn')?.addEventListener('click', () => {
        if (cloudStore.isLoggedIn()) openCloudProfile()
        else openCloudLogin()
    })

    bindMenuUi({
        state,
        store,
        ipcRenderer,
        menuToggleBtn,
        applyMenuCollapsed,
        applyAppZoom,
        applyTabZoom,
        openSettings
    })

    bindWindowUi({
        store,
        state,
        ipcRenderer,
        switchTab,
        showLockScreen,
        openSettings,
        exitSplitMode: () => splitApi?.exitSplitMode?.()
    })

    bindAppEvents({
        state,
        quickSearch,
        findBar,
        closeQuickSearch,
        openQuickSearch,
        closeFindBar,
        openFindBar,
        switchTab,
        applyAppZoom,
        applyTabZoom,
        openSettings
    })

    bindEditModalUi({
        state,
        editModal,
        folderIcons,
        saveData,
        moveMessengerToFolder,
        renderFolder,
        addToSidebar,
        getFolderById: (id) => state.folders.find(f => f.id === id),
        getMessengerById: (id) => state.activeMessengers.find(m => m.id === id)
    })

    bindAddModalUi({
        state,
        PAGE_SIZE,
        popularMessengers,
        addModal,
        closeModal,
        openModal,
        fillMessengerGrid,
        updateScrollProgress,
        addMessenger,
        requirePro,
        tGet,
        freeMessengerLimit: FREE_MESSENGER_LIMIT
    })

    // enabled — предпочтение пользователя ("использовать VPN для этого мессенджера"),
    // не факт реального подключения. Реально показываем щит только если VPN ещё и подключён
    // (state.vpnActive), иначе бейдж вводит в заблуждение ("защищено", хотя туннель не поднят).
    function updateVpnBadge(messengerId, enabled) {
        const item = document.getElementById(`sidebar-${messengerId}`)
        if (!item) return
        const wrap = item.querySelector('.messenger-icon-wrap')
        if (!wrap) return
        const existing = wrap.querySelector('.vpn-badge')
        const show = !!enabled && !!state.vpnActive
        if (show && !existing) {
            const badge = document.createElement('span')
            badge.className = 'vpn-badge'
            badge.title = 'VPN включён'
            badge.textContent = '🛡'
            wrap.appendChild(badge)
        } else if (!show && existing) {
            existing.remove()
        }
    }

    // Перерисовать бейджи VPN у всех мессенджеров сайдбара — вызывается при каждом
    // изменении реального статуса VPN (подключение/отключение), см. bindVpnUi(onVpnStatusChange).
    async function refreshAllVpnBadges (vpnActive) {
        state.vpnActive = !!vpnActive
        const modesResult = await invokeIpc('vpn-get-app-modes').catch(() => ({ modes: {} }))
        const modes = modesResult?.modes || {}
        state.activeMessengers.forEach(m => {
            updateVpnBadge(m.id, modes[m.id] !== false)
        })
    }

    // VPN toggle для конкретного мессенджера из контекстного меню
    async function toggleMessengerVpn (messengerId) {
        const modesResult = await invokeIpc('vpn-get-app-modes').catch(() => ({ modes: {} }))
        const modes = modesResult?.modes || {}
        const current = modes[messengerId] !== false
        const newEnabled = !current
        await invokeIpc('vpn-set-app-vpn', messengerId, newEnabled).catch(() => null)
        updateVpnBadge(messengerId, newEnabled)
        // BUGFIX ("статус VPN сбрасывался после выхода/входа", round 2): the
        // previous fix here pushed to the cloud right after the toggle, but
        // getSyncPayload() reads vpnAppModes via the renderer's store SHIM
        // (store.get → in-memory storeCache, populated once by hydrate() at
        // startup) — not from disk. vpn-set-app-vpn above writes straight to
        // the MAIN-process store on its own dedicated IPC channel and never
        // touches storeCache, so the push below was still reading the STALE
        // pre-toggle snapshot and re-uploading it to the cloud, unchanged.
        // The very next launch's cloudSyncPull() then pulled that stale
        // (un-toggled) copy back down and overwrote the correct on-disk
        // value — exactly the "выключил ВПН, перезашёл — снова включён"
        // report. Re-fetch the authoritative modes map from main and mirror
        // it into the shim's cache before pushing, so the cloud copy (and
        // the local disk write store.set() also performs) actually reflect
        // this toggle.
        const freshModes = await invokeIpc('vpn-get-app-modes').catch(() => null)
        if (freshModes?.modes) store.set('vpnAppModes', freshModes.modes)
        if (cloudStore.isLoggedIn()) cloudSyncPush()
    }

    // При открытии контекстного меню обновляем label VPN-пункта
    document.addEventListener('contextmenu-opened', async () => {
        const id = state.contextTargetId
        if (!id) return
        const modesResult = await invokeIpc('vpn-get-app-modes').catch(() => ({ modes: {} }))
        const modes = modesResult?.modes || {}
        const enabled = modes[id] !== false
        const label = document.getElementById('ctxVpnLabel')
        if (label) label.textContent = tGet('network.vpnCtx')
        // Ползунок показывает, использует ли мессенджер VPN
        const vpnToggle = document.getElementById('ctxVpnToggle')
        if (vpnToggle) vpnToggle.classList.toggle('on', enabled)

        const m = state.activeMessengers.find(x => x.id === id)
        const dmLabel = document.getElementById('ctxDarkModeLabel')
        const dmItem = document.getElementById('ctxDarkMode')
        const extState = store.get('extensionsState', {})

        if (dmItem) {
            dmItem.style.display = extState.darkmode !== false ? 'flex' : 'none'
        }
        if (dmLabel) {
            dmLabel.textContent = m?.forceDarkMode ? 'Отключить тёмную тему' : 'Тёмная тема'
        }
    })

    bindContextActionsUi({
        state,
        folderIcons,
        saveData,
        hideAllMenus,
        openEditModal: () => {
            editModal.classList.add('show')
            const iconPickerWrap = document.getElementById('iconPickerWrap')
            const iconPicker = document.getElementById('iconPicker')
            const isFolder = state.editMode === 'folder' || state.editMode === 'newFolder'
            if (iconPickerWrap) iconPickerWrap.style.display = isFolder ? 'block' : 'none'
            if (isFolder && iconPicker && !iconPicker.dataset.inited) {
                iconPicker.dataset.inited = '1'
                iconPicker.innerHTML = ''
                Object.entries(folderIcons).forEach(([key, svg]) => {
                    const item = document.createElement('div')
                    item.className = 'icon-picker-item'
                    item.dataset.icon = key
                    item.innerHTML = svg
                    item.addEventListener('click', () => {
                        iconPicker.querySelectorAll('.icon-picker-item').forEach(el => el.classList.remove('selected'))
                        item.classList.add('selected')
                        state.selectedFolderIcon = key
                    })
                    iconPicker.appendChild(item)
                })
            }
            if (isFolder && iconPicker) {
                iconPicker.querySelectorAll('.icon-picker-item').forEach(el => {
                    el.classList.toggle('selected', el.dataset.icon === (state.selectedFolderIcon || 'folder'))
                })
            }
        },
        toggleMessengerVpn,
        removeMessenger,
        moveMessengerToFolder,
        removeFolder,
        addDivider,
        removeDivider,
        updateMuteIcon,
        getMessengerById: (id) => state.activeMessengers.find(m => m.id === id),
        getFolderById: (id) => state.folders.find(f => f.id === id),
        requirePro,
        tGet,
        ipcRenderer
    })

    bindPopupBackdrop({ contentArea })

    bindSidebarShellUi({
        state,
        hideAllMenus,
        closeFolderPanel,
        toggleMuteAll,
        updateUnreadCount,
        updateMuteIcon,
        getActiveMessengers: () => state.activeMessengers,
        getRawUnreadCount: (id) => state.rawUnreadCounts[id] || 0,
        sidebarContextMenu,
        tGet
    })

    // ==============================
    // ПРАВАЯ ВСТРОЕННАЯ ПАНЕЛЬ (Ассистент / Задачи / Уведомления)
    // ==============================
    // Раскрывается вбок вместе с сайдбаром (не всплывающее окно) — у каждой
    // кнопки правого сайдбара своя секция внутри #rightPanel, открыта не
    // больше одной за раз. openRightPanel/closeRightPanel передаются в
    // todos-bind.js и app-notif-bind.js вместо их прежней логики позиционирования
    // плавающего попапа.
    const rightPanelEl = document.getElementById('rightPanel')
    const rightPanelButtons = {
        assistant: document.getElementById('assistantBtn'),
        todos: document.getElementById('todosBtn'),
        notes: document.getElementById('notesBtn'),
        notifications: document.getElementById('appNotifBtn')
    }
    const rightPanelSections = {
        assistant: document.getElementById('assistantPanel'),
        todos: document.getElementById('todosPanel'),
        notes: document.getElementById('notesPanel'),
        notifications: document.getElementById('appNotifPanel')
    }
    let rightPanelActiveKey = null

    function closeRightPanel() {
        rightPanelActiveKey = null
        rightPanelEl?.classList.remove('open')
        Object.values(rightPanelSections).forEach(el => el?.classList.remove('active'))
        Object.values(rightPanelButtons).forEach(btn => btn?.classList.remove('active'))
    }

    function openRightPanel(key) {
        document.dispatchEvent(new CustomEvent('close-all-popups'))
        rightPanelActiveKey = key
        rightPanelEl?.classList.add('open')
        Object.entries(rightPanelSections).forEach(([k, el]) => el?.classList.toggle('active', k === key))
        Object.entries(rightPanelButtons).forEach(([k, btn]) => btn?.classList.toggle('active', k === key))
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function toggleRightPanel(key) {
        if (rightPanelActiveKey === key) closeRightPanel()
        else openRightPanel(key)
    }

    // Намеренно НЕ слушаем 'close-all-popups' здесь: это общее событие,
    // которым пользуется весь остальной интерфейс (контекстные меню,
    // сплит-пикеры, VPN-панель и т.д.) для закрытия СВОИХ всплывающих
    // окон при разных действиях — если бы правая панель тоже закрывалась
    // по нему, она бы схлопывалась от совершенно не связанных с ней
    // кликов где угодно в приложении. Закрытие правой панели — только
    // через повторный клик по той же иконке (toggleRightPanel выше).
    // Свой close-all-popups она по-прежнему ШЛЁТ при открытии (в
    // openRightPanel), чтобы закрыть чужие попапы — просто не подписана
    // на встречные.

    const appNotifApi = bindAppNotifUi({
        cloudStore,
        invokeIpc,
        ipcRenderer,
        authorizedInvoke,
        tGet,
        state,
        toggleMuteAll,
        switchTab,
        openRightPanel: () => toggleRightPanel('notifications'),
        closeRightPanel
    })
    if (appNotifApi?.addMessengerNotification) {
        addMessengerNotifRef = appNotifApi.addMessengerNotification
    }

    bindTodosUi({
        store,
        tGet,
        openRightPanel: () => toggleRightPanel('todos'),
        closeRightPanel
    })

    notesUiApiRef = bindNotesUi({
        store,
        tGet,
        authorizedInvoke,
        openRightPanel: () => toggleRightPanel('notes'),
        closeRightPanel,
        getUserIsPro: hasEffectivePro,
        requirePro
    })

    // Ассистент — реальный чат с tool-calling (см. .claude/plans/ai-assistant.plan.md).
    // assistant-tools.js собирает allowlist инструментов (переключение
    // вкладок/задачи/настройки — то, что знает только renderer), а
    // assistant-bind.js рисует чат и гоняет пинг-понг tool-call/tool-result
    // с main/ipc/assistant.js. Сам клик по кнопке #assistantBtn вешает
    // bindAssistantUi() изнутри себя (см. её btn.addEventListener) — здесь
    // отдельный обработчик больше не нужен, в отличие от прежней заглушки.
    const assistantToolsApi = bindAssistantTools({
        state,
        store,
        tGet,
        switchTab,
        openSettings,
        invokeIpc,
        authorizedInvoke,
        getRecentNotifications: appNotifApi?.getRecentNotifications,
        searchRecentNotifications: appNotifApi?.searchRecentNotifications,
        applySettings,
        mediaPlayerApi: mediaPlayerUiApi
    })

    bindAssistantUi({
        store,
        ipcRenderer,
        invokeIpc,
        tGet,
        toolsApi: assistantToolsApi,
        openRightPanel: () => toggleRightPanel('assistant'),
        hasEffectivePro
    })

    bindDownloadsUi({
        invokeIpc,
        ipcRenderer,
        tGet
    })

    bindVpnUi({ invokeIpc, tGet, state, ipcRenderer, onVpnStatusChange: refreshAllVpnBadges })

    // FEATURE (2026-09-10, TEAM owner-control epic) — background poll for
    // shared VPN / forced theme / assigned messengers / read-status stats.
    // tick() itself no-ops whenever the current user isn't an org member, so
    // it's safe to always start this regardless of login state.
    const orgTeamApi = createOrgTeamApi({
        authorizedInvoke,
        invokeIpc,
        cloudStore,
        state,
        applyTheme,
        addOrgAssignedMessenger,
        removeOrgAssignedMessenger,
        refreshAllVpnBadges
    })
    orgTeamApi.start()
    bindVpnSettings({
        invokeIpc,
        tGet,
        applyI18n,
        getActiveMessengers: () => state.activeMessengers,
        onAppVpnModeChange: async (messengerId, enabled) => {
            updateVpnBadge(messengerId, enabled)
            // Тот же паттерн, что и toggleMessengerVpn() выше — переключатель
            // VPN из Настроек → Сеть писал только в локальный (main-process)
            // store через отдельный IPC-канал vpn-set-app-vpn, никогда не
            // затрагивая рендерер-кэш store-шима (storeCache), из которого
            // getSyncPayload() читает vpnAppModes для облачного пуша. Пуш
            // ниже раньше молча отправлял в облако устаревший снимок без
            // этого переключения — следующий cloudSyncPull() при старте тихо
            // откатывал корректное локальное значение обратно. Подтягиваем
            // актуальную карту из main и зеркалим её в кэш шима перед пушем.
            const freshModes = await invokeIpc('vpn-get-app-modes').catch(() => null)
            if (freshModes?.modes) store.set('vpnAppModes', freshModes.modes)
            if (cloudStore.isLoggedIn()) cloudSyncPush()
        }
    })

    bindUpdater({
        ipcRenderer,
        invokeIpc,
        showUpdateBanner,
        tGet
    })

    await advanceStartup('bindings', 68, { minStepTime: 280 })

    // ==============================
    // ПЕРВИЧНЫЙ ЗАПУСК
    // ==============================
    applySavedProxyOnStart()
    applyMenuCollapsed()
    applySidebarCollapsed()

    if (state.appZoomLevel !== 0) {
        if (window.electronAPI?.setAppZoom) {
            window.electronAPI.setAppZoom(state.appZoomLevel)
        } else {
            ipcRenderer.send('set-app-zoom', state.appZoomLevel)
        }
    }

    setInterval(() => {
        if (cloudStore.isLoggedIn()) cloudSyncPush()
    }, 5 * 60 * 1000)

    // ── Periodic tracker heartbeat: flush current tab's time ──────
    setInterval(() => {
        if (_tkPrevId && _tkPrevName && _tkStart > 0) {
            const secs = Math.floor((Date.now() - _tkStart) / 1000)
            if (secs > 0) {
                invokeIpc('tracker:service-time', { service: _tkPrevName, serviceTime: secs })
                    .catch(() => {})
                _tkStart = Date.now() // reset so we don't double-count
            }
        }
    }, 5 * 60 * 1000)

    setInterval(updateStatusBar, 30000)
    window.addEventListener('online', updateStatusBar)
    window.addEventListener('offline', updateStatusBar)
      await advanceStartup('data', 82, { minStepTime: 300 })
    // Slow creep so bar doesn't freeze at 82% during cloud sync
    let _dataProgress = 82
    const _dataCreep = setInterval(() => {
        if (_dataProgress < 91) { _dataProgress += 0.4; setStartupProgress(_dataProgress) }
    }, 200)
    try {
        await loadData()
    } catch (err) {
        console.error(err)
    } finally {
        clearInterval(_dataCreep)
    }

    // ── Восстанавливаем сплит-режим если был открыт при закрытии ──
    const _savedSplit = store.get('split.saved', null)
    if (_savedSplit?.layout && _savedSplit.layout !== '2col' && state.activeMessengers.length >= 2) {
        if (splitApi.enterGridSplitMode(_savedSplit.layout)) {
            const zoneIds = Array.isArray(_savedSplit.zoneIds) ? _savedSplit.zoneIds : []
            zoneIds.forEach((zid, i) => {
                if (i === 0 || !zid) return
                if (state.activeMessengers.some(m => m.id === zid)) {
                    splitApi.switchGridZone(i, zid)
                }
            })
        }
    } else if (_savedSplit?.splitTabId && state.activeMessengers.length >= 2) {
        const _splitTarget = state.activeMessengers.find(m => m.id === _savedSplit.splitTabId)
        if (_splitTarget) {
            state.splitLeftPct = _savedSplit.splitLeftPct || 50
            if (splitApi.enterSplitMode()) {
                splitApi.switchSplitTab(_savedSplit.splitTabId)
            }
        }
    }

    // Обновляем уведомления после полной загрузки (на случай если при init токена ещё не было)
    if (cloudStore.isLoggedIn()) {
        appNotifApi?.fetchNotifications?.()

        // Подтягиваем актуальный план (plan/planExpiresAt) с сервера при старте —
        // до этого он читался только из локального кэша, обновляемого лишь при
        // логине/регистрации/OAuth или ручном открытии профиля (cloudBtn). Если
        // пользователь оплатил Pro на сайте, а приложение уже было запущено (или
        // было закрыто и открыто заново без повторного логина), Pro-статус в UI
        // мог оставаться устаревшим сколь угодно долго.
        cloudApi.refreshUser().then(() => { if (typeof updateCloudBtn === 'function') updateCloudBtn(); updateAddButtonState(); updateTrialStatusBar(); reapplyMessengerLocks(); reapplyExtensionLocks(); reapplySettingsLocks(); reapplyFolderLocks(); reapplySoundLocks(); notesUiApiRef?.invalidate(); notesUiApiRef?.updateButtonVisibility() })
    }

    // ...и повторяем при каждом возврате фокуса на окно — типичный сценарий:
    // пользователь нажал "Купить Pro", оплатил в открывшемся браузере, вернулся
    // в уже запущенное приложение (без перезапуска и без повторного логина).
    // Тот же паттерн already используется для уведомлений в app-notif-bind.js.
    window.addEventListener('focus', () => {
        if (cloudStore.isLoggedIn()) {
            cloudApi.refreshUser().then(() => { if (typeof updateCloudBtn === 'function') updateCloudBtn(); updateAddButtonState(); updateTrialStatusBar(); reapplyMessengerLocks(); reapplyExtensionLocks(); reapplySettingsLocks(); reapplyFolderLocks(); reapplySoundLocks(); notesUiApiRef?.invalidate(); notesUiApiRef?.updateButtonVisibility() })
        } else {
            // No account — still catch a local (no-login) trial expiring
            // while the app was open. hasEffectivePro() checks
            // localProTrialExpiresAt regardless of cloud login state, so
            // this needs no server round-trip.
            reapplyMessengerLocks()
            reapplyExtensionLocks()
            reapplySettingsLocks()
            reapplyFolderLocks()

            reapplySoundLocks()
        }
    })

    // SECURITY / BUGFIX (PRO-gating audit): the two refreshUser() calls above
    // only fire on startup and on window focus. An app left open and focused
    // for a long stretch (or simply never refocused) never re-validates the
    // cached plan against the server — if a subscription lapses (payment
    // failure on auto-renew, manual cancellation, chargeback) while the
    // window stays in front, the locally cached `plan: 'PRO'` from the last
    // successful refreshUser() would otherwise keep unlocking Pro features
    // indefinitely. Revalidate periodically regardless of focus so a lapsed
    // plan gets caught within a bounded window; harmless no-op while offline
    // (refreshUser() swallows network errors and just leaves the last-known
    // cache in place, same as before).
    const PRO_REVALIDATE_INTERVAL_MS = 30 * 60 * 1000
    setInterval(() => {
        if (cloudStore.isLoggedIn()) {
            cloudApi.refreshUser().then(() => { if (typeof updateCloudBtn === 'function') updateCloudBtn(); updateAddButtonState(); updateTrialStatusBar(); reapplyMessengerLocks(); reapplyExtensionLocks(); reapplySettingsLocks(); reapplyFolderLocks(); reapplySoundLocks(); notesUiApiRef?.invalidate(); notesUiApiRef?.updateButtonVisibility() })
        } else {
            // Same reasoning as the focus listener above: a local trial can
            // expire while the app sits open and unfocused too.
            reapplyMessengerLocks()
            reapplyExtensionLocks()
            reapplySettingsLocks()
            reapplyFolderLocks()

            reapplySoundLocks()
        }
    }, PRO_REVALIDATE_INTERVAL_MS)

    await advanceStartup('security', 94, { minStepTime: 260 })

    const appVersionText = document.getElementById('appVersionText')
    const statusVersionEl = document.getElementById('statusVersion')
    const checkUpdatesBtn = document.getElementById('checkUpdatesBtn')
    const updateStatusBadge = document.getElementById('updateStatusBadge')

    if (window.electronAPI?.getAppVersion) {
        try {
            const version = await window.electronAPI.getAppVersion()
            if (appVersionText) appVersionText.textContent = `v${version}`
            if (statusVersionEl) statusVersionEl.textContent = `v${version}`
        } catch (error) {
            console.error('Не удалось получить версию приложения:', error)
        }
    }

    // ── Попап-календарь при клике на дату в статусбаре ──────────────
    ;(function initCalendarPopup() {
        const dateBtn = document.getElementById('statusDate')
        const popup   = document.getElementById('calendarPopup')
        if (!dateBtn || !popup) return

        let calYear  = new Date().getFullYear()
        let calMonth = new Date().getMonth()

        const MONTH_NAMES = [
            'Январь','Февраль','Март','Апрель','Май','Июнь',
            'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
        ]

        function renderCalendar() {
            const label = document.getElementById('calMonthLabel')
            const grid  = document.getElementById('calGrid')
            if (!label || !grid) return

            label.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`
            grid.innerHTML = ''

            const today     = new Date()
            const firstDay  = new Date(calYear, calMonth, 1)
            // Monday-first: getDay() returns 0=Sun, shift so Mon=0
            let startOffset = (firstDay.getDay() + 6) % 7
            const daysInMonth   = new Date(calYear, calMonth + 1, 0).getDate()
            const daysInPrevMonth = new Date(calYear, calMonth, 0).getDate()

            // Prev month fill
            for (let i = startOffset - 1; i >= 0; i--) {
                const d = document.createElement('div')
                d.className = 'cal-day other-month'
                d.textContent = daysInPrevMonth - i
                grid.appendChild(d)
            }
            // Current month
            for (let day = 1; day <= daysInMonth; day++) {
                const d = document.createElement('div')
                const dow = (new Date(calYear, calMonth, day).getDay() + 6) % 7 // 5=Sat,6=Sun
                d.className = 'cal-day' +
                    (dow >= 5 ? ' weekend' : '') +
                    (day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear() ? ' today' : '')
                d.textContent = day
                grid.appendChild(d)
            }
            // Next month fill
            const totalCells = startOffset + daysInMonth
            const remain = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
            for (let i = 1; i <= remain; i++) {
                const d = document.createElement('div')
                d.className = 'cal-day other-month'
                d.textContent = i
                grid.appendChild(d)
            }
        }

        document.getElementById('calPrevBtn')?.addEventListener('click', (e) => {
            e.stopPropagation()
            calMonth--; if (calMonth < 0) { calMonth = 11; calYear-- }
            renderCalendar()
        })
        document.getElementById('calNextBtn')?.addEventListener('click', (e) => {
            e.stopPropagation()
            calMonth++; if (calMonth > 11) { calMonth = 0; calYear++ }
            renderCalendar()
        })

        dateBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            const visible = popup.style.display !== 'none'
            if (!visible) {
                calYear = new Date().getFullYear()
                calMonth = new Date().getMonth()
                renderCalendar()
                const rect = dateBtn.getBoundingClientRect()
                popup.style.bottom  = (window.innerHeight - rect.top + 6) + 'px'
                popup.style.left    = Math.min(rect.left, window.innerWidth - 270) + 'px'
                popup.style.display = 'block'
            } else {
                popup.style.display = 'none'
            }
        })

        document.addEventListener('click', (e) => {
            if (popup.style.display !== 'none' && !popup.contains(e.target) && e.target !== dateBtn) {
                popup.style.display = 'none'
            }
        })
    })()

    // ── Попап changelog при клике на версию в статусбаре ────────────
    ;(function initVersionPopup() {
        const versionBtn  = document.getElementById('statusVersion')
        const popup       = document.getElementById('changelogPopup')
        const closeBtn    = document.getElementById('changelogPopupClose')
        if (!versionBtn || !popup) return

        function showPopup () { popup.style.display = 'flex' }
        function hidePopup () { popup.style.display = 'none' }
        function isVisible () { return popup.style.display !== 'none' }

        versionBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            isVisible() ? hidePopup() : showPopup()
        })

        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                hidePopup()
            })
        }

        document.addEventListener('click', (e) => {
            if (isVisible() && !popup.contains(e.target) && e.target !== versionBtn) {
                hidePopup()
            }
        })
    })()

    if (checkUpdatesBtn && updateStatusBadge && window.electronAPI?.checkForUpdates) {
        checkUpdatesBtn.addEventListener('click', async () => {
            updateStatusBadge.textContent = tGet('settings.statusChecking')
            checkUpdatesBtn.disabled = true

            try {
                const result = await window.electronAPI.checkForUpdates()

                if (result?.success) {
                    if (result.updateInfo) {
                        updateStatusBadge.textContent = tGet('settings.statusDone')
                    } else {
                        updateStatusBadge.textContent = tGet('settings.statusUpToDate')
                    }
                } else {
                    updateStatusBadge.textContent = tGet('settings.statusError')
                    console.error('Update check error:', result?.error)
                }
            } catch (error) {
                updateStatusBadge.textContent = tGet('settings.statusError')
                console.error(error)
            } finally {
                checkUpdatesBtn.disabled = false
            }
        })
    }

    initSettings()
    // Восстанавливаем язык из initI18n — cloud-sync или initSettings мог перезатереть storeCache
    setCurrentLanguage(_bootLanguage)
    applyI18n()
    // Перестраиваем tray-меню на правильном языке (main-процесс не знает о смене языка)
    ipcRenderer.send('update-tray-menu')
    updateCloudBtn()
    updateLockBtn()



    // Close popup on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const overlay = document.getElementById('extPopupOverlay')
            if (overlay && overlay.style.display !== 'none') {
                window._closeExtPopup()
            }
        }
    })
    initProxySection()
    updateGlobalProxyBtn()
    console.log('[bootstrap] security =', store.get('security', {}))
console.log('[bootstrap] pinEnabled =', store.get('pinEnabled', false))
console.log('[bootstrap] pinHash exists =', !!store.get('pinHash', ''))
console.log('[bootstrap] isPasswordEnabled typeof =', typeof isPasswordEnabled)
try {
    console.log('[bootstrap] isPasswordEnabled() =', isPasswordEnabled?.())
} catch (e) {
    console.error('[bootstrap] isPasswordEnabled failed', e)
}

    const shouldLockOnStart = isPasswordEnabled()

    if (shouldLockOnStart) {
        await advanceStartup('security', 100, { minStepTime: 260 })
        showAppRoot()
        showLockScreen()
        document.body.classList.add('startup-locked')

        setTimeout(() => {
            hideStartupSplash()
        }, 120)

        return
    }

    await advanceStartup('done', 100, { minStepTime: 240 })

    setTimeout(() => {
        finishStartup({ locked: false })
    }, 120)
}

// ==============================
// ЗАПУСК BOOTSTRAP
// ==============================
bootstrap().catch((err) => {
    console.error('Renderer bootstrap error:', err)

    const appRoot = document.getElementById('appRoot')
    const splash = document.getElementById('startupSplash')
    const stageText = document.getElementById('startupStageText')
    const hintText = document.getElementById('startupHintText')

    if (stageText) {
        stageText.textContent = 'Ошибка запуска'
    }

    if (hintText) {
        hintText.textContent = 'Произошла ошибка при инициализации. Открываем интерфейс...'
    }

    setStartupProgress(100)

    setTimeout(() => {
        if (appRoot) {
            appRoot.classList.remove('app-root-hidden')
            appRoot.classList.add('app-root-ready')
        }

        if (splash) {
            splash.classList.add('hidden')
        }
    }, 500)
})

window.showConfirmModal = function ({
  title = 'Подтверждение',
  message = 'Вы уверены?',
  confirmText = 'OK',
  cancelText = 'Отмена',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const okBtn = document.getElementById('confirmOkBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const closeBtn = document.getElementById('confirmCloseBtn');

    if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn || !closeBtn) {
      resolve(false);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = confirmText;
    cancelBtn.textContent = cancelText;

    okBtn.classList.remove('vsc-btn', 'vsc-btn-danger');
    okBtn.classList.add(danger ? 'vsc-btn-danger' : 'vsc-btn');

    let done = false;

    const cleanup = () => {
      modal.classList.remove('show');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('mousedown', onOverlayClick);
      document.removeEventListener('keydown', onKeyDown);
    };

    const finish = (value) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(value);
    };

    const onOk = () => finish(true);
    const onCancel = () => finish(false);

    const onOverlayClick = (e) => {
      if (e.target === modal) {
        finish(false);
      }
    };

    const onKeyDown = (e) => {
      if (!modal.classList.contains('show')) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      }
    };

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    modal.addEventListener('mousedown', onOverlayClick);
    document.addEventListener('keydown', onKeyDown);

    modal.classList.add('show');
    okBtn.focus();
  });
};