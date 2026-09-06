'use strict'

// Вкладка «Настройки → AI-ассистент» — режим инференса (BYOK/Локально/PRO),
// BYOK-ключи для 4 провайдеров и адрес Ollama. Конфиг живёт в store-ключе
// 'assistant' (см. main.js ALLOWED_STORE_ROOTS), сохраняется сразу при
// изменении (как proxy.js/vpn-bind.js), не ждёт общей кнопки "Применить" в
// #section-general. Ключи уходят через store.secureSet(...) —
// шифруются в main (safeStorage) под 'assistant.byok.<provider>.keyEnc' и
// НИКОГДА не читаются обратно в открытом виде: единственный сигнал о
// провайдере — булев флаг из IPC 'assistant:get-status' (main/ipc/assistant.js).
// См. .claude/plans/ai-assistant.plan.md §4.1/§4.2/§8.
const BYOK_PROVIDERS = ['openai', 'anthropic', 'gemini', 'deepseek']
const PROVIDER_LABELS = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    gemini: 'Google Gemini',
    deepseek: 'DeepSeek'
}

// Курируемый список моделей на провайдера (значение — id модели у провайдера,
// как в main/services/aiProviders/index.js DEFAULT_MODELS). Первая модель в
// списке каждого провайдера — тот самый дефолт оттуда, чтобы "не выбрано"
// совпадало с фактическим поведением при отсутствии assistant.byokModel.<provider>.
const BYOK_MODELS = {
    openai: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
        { id: 'gpt-4o', label: 'GPT-4o' }
    ],
    anthropic: [
        { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
        { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' }
    ],
    gemini: [
        { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }
    ],
    deepseek: [
        { id: 'deepseek-chat', label: 'DeepSeek Chat' },
        { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' }
    ]
}

function bindAssistantSettingsUi({ store, invokeIpc, tGet, requirePro, hasEffectivePro }) {
    const modeGrid = document.getElementById('assistantModeGrid')
    const byokGroup = document.getElementById('assistantByokGroup')
    const localGroup = document.getElementById('assistantLocalGroup')
    const proGroup = document.getElementById('assistantProGroup')
    const byokProviderSelect = document.getElementById('assistantByokProviderSelect')
    const byokModelSelect = document.getElementById('assistantByokModelSelect')
    const byokKeysList = document.getElementById('assistantByokKeysList')
    const ollamaUrlInput = document.getElementById('assistantOllamaUrl')
    const ollamaModelSelect = document.getElementById('assistantOllamaModelSelect')
    const ollamaTestBtn = document.getElementById('assistantOllamaTestBtn')
    const ollamaStatus = document.getElementById('assistantOllamaStatus')
    const proStatus = document.getElementById('assistantProStatus')
    const proUsage = document.getElementById('assistantProUsage')
    const proUpgradeBtn = document.getElementById('assistantProUpgradeBtn')

    if (!modeGrid || !byokGroup || !localGroup || !proGroup) return

    function escapeHtml(str) {
        return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]))
    }

    function getConfig() {
        return store.get('assistant', {}) || {}
    }

    function saveConfig(patch) {
        const next = { ...getConfig(), ...patch }
        store.set('assistant', next)
        return next
    }

    function showStatus(el, text, isError) {
        if (!el) return
        el.textContent = text || ''
        el.classList.toggle('assistant-settings-status-error', !!isError)
        el.classList.toggle('assistant-settings-status-ok', !isError && !!text)
        el.style.display = text ? '' : 'none'
    }

    // ── Режим инференса ─────────────────────────────────────────────────
    function renderModeUi(mode) {
        modeGrid.querySelectorAll('.assistant-mode-card').forEach((card) => {
            card.classList.toggle('active', card.dataset.mode === mode)
        })
        byokGroup.style.display = mode === 'byok' ? '' : 'none'
        localGroup.style.display = mode === 'local' ? '' : 'none'
        proGroup.style.display = mode === 'pro' ? '' : 'none'
    }

    function setMode(mode) {
        if (mode === 'pro' && typeof requirePro === 'function' && !requirePro('assistantPro')) {
            return
        }
        saveConfig({ mode })
        renderModeUi(mode)
        if (mode === 'pro') { renderProStatus(); refreshProUsage() }
    }

    modeGrid.querySelectorAll('.assistant-mode-card').forEach((card) => {
        card.addEventListener('click', () => setMode(card.dataset.mode))
    })

    // ── BYOK ─────────────────────────────────────────────────────────────
    let byokStatusCache = {}

    function renderByokKeys() {
        if (!byokKeysList) return
        byokKeysList.innerHTML = BYOK_PROVIDERS.map((provider) => {
            const configured = !!byokStatusCache[provider]
            const statusText = configured ? tGet('assistant.settings.byokConfigured') : tGet('assistant.settings.byokNotConfigured')
            return `
                <div class="assistant-byok-key-row" data-provider="${provider}">
                    <div class="assistant-byok-key-label">
                        <span>${escapeHtml(PROVIDER_LABELS[provider])}</span>
                        <span class="assistant-byok-key-status ${configured ? 'is-configured' : ''}">${escapeHtml(statusText)}</span>
                    </div>
                    <div class="assistant-byok-key-row-fields">
                        <input type="password" class="vsc-input assistant-byok-key-input" data-provider="${provider}"
                            placeholder="${escapeHtml(tGet('assistant.settings.byokKeyPlaceholder'))}" autocomplete="off">
                        <button type="button" class="vsc-btn-secondary assistant-byok-key-save" data-provider="${provider}">${escapeHtml(tGet('assistant.settings.byokSave'))}</button>
                        <button type="button" class="vsc-btn-secondary assistant-byok-key-clear" data-provider="${provider}" ${configured ? '' : 'disabled'}>${escapeHtml(tGet('assistant.settings.byokClear'))}</button>
                    </div>
                </div>
            `
        }).join('')

        byokKeysList.querySelectorAll('.assistant-byok-key-save').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const provider = btn.dataset.provider
                const row = byokKeysList.querySelector(`.assistant-byok-key-row[data-provider="${provider}"]`)
                const input = row?.querySelector('.assistant-byok-key-input')
                const value = (input?.value || '').trim()
                if (!value) return
                store.secureSet(`assistant.byok.${provider}.keyEnc`, value)
                if (input) input.value = ''
                byokStatusCache[provider] = true
                await refreshByokStatus()
            })
        })
        byokKeysList.querySelectorAll('.assistant-byok-key-clear').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const provider = btn.dataset.provider
                store.secureDelete(`assistant.byok.${provider}.keyEnc`)
                byokStatusCache[provider] = false
                await refreshByokStatus()
            })
        })
    }

    async function refreshByokStatus() {
        try {
            const res = await invokeIpc('assistant:get-status')
            if (res?.success && res.data?.byok) byokStatusCache = { ...res.data.byok }
        } catch {
            // недоступно — оставляем предыдущий кэш, карточки просто не обновятся
        }
        renderByokKeys()
    }

    function populateByokModels(provider) {
        if (!byokModelSelect) return
        const models = BYOK_MODELS[provider] || []
        const saved = (getConfig().byokModel || {})[provider]
        byokModelSelect.innerHTML = models.map((m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.label)}</option>`).join('')
        byokModelSelect.value = (saved && models.some(m => m.id === saved)) ? saved : (models[0]?.id || '')
    }

    byokProviderSelect?.addEventListener('change', () => {
        saveConfig({ byokProvider: byokProviderSelect.value })
        populateByokModels(byokProviderSelect.value)
    })

    byokModelSelect?.addEventListener('change', () => {
        const provider = byokProviderSelect?.value || 'openai'
        const cfg = getConfig()
        saveConfig({ byokModel: { ...(cfg.byokModel || {}), [provider]: byokModelSelect.value } })
    })

    // ── Локальная модель (Ollama) ───────────────────────────────────────
    ollamaUrlInput?.addEventListener('change', () => {
        saveConfig({ ollamaUrl: (ollamaUrlInput.value || '').trim() || 'http://localhost:11434' })
    })
    ollamaModelSelect?.addEventListener('change', () => {
        saveConfig({ ollamaModel: ollamaModelSelect.value || null })
    })

    ollamaTestBtn?.addEventListener('click', async () => {
        const url = (ollamaUrlInput?.value || '').trim() || 'http://localhost:11434'
        ollamaTestBtn.disabled = true
        showStatus(ollamaStatus, tGet('assistant.settings.localTesting'), false)
        try {
            const res = await invokeIpc('assistant:ollama-test', { url })
            if (res?.success) {
                const models = res.data?.models || []
                populateOllamaModels(models)
                showStatus(ollamaStatus, tGet('assistant.settings.localTestOk', { count: models.length }), false)
                saveConfig({ ollamaUrl: url })
            } else {
                showStatus(ollamaStatus, tGet('assistant.settings.localTestFail'), true)
            }
        } catch {
            showStatus(ollamaStatus, tGet('assistant.settings.localTestFail'), true)
        } finally {
            ollamaTestBtn.disabled = false
        }
    })

    function populateOllamaModels(models) {
        if (!ollamaModelSelect) return
        const current = getConfig().ollamaModel || ''
        const emptyLabel = tGet('assistant.settings.localModelEmpty')
        ollamaModelSelect.innerHTML = [`<option value="">${escapeHtml(emptyLabel)}</option>`]
            .concat(models.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`))
            .join('')
        if (current && models.includes(current)) ollamaModelSelect.value = current
    }

    // ── "Наша нейросеть" (PRO-прокси) ───────────────────────────────────
    function renderProStatus() {
        if (!proStatus) return
        const isPro = typeof hasEffectivePro === 'function' ? hasEffectivePro() : false
        if (isPro) {
            showStatus(proStatus, tGet('assistant.settings.proActive'), false)
            if (proUpgradeBtn) proUpgradeBtn.style.display = 'none'
        } else {
            showStatus(proStatus, tGet('assistant.settings.proInactive'), true)
            if (proUpgradeBtn) proUpgradeBtn.style.display = ''
        }
    }

    proUpgradeBtn?.addEventListener('click', () => {
        if (typeof requirePro === 'function') requirePro('assistantPro')
    })

    // Квота показывается только когда Pro реально активен — при неактивном
    // Pro запрос всё равно вернул бы used:0/limit (см. server route /usage,
    // она не гейтит по Pro, но текст "0 из 300" при неактивном Pro вводит в
    // заблуждение сильнее, чем его отсутствие).
    async function refreshProUsage() {
        if (!proUsage) return
        const isPro = typeof hasEffectivePro === 'function' ? hasEffectivePro() : false
        if (!isPro) { proUsage.style.display = 'none'; return }

        const token = store.get('cloud.accessToken', null)
        if (!token) { proUsage.style.display = 'none'; return }

        proUsage.style.display = ''
        showStatus(proUsage, tGet('assistant.settings.quotaLoading'), false)
        try {
            const res = await invokeIpc('api-assistant-usage', token)
            // BUGFIX: avoid interpolating literal "undefined" when the
            // backend response is missing/non-numeric used/limit — see the
            // matching guard in assistant-bind.js: refreshQuota().
            const used = Number(res?.data?.used)
            const limit = Number(res?.data?.limit)
            if (res?.success && res.data && Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
                showStatus(proUsage, tGet('assistant.settings.quotaUsed', { used, limit }), false)
            } else {
                showStatus(proUsage, tGet('assistant.settings.quotaError'), true)
            }
        } catch {
            showStatus(proUsage, tGet('assistant.settings.quotaError'), true)
        }
    }

    // ── Открытие вкладки (см. settings-bind.js openAssistantSection hook) ─
    function openAssistantSection() {
        const cfg = getConfig()
        const mode = cfg.mode || 'byok'
        renderModeUi(mode)

        if (byokProviderSelect) byokProviderSelect.value = cfg.byokProvider || 'openai'
        populateByokModels(cfg.byokProvider || 'openai')
        refreshByokStatus()

        if (ollamaUrlInput) ollamaUrlInput.value = cfg.ollamaUrl || 'http://localhost:11434'
        populateOllamaModels(cfg.ollamaModel ? [cfg.ollamaModel] : [])
        showStatus(ollamaStatus, '', false)

        renderProStatus()
        refreshProUsage()
    }

    return { openAssistantSection }
}

module.exports = { bindAssistantSettingsUi }
