'use strict'

function createExtensionsUiApi({
    store,
    tGet,
    requirePro,
    onExtensionToggle,
    refreshUser
}) {
    const NATIVE_EXTENSIONS = [
        {
            id: 'adblock',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
            </svg>`,
            color: '#ef4444',
            bg: 'rgba(239,68,68,.13)',
            border: 'rgba(239,68,68,.28)',
            titleKey: 'extensions.adblock.title',
            descKey: 'extensions.adblock.desc'
        },
        {
            id: 'screenshot',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
            </svg>`,
            color: '#f59e0b',
            bg: 'rgba(245,158,11,.13)',
            border: 'rgba(245,158,11,.28)',
            titleKey: 'extensions.screenshot.title',
            descKey: 'extensions.screenshot.desc'
        },
        {
            id: 'darkmode',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>`,
            color: '#8b5cf6',
            bg: 'rgba(139,92,246,.13)',
            border: 'rgba(139,92,246,.28)',
            titleKey: 'extensions.darkmode.title',
            descKey: 'extensions.darkmode.desc'
        },
        {
            id: 'split',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="3" width="20" height="18" rx="2"/>
                <line x1="12" y1="3" x2="12" y2="21"/>
            </svg>`,
            color: '#818cf8',
            bg: 'rgba(129,140,248,.13)',
            border: 'rgba(129,140,248,.28)',
            titleKey: 'extensions.split.title',
            descKey: 'extensions.split.desc'
        },
        {
            id: 'notes',
            // BUGFIX (2026-09-09, "Иконка заметок кривая" — live user
            // report): see matching fix + explanation in index.html notesBtn.
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="13" y2="17"/>
            </svg>`,
            color: '#fbbf24',
            bg: 'rgba(251,191,36,.13)',
            border: 'rgba(251,191,36,.28)',
            titleKey: 'extensions.notes.title',
            descKey: 'extensions.notes.desc'
        }
    ]

    // Реальные расширения из Chrome Web Store — жёстко заданный список
    // (main/services/extensions.js:CATALOG). В отличие от NATIVE_EXTENSIONS это не
    // просто built-in фича с тумблером, а внешний бинарник: install -> toggle -> uninstall.
    //
    // Пароль-менеджеры (LastPass, Bitwarden, RoboForm) сюда сознательно не включены —
    // их background service worker падает на chrome.windows/chrome.webNavigation,
    // которые Electron не реализует полностью (см. main/services/extensions.js).
    const REAL_EXTENSIONS = [
        {
            key: 'translate-ext',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M2 12h20"/>
                <path d="M12 2a15.3 15.3 0 0 1 0 20"/>
                <path d="M12 2a15.3 15.3 0 0 0 0 20"/>
            </svg>`,
            color: '#0f9d58',
            bg: 'rgba(15,157,88,.13)',
            border: 'rgba(15,157,88,.28)',
            titleKey: 'extensions.translateExt.title',
            descKey: 'extensions.translateExt.desc'
        },
        {
            key: 'languagetool-ext',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
                <path d="M9 16.5l2.2-6.5 2.2 6.5"/>
                <path d="M9.7 14.5h3"/>
            </svg>`,
            color: '#1a73e8',
            bg: 'rgba(26,115,232,.13)',
            border: 'rgba(26,115,232,.28)',
            titleKey: 'extensions.languageToolExt.title',
            descKey: 'extensions.languageToolExt.desc'
        }
    ]

    // key -> true, пока install/uninstall в процессе (защита от двойного клика)
    const realExtBusy = {}
    // key -> текст последней ошибки install/toggle, показывается инлайн в карточке
    const realExtErrors = {}

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]))
    }

    function isPro() {
        // requirePro returns true if PRO, false if not
        // We need to check without showing modal — check via cloudStore
        // requirePro is a function that shows modal if not PRO
        // We'll use a try-call approach: check plan from DOM or pass isPro separately
        // For now, we pass it through requirePro by checking return without triggering
        return false // will be overridden by proCheck below
    }

    function getExtensionState() {
        return store.get('extensionsState', {}) || {}
    }

    function getUserIsPro() {
        // Check plan stored in cloud state without triggering modal. Mirrors
        // hasEffectivePro() in renderer.js — account plan OR a still-active
        // local 14-day trial — so trial users see extensions unlocked in the
        // UI consistently with what main/ipc/extensions.js's isProUser()
        // (main/services/entitlement.js) actually allows them to install.
        try {
            const cloudUser = store.get('cloud.user', null)
            const plan = (cloudUser?.plan || 'FREE').toUpperCase()
            if (plan !== 'FREE') return true

            const trialExpiresAt = store.get('localProTrialExpiresAt', null)
            if (trialExpiresAt && new Date(trialExpiresAt) > new Date()) return true

            return false
        } catch {
            return false
        }
    }

    function renderExtensionsCatalog() {
        const container = document.getElementById('extensionsCatalog')
        if (!container) return

        container.innerHTML = ''
        const state = getExtensionState()
        const userIsPro = getUserIsPro()

        NATIVE_EXTENSIONS.forEach(ext => {
            const card = document.createElement('div')
            card.className = 'ext-card'

            // OFF by default — only on if explicitly enabled
            const isEnabled = state[ext.id] === true

            const lockBadge = !userIsPro
                ? `<div class="ext-pro-lock" title="Pro">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Pro
                </div>`
                : ''

            card.innerHTML = `
                <div class="ext-card-icon" style="background:${ext.bg};border-color:${ext.border};color:${ext.color}">
                    ${ext.icon}
                </div>
                <div class="ext-card-info">
                    <div class="ext-card-name">${tGet(ext.titleKey)}</div>
                    <div class="ext-card-desc">${tGet(ext.descKey)}</div>
                </div>
                <div class="ext-card-actions">
                    ${lockBadge}
                    <label class="toggle">
                        <input type="checkbox" id="ext-toggle-${ext.id}" ${isEnabled && userIsPro ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                </div>
            `

            const toggle = card.querySelector('input')
            toggle.addEventListener('change', (e) => {
                if (!userIsPro) {
                    e.target.checked = false
                    if (requirePro) requirePro('extensions')
                    return
                }

                const newState = getExtensionState()
                newState[ext.id] = e.target.checked
                store.set('extensionsState', newState)

                if (typeof onExtensionToggle === 'function') {
                    onExtensionToggle(ext.id, e.target.checked)
                }
            })

            container.appendChild(card)
        })
    }

    // Реальные Chrome-расширения (сейчас: Google Переводчик) — install/toggle/uninstall,
    // в отличие от NATIVE_EXTENSIONS не просто built-in фича с тумблером.
    async function renderRealExtensionsCatalog() {
        const container = document.getElementById('extensionsRealCatalog')
        if (!container) return

        let catalog
        try {
            const res = await window.electronAPI?.extList?.()
            catalog = (res && res.success && Array.isArray(res.catalog)) ? res.catalog : []
        } catch {
            catalog = []
        }

        const byKey = {}
        catalog.forEach((c) => { if (c && c.key) byKey[c.key] = c })

        container.innerHTML = ''
        const state = getExtensionState()
        const userIsPro = getUserIsPro()

        REAL_EXTENSIONS.forEach(ext => {
            const info = byKey[ext.key] || { installed: false }
            const isInstalled = !!info.installed
            const isEnabled = isInstalled && state[ext.key] === true
            const isBusy = !!realExtBusy[ext.key]
            const errorText = realExtErrors[ext.key]

            const card = document.createElement('div')
            card.className = `ext-card${isInstalled ? ' ext-installed' : ''}`

            const lockBadge = !userIsPro
                ? `<div class="ext-pro-lock" title="Pro">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                    </svg>
                    Pro
                </div>`
                : ''

            const actionsHtml = isInstalled
                ? `
                    ${lockBadge}
                    <button class="ext-uninstall-btn" data-action="uninstall" title="${escapeHtml(tGet('extensions.uninstallBtn'))}" ${isBusy ? 'disabled' : ''}>✕</button>
                    <label class="ext-toggle">
                        <input type="checkbox" class="ext-toggle-check" data-action="toggle" ${isEnabled && userIsPro ? 'checked' : ''} ${isBusy ? 'disabled' : ''}>
                        <span class="ext-toggle-slider"></span>
                    </label>
                `
                : `
                    ${lockBadge}
                    <button class="ext-install-btn${isBusy ? ' loading' : ''}" data-action="install" ${isBusy ? 'disabled' : ''}>
                        ${escapeHtml(isBusy ? tGet('extensions.installing') : tGet('extensions.install'))}
                    </button>
                `

            card.innerHTML = `
                <div class="ext-card-icon" style="background:${ext.bg};border-color:${ext.border};color:${ext.color}">
                    ${ext.icon}
                </div>
                <div class="ext-card-info">
                    <div class="ext-card-name">${escapeHtml(tGet(ext.titleKey))}</div>
                    <div class="ext-card-desc">${escapeHtml(tGet(ext.descKey))}</div>
                    <span class="ext-card-cat">${escapeHtml(tGet('extensions.realBadge'))}</span>
                    ${errorText ? `<div class="ext-card-desc" style="color:#f44;margin-top:4px;">${escapeHtml(errorText)}</div>` : ''}
                </div>
                <div class="ext-card-actions">
                    ${actionsHtml}
                </div>
            `

            const installBtn = card.querySelector('[data-action="install"]')
            if (installBtn) {
                installBtn.addEventListener('click', async () => {
                    if (!userIsPro) {
                        if (requirePro) requirePro('extensions')
                        return
                    }
                    if (realExtBusy[ext.key]) return
                    realExtBusy[ext.key] = true
                    delete realExtErrors[ext.key]
                    renderRealExtensionsCatalog()

                    try {
                        const result = await window.electronAPI.extInstall(ext.key)
                        if (!result || !result.success) {
                            realExtErrors[ext.key] = `${tGet('extensions.installFailed')}: ${result?.error || '?'}`
                        }
                    } catch (err) {
                        realExtErrors[ext.key] = `${tGet('extensions.installFailed')}: ${err?.message || err}`
                    } finally {
                        realExtBusy[ext.key] = false
                        renderRealExtensionsCatalog()
                    }
                })
            }

            const uninstallBtn = card.querySelector('[data-action="uninstall"]')
            if (uninstallBtn) {
                uninstallBtn.addEventListener('click', async () => {
                    if (realExtBusy[ext.key]) return
                    realExtBusy[ext.key] = true
                    delete realExtErrors[ext.key]
                    renderRealExtensionsCatalog()

                    try {
                        // Выключаем везде ДО физического удаления файлов, чтобы ни одна
                        // сессия не осталась ссылаться на путь, который вот-вот исчезнет.
                        const newState = getExtensionState()
                        if (newState[ext.key]) {
                            newState[ext.key] = false
                            store.set('extensionsState', newState)
                            await window.electronAPI.extToggle(ext.key, false)
                        }
                        await window.electronAPI.extUninstall(ext.key)
                    } catch (err) {
                        realExtErrors[ext.key] = `${err?.message || err}`
                    } finally {
                        realExtBusy[ext.key] = false
                        renderRealExtensionsCatalog()
                    }
                })
            }

            const toggleInput = card.querySelector('[data-action="toggle"]')
            if (toggleInput) {
                toggleInput.addEventListener('change', async (e) => {
                    const checked = e.target.checked
                    if (checked && !userIsPro) {
                        e.target.checked = false
                        if (requirePro) requirePro('extensions')
                        return
                    }
                    e.target.disabled = true

                    const newState = getExtensionState()
                    newState[ext.key] = checked
                    store.set('extensionsState', newState)

                    try {
                        const result = await window.electronAPI.extToggle(ext.key, checked)
                        if (!result || !result.success) {
                            // Откатываем UI, если main реально не смог включить/выключить —
                            // иначе тумблер будет врать о фактическом состоянии сессий.
                            e.target.checked = !checked
                            newState[ext.key] = !checked
                            store.set('extensionsState', newState)
                            realExtErrors[ext.key] = result?.error || ''
                            renderRealExtensionsCatalog()
                            return
                        }
                    } catch (err) {
                        e.target.checked = !checked
                        newState[ext.key] = !checked
                        store.set('extensionsState', newState)
                        realExtErrors[ext.key] = err?.message || String(err)
                        renderRealExtensionsCatalog()
                        return
                    } finally {
                        e.target.disabled = false
                    }
                })
            }

            container.appendChild(card)
        })
    }

    function openExtensionsSection() {
        renderExtensionsCatalog()
        renderRealExtensionsCatalog()

        // BUGFIX (2026-09-09, "PRO поставил ручками, а плагины/заметки всё
        // равно не выдвигаются" — live user report): getUserIsPro() above
        // reads the LOCAL cache (store 'cloud.user'), which only gets
        // refreshed on app startup, window focus, or the 30-min interval
        // (see renderer.js). A plan granted manually on the server while the
        // app was already open and sitting on this exact tab could stay
        // stale for a long time. The moment the user opens the Extensions
        // tab is exactly when they're most likely to just have been
        // upgraded — force a revalidation and re-render so the catalog
        // (and by extension notesUiApiRef.updateButtonVisibility(), wired
        // through onExtensionToggle) reflects the real plan immediately.
        if (typeof refreshUser === 'function') {
            refreshUser().then(() => {
                renderExtensionsCatalog()
                renderRealExtensionsCatalog()
            }).catch(() => {})
        }
    }

    return {
        renderExtensionsCatalog,
        renderRealExtensionsCatalog,
        openExtensionsSection
    }
}

module.exports = {
    createExtensionsUiApi
}
