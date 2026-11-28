'use strict'

function createExtensionsUiApi({
    store,
    tGet,
    requirePro,
    onExtensionToggle,
    refreshUser,
    extTools
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
        // REMOVED (2026-09-30, "Заметки - теперь по-умолчанию внутри
        // программы. Убираем её из расширений. Не нужна она там. Не нужно
        // её специально включать. Пусть всегда доступна будет для PRO" —
        // live request): 'notes' dropped from this list — no longer a
        // toggleable extension, always visible for Pro (see
        // renderer/notes-bind.js's updateButtonVisibility()).
        {
            // Рабочие пространства (2026-09-14, второй пересмотр) — плагин по
            // прямому запросу пользователя: "Папки нужно вернуть... Папки и
            // рабочие пространства смогут существовать вместе. В рабочих
            // пространствах могут быть папки. И они включаются как плагин".
            // Пространство — необязательный контейнер ДЛЯ ПАПОК
            // (folder.workspaceId), см. renderer/workspaces-ui.js.
            id: 'workspaces',
            icon: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1.5"/>
                <rect x="14" y="3" width="7" height="7" rx="1.5"/>
                <rect x="3" y="14" width="7" height="7" rx="1.5"/>
                <rect x="14" y="14" width="7" height="7" rx="1.5"/>
            </svg>`,
            color: '#6366f1',
            bg: 'rgba(99,102,241,.13)',
            border: 'rgba(99,102,241,.28)',
            titleKey: 'extensions.workspaces.title',
            descKey: 'extensions.workspaces.desc'
        }
    ]

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
        // local 14-day trial OR a paid team seat (orgSummary.orgProSeat, see
        // 2026-09-10 "свяжи Pro-доступ с оплаченным местом в команде") — so
        // trial/team users see extensions unlocked in the UI consistently
        // with what main/ipc/extensions.js's isProUser()
        // (main/services/entitlement.js) actually allows them to install.
        try {
            const cloudUser = store.get('cloud.user', null)
            const plan = (cloudUser?.plan || 'FREE').toUpperCase()
            if (plan !== 'FREE') return true

            const trialExpiresAt = store.get('localProTrialExpiresAt', null)
            if (trialExpiresAt && new Date(trialExpiresAt) > new Date()) return true

            if (cloudUser?.orgSummary?.orgProSeat === true) return true

            return false
        } catch {
            return false
        }
    }

    // ── One card: icon, name and description, a «Настройки» button when the tool has settings, and its switch ──
    const LOCK_HTML = `<div class="ext-pro-lock" title="Pro">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Pro
    </div>`
    const GEAR_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.100a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 0 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.100a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 0 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.100a1.700 1.700 0 0 0 1.800.3H9a1.700 1.700 0 0 0 1-1.500V3a2 2 0 0 1 4 0v.1a1.700 1.700 0 0 0 1 1.500 1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.100a1.700 1.700 0 0 0-.3 1.800V9a1.700 1.700 0 0 0 1.500 1H21a2 2 0 0 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/></svg>'

    function buildCard({ def, on, locked, onChange }) {
        const item = document.createElement('div')
        item.className = 'ext-item'
        const card = document.createElement('div')
        card.className = 'ext-card'
        card.innerHTML = `
            <div class="ext-card-icon" style="background:${def.bg};border-color:${def.border};color:${def.color}">${def.icon}</div>
            <div class="ext-card-info">
                <div class="ext-card-name">${escapeHtml(tGet(def.titleKey))}</div>
                <div class="ext-card-desc">${escapeHtml(tGet(def.descKey))}</div>
            </div>
            <div class="ext-card-actions">
                ${locked ? LOCK_HTML : ''}
                <label class="toggle">
                    <input type="checkbox" ${on ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>`
        const input = card.querySelector('input')
        input.addEventListener('change', () => onChange(input.checked, input))
        item.append(card)
        if (typeof def.renderSettings === 'function') {
            const box = document.createElement('div')
            box.className = 'ext-settings'
            box.hidden = true
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'ext-gear'
            button.innerHTML = `${GEAR_SVG}<span>${escapeHtml(tGet('vext.settings'))}</span>`
            button.setAttribute('aria-expanded', 'false')
            button.addEventListener('click', async () => {
                const open = box.hidden
                if (open) await def.renderSettings(box)
                box.hidden = !open
                button.setAttribute('aria-expanded', String(open))
                button.classList.toggle('on', open)
            })
            card.querySelector('.ext-card-actions').prepend(button)
            item.append(box)
        }
        return item
    }

    let renderToken = 0

    async function renderExtensionsCatalog() {
        const container = document.getElementById('extensionsCatalog')
        if (!container) return
        const token = ++renderToken
        const panelContainer = document.getElementById('extensionsPanelCatalog')
        const state = getExtensionState()
        const userIsPro = getUserIsPro()
        const cards = []

        NATIVE_EXTENSIONS.filter((e) => e.id !== 'workspaces').forEach((ext) => {
            const def = ext.id === 'adblock' && extTools ? { ...ext, renderSettings: extTools.adblockSettings } : ext
            cards.push({ target: container, node: buildCard({
                def, on: state[ext.id] === true && userIsPro, locked: !userIsPro,
                onChange: (checked, input) => {
                    if (!userIsPro) { input.checked = false; if (requirePro) requirePro('extensions'); return }
                    const next = getExtensionState()
                    next[ext.id] = checked
                    store.set('extensionsState', next)
                    if (typeof onExtensionToggle === 'function') onExtensionToggle(ext.id, checked)
                }
            }) })
        })
        const toolDefs = extTools ? extTools.tools : []
        const panelDefs = extTools ? extTools.panel : []
        for (const def of toolDefs) {
            const on = await def.isOn()
            cards.push({ target: container, node: buildCard({ def, on, locked: false, onChange: async (checked) => { await def.setOn(checked) } }) })
        }
        const panelNodes = []
        for (const def of panelDefs) {
            const on = await def.isOn()
            const locked = !def.free && !userIsPro
            panelNodes.push(buildCard({
                def, on, locked,
                onChange: async (checked, input) => {
                    if (locked) { input.checked = true; if (requirePro) requirePro('extensions'); return }
                    await def.setOn(checked)
                }
            }))
        }
        if (token !== renderToken) return // a newer drawing has started meanwhile
        container.textContent = ''
        cards.forEach((c) => c.target.append(c.node))
        if (panelContainer) {
            panelContainer.textContent = ''
            panelNodes.forEach((n) => panelContainer.append(n))
        }
        renderWorkspacesRow(state, userIsPro)
    }

    // One handler for a built-in tool's switch, wherever it is drawn (the list of tools, the side panel section)
    function bindNativeToggle(input, extId, userIsPro) {
        input.addEventListener('change', (e) => {
            if (!userIsPro) {
                e.target.checked = false
                if (requirePro) requirePro('extensions')
                return
            }

            const newState = getExtensionState()
            newState[extId] = e.target.checked
            store.set('extensionsState', newState)

            if (typeof onExtensionToggle === 'function') {
                onExtensionToggle(extId, e.target.checked)
            }
        })
    }

    // «Рабочие пространства» are a part of the side panel, so their switch lives in Settings → Боковая панель
    // (it is still the same extension underneath: the same state, the same handler)
    function renderWorkspacesRow(state, userIsPro) {
        const group = document.getElementById('workspacesSettingsGroup')
        const ext = NATIVE_EXTENSIONS.find((e) => e.id === 'workspaces')
        if (!group || !ext) return
        group.textContent = ''
        const title = document.createElement('div')
        title.className = 'settings-group-title'
        title.append(tGet(ext.titleKey))
        const chip = document.createElement('span')
        chip.className = 'ai-pro-chip'
        chip.textContent = 'ПРО'
        title.append(chip)
        const row = document.createElement('div')
        row.className = 'settings-row'
        const label = document.createElement('div')
        label.className = 'settings-label'
        const name = document.createElement('span')
        name.textContent = tGet(ext.titleKey)
        const hint = document.createElement('span')
        hint.className = 'settings-hint'
        hint.textContent = tGet(ext.descKey)
        label.append(name, hint)
        const toggle = document.createElement('label')
        toggle.className = 'toggle'
        const input = document.createElement('input')
        input.type = 'checkbox'
        input.id = 'ext-toggle-workspaces'
        input.checked = state.workspaces === true && userIsPro
        const slider = document.createElement('span')
        slider.className = 'toggle-slider'
        toggle.append(input, slider)
        row.append(label, toggle)
        group.append(title, row)
        bindNativeToggle(input, 'workspaces', userIsPro)
    }

    function openExtensionsSection() {
        renderExtensionsCatalog()

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
            }).catch(() => {})
        }
    }

    return {
        renderExtensionsCatalog,
        openExtensionsSection
    }
}

module.exports = {
    createExtensionsUiApi
}
