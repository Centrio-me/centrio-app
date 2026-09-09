'use strict'

// Контроллер чата AI-ассистента в правой панели (#assistantPanel).
// Оркестрация запроса к модели живёт в main/ipc/assistant.js (один
// долгоживущий assistant:chat + пинг-понг tool-call/tool-result) — этот
// модуль только рисует UI, ведёт локальную историю (store-ключ
// 'assistant.history', никогда не синхронизируется с облаком — см.
// main.js ALLOWED_STORE_ROOTS) и исполняет разрешённые инструменты через
// assistant-tools.js. Как и todos-bind.js/app-notif-bind.js, никогда не
// вызывает require('electron') напрямую — все IPC-примитивы приходят
// инъекцией параметров (см. renderer.js "SHIM ДЛЯ IPC").
const HISTORY_LIMIT = 40

const TOOL_LABEL_KEYS = {
    list_messengers: 'assistant.toolListMessengers',
    switch_to_messenger: 'assistant.toolSwitch',
    list_todos: 'assistant.toolListTodos',
    add_todo: 'assistant.toolAddTodo',
    toggle_todo: 'assistant.toolToggleTodo',
    open_settings_section: 'assistant.toolOpenSettings',
    get_unread_summary: 'assistant.toolUnread',
    get_recent_notifications: 'assistant.toolNotifications',
    get_vpn_status: 'assistant.toolVpnStatus',
    connect_fastest_vpn: 'assistant.toolVpnConnect',
    disconnect_vpn: 'assistant.toolVpnDisconnect',
    get_app_settings: 'assistant.toolGetSettings',
    set_app_setting: 'assistant.toolSetSetting',
    get_media_player_status: 'assistant.toolMediaStatus',
    media_player_command: 'assistant.toolMediaCommand',
    list_notes: 'assistant.toolListNotes',
    create_note: 'assistant.toolCreateNote',
    add_checklist_item: 'assistant.toolAddChecklistItem',
    toggle_note_pin: 'assistant.toolToggleNotePin',
    delete_note: 'assistant.toolDeleteNote'
}

const ERROR_MESSAGE_KEYS = {
    missing_api_key: 'assistant.errMissingKey',
    ollama_model_not_selected: 'assistant.errNoOllamaModel',
    not_authenticated: 'assistant.errNotAuthenticated',
    unknown_provider: 'assistant.errUnknown',
    too_many_tool_rounds: 'assistant.errTooManyRounds',
    cancelled: 'assistant.errCancelled',
    invalid_request: 'assistant.errGeneric',
    duplicate_request: 'assistant.errGeneric',
    // Коды нашего PRO-прокси (server: /var/www/centrio-api/src/routes/assistant.js),
    // теперь долетают сюда как raw message благодаря парсингу в
    // main/services/aiProviders/openaiCompatible.js (см. streamOpenAiCompatible).
    pro_required: 'assistant.errProRequired',
    quota_exceeded: 'assistant.errQuotaExceeded',
    assistant_not_configured: 'assistant.errGeneric',
    upstream_error: 'assistant.errGeneric',
    upstream_unreachable: 'assistant.errGeneric'
}

function bindAssistantUi({ store, ipcRenderer, invokeIpc, tGet, toolsApi, openRightPanel, hasEffectivePro }) {
    const btn = document.getElementById('assistantBtn')
    const panel = document.getElementById('assistantPanel')
    const messagesEl = document.getElementById('assistantMessages')
    const form = document.getElementById('assistantInputForm')
    const input = document.getElementById('assistantInput')
    const sendBtn = document.getElementById('assistantSendBtn')
    const statusEl = document.getElementById('assistantStatus')
    const quotaBtn = document.getElementById('assistantQuotaBtn')
    const quotaRingFill = document.getElementById('assistantQuotaRingFill')
    const quotaPopover = document.getElementById('assistantQuotaPopover')
    const quotaPopoverFill = document.getElementById('assistantQuotaPopoverFill')
    const quotaPopoverText = document.getElementById('assistantQuotaPopoverText')
    const QUOTA_RING_CIRCUMFERENCE = 50.27
    const settingsBtn = document.getElementById('assistantOpenSettingsBtn')
    const clearHistoryBtn = document.getElementById('assistantClearHistoryBtn')

    if (!btn || !panel || !messagesEl || !form || !input || !toolsApi) return

    const EXAMPLE_PROMPT_KEYS = ['example1', 'example2', 'example3', 'example4', 'example5', 'example6']

    let history = []
    let activeRequestId = null
    let currentAssistantBubble = null
    let unsubscribers = []
    let thinkingEl = null

    function escapeHtml(str) {
        const div = document.createElement('div')
        div.textContent = str
        return div.innerHTML
    }

    function loadHistory() {
        const saved = store.get('assistant.history', [])
        history = Array.isArray(saved) ? saved.slice(-HISTORY_LIMIT) : []
    }

    function saveHistory() {
        store.set('assistant.history', history.slice(-HISTORY_LIMIT))
    }

    function scrollToBottom() {
        messagesEl.scrollTop = messagesEl.scrollHeight
    }

    // Приветствие по времени суток (5-11 утро, 12-17 день, 18-22 вечер,
    // 23-4 ночь) — тот же принцип, что у большинства ассистентов
    // (Copilot/Notion AI и т.п.), локализовано под все 7 языков приложения.
    function greetingKeyForHour(hour) {
        if (hour >= 5 && hour < 12) return 'assistant.greetingMorning'
        if (hour >= 12 && hour < 18) return 'assistant.greetingDay'
        if (hour >= 18 && hour < 23) return 'assistant.greetingEvening'
        return 'assistant.greetingNight'
    }

    function renderEmptyState() {
        const examples = EXAMPLE_PROMPT_KEYS
            .map(key => tGet(`assistant.${key}`))
            .filter(Boolean)
        const examplesHtml = examples.length
            ? `<div class="assistant-empty-examples">${examples.map(text => `<button type="button" class="assistant-example-chip">${escapeHtml(text)}</button>`).join('')}</div>`
            : ''
        const greeting = tGet(greetingKeyForHour(new Date().getHours()))
        messagesEl.innerHTML = `
            <div class="assistant-empty">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 3l1.9 4.9L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 3z"/>
                    <path d="M19 15l.8 2.1L22 18l-2.2.9L19 21l-.8-2.1L16 18l2.2-.9L19 15z"/>
                </svg>
                <span class="assistant-empty-greeting">${escapeHtml(greeting)}</span>
                <span class="assistant-empty-subtitle">${escapeHtml(tGet('assistant.emptyState'))}</span>
                ${examplesHtml}
            </div>
        `
        messagesEl.querySelectorAll('.assistant-example-chip').forEach((chip, i) => {
            chip.addEventListener('click', () => sendMessage(examples[i]))
        })
    }

    function renderHistory() {
        if (history.length === 0) { renderEmptyState(); return }
        messagesEl.innerHTML = history
            .map(m => `<div class="assistant-msg assistant-msg-${m.role === 'user' ? 'user' : 'bot'}"><div class="assistant-msg-content">${escapeHtml(m.content)}</div></div>`)
            .join('')
        scrollToBottom()
    }

    function appendUserMessage(text) {
        if (history.length === 0) messagesEl.innerHTML = ''
        history.push({ role: 'user', content: text })
        const el = document.createElement('div')
        el.className = 'assistant-msg assistant-msg-user'
        el.innerHTML = `<div class="assistant-msg-content">${escapeHtml(text)}</div>`
        messagesEl.appendChild(el)
        scrollToBottom()
    }

    function startAssistantBubble() {
        const el = document.createElement('div')
        el.className = 'assistant-msg assistant-msg-bot'
        el.innerHTML = '<div class="assistant-msg-content"></div>'
        messagesEl.appendChild(el)
        scrollToBottom()
        currentAssistantBubble = el.querySelector('.assistant-msg-content')
        return currentAssistantBubble
    }

    function startThinking() {
        if (thinkingEl) return
        const el = document.createElement('div')
        el.className = 'assistant-thinking'
        el.innerHTML = `
            <img src="assets/icon.png" alt="" class="assistant-thinking-logo">
            <span class="assistant-thinking-label">${escapeHtml(tGet('assistant.thinking'))}</span>
            <span class="assistant-thinking-dots"><span></span><span></span><span></span></span>
        `
        messagesEl.appendChild(el)
        thinkingEl = el
        scrollToBottom()
    }

    function stopThinking() {
        if (!thinkingEl) return
        thinkingEl.remove()
        thinkingEl = null
    }

    function appendToolChip(toolName) {
        const labelKey = TOOL_LABEL_KEYS[toolName]
        const label = labelKey ? tGet(labelKey) : toolName
        const el = document.createElement('div')
        el.className = 'assistant-tool-chip'
        el.textContent = label
        messagesEl.appendChild(el)
        scrollToBottom()
    }

    function setSending(isSending) {
        if (sendBtn) sendBtn.disabled = isSending
        input.disabled = isSending
        panel.classList.toggle('assistant-sending', isSending)
    }

    function showStatus(text, isError) {
        if (!statusEl) return
        statusEl.textContent = text || ''
        statusEl.classList.toggle('assistant-status-error', !!isError)
        statusEl.style.display = text ? '' : 'none'
    }

    function errorMessage(code) {
        const key = ERROR_MESSAGE_KEYS[code] || 'assistant.errGeneric'
        return tGet(key)
    }

    function closeQuotaPopover() {
        if (quotaPopover) quotaPopover.style.display = 'none'
    }

    function setQuotaRing(fraction, isLow) {
        if (!quotaRingFill) return
        const clamped = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
        quotaRingFill.style.strokeDashoffset = String(QUOTA_RING_CIRCUMFERENCE * (1 - clamped))
        quotaBtn?.classList.toggle('assistant-quota-low', !!isLow)
    }

    // Тот же маршрут 'api-assistant-usage' и те же ключи локализации, что
    // уже используются в Настройки → AI-ассистент (см.
    // assistant-settings-bind.js: refreshProUsage) — здесь то же значение
    // управляет кольцевым индикатором в шапке (кольцо заполняется по
    // остатку лимита) и текстом во всплывающем окне по клику на кольцо,
    // вместо отдельной текстовой полосы над чатом.
    async function refreshQuota() {
        if (!quotaBtn) return
        const isPro = typeof hasEffectivePro === 'function' ? hasEffectivePro() : false
        if (!isPro) { quotaBtn.style.display = 'none'; closeQuotaPopover(); return }

        const token = store.get('cloud.accessToken', null)
        if (!token) { quotaBtn.style.display = 'none'; closeQuotaPopover(); return }

        quotaBtn.style.display = ''
        if (quotaPopoverText) quotaPopoverText.textContent = tGet('assistant.settings.quotaLoading')
        try {
            const res = await invokeIpc('api-assistant-usage', token)
            // BUGFIX ("лимит не считается" / literal "undefined" shown in the
            // popover): res.data.used/limit can come back missing or
            // non-numeric depending on the backend response shape — rather
            // than interpolate "undefined" into the localized string, treat
            // that as an error state like a failed request.
            const used = Number(res?.data?.used)
            const limit = Number(res?.data?.limit)
            if (res?.success && res.data && Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
                const remaining = limit - used
                const fraction = remaining / limit
                setQuotaRing(fraction, fraction <= 0.15)
                if (quotaPopoverFill) quotaPopoverFill.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`
                if (quotaPopoverText) quotaPopoverText.textContent = tGet('assistant.settings.quotaUsed', { used, limit })
            } else {
                setQuotaRing(0, false)
                if (quotaPopoverText) quotaPopoverText.textContent = tGet('assistant.settings.quotaError')
            }
        } catch {
            setQuotaRing(0, false)
            if (quotaPopoverText) quotaPopoverText.textContent = tGet('assistant.settings.quotaError')
        }
    }

    function cleanupListeners() {
        unsubscribers.forEach(fn => { try { fn() } catch {} })
        unsubscribers = []
    }

    function buildApiMessages() {
        return [
            { role: 'system', content: tGet('assistant.systemPrompt') },
            ...history.map(m => ({ role: m.role, content: m.content }))
        ]
    }

    async function sendMessage(text) {
        if (activeRequestId) return

        appendUserMessage(text)
        saveHistory()

        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        activeRequestId = requestId
        setSending(true)
        showStatus('')

        let assistantText = ''
        let segmentText = ''
        currentAssistantBubble = null
        startThinking()

        // Некоторые модели присылают whitespace-only чанк (например
        // ведущий пробел) перед tool-call — из-за него создавался пузырь,
        // который потом ничем не наполнялся и оставался в DOM как
        // визуально пустая рамка. Убираем такой пузырь при закрытии
        // сегмента (перед tool-чипом или в конце хода), а не просто
        // обнуляем ссылку на него.
        const dropEmptyBubble = () => {
            if (currentAssistantBubble && !segmentText.trim()) {
                currentAssistantBubble.closest('.assistant-msg')?.remove()
            }
        }

        const finish = () => {
            dropEmptyBubble()
            stopThinking()
            cleanupListeners()
            activeRequestId = null
            setSending(false)
            currentAssistantBubble = null
        }

        const offChunk = ipcRenderer.on('assistant:stream-chunk', (payload) => {
            if (payload?.requestId !== requestId) return
            const text = payload.text || ''
            // Пустые chunk'и (некоторые провайдеры шлют их до реального
            // текста, например во время рассуждений reasoning-моделей) раньше
            // сразу создавали пузырь ответа — он повисал пустым до первого
            // реального токена. Теперь пузырь появляется только вместе с
            // непустым текстом, а до этого момента виден спиннер-индикатор.
            if (!text) return
            stopThinking()
            if (!currentAssistantBubble) { startAssistantBubble(); segmentText = '' }
            assistantText += text
            segmentText += text
            currentAssistantBubble.textContent = segmentText
            scrollToBottom()
        })
        const offToolCall = ipcRenderer.on('assistant:tool-call', async (payload) => {
            if (payload?.requestId !== requestId) return
            stopThinking()
            dropEmptyBubble()
            appendToolChip(payload.name)
            // Раунд с текстом закрыт tool-чипом — следующий текст (после
            // выполнения инструмента) должен идти в НОВЫЙ пузырь ниже чипа,
            // а не молча дописываться в старый пузырь над ним (из-за этого
            // ответ выглядел как пустое место после чипа — новый текст
            // обновлял пузырь, оставшийся выше по DOM).
            currentAssistantBubble = null
            const result = await toolsApi.executeAssistantTool(payload.name, payload.arguments)
            // Не awaited нарочно (не блокируем startThinking() ниже), но если
            // сам IPC-вызов упадёт, main так и будет ждать этот tool-result
            // вечно — весь диалог зависнет с бесконечным "думает" без единой
            // ошибки на экране. .catch() не даёт этому уйти в тишину.
            invokeIpc('assistant:tool-result', { requestId, toolCallId: payload.toolCallId, result })
                .catch(err => console.error('[assistant] tool-result delivery failed:', err))
            // Инструмент отработал — ждём следующий раунд модели, снова
            // показываем "думает", пока не придёт текст/новый tool-call.
            if (activeRequestId === requestId) startThinking()
        })
        const offDone = ipcRenderer.on('assistant:done', (payload) => {
            if (payload?.requestId !== requestId) return
            if (assistantText) {
                history.push({ role: 'assistant', content: assistantText })
                saveHistory()
            }
            finish()
            refreshQuota()
        })
        const offError = ipcRenderer.on('assistant:error', (payload) => {
            if (payload?.requestId !== requestId) return
            showStatus(errorMessage(payload?.message), true)
            finish()
        })

        unsubscribers = [offChunk, offToolCall, offDone, offError].filter(fn => typeof fn === 'function')

        try {
            const res = await invokeIpc('assistant:chat', {
                requestId,
                messages: buildApiMessages(),
                tools: toolsApi.getToolSchemas()
            })
            if (res && res.success === false && activeRequestId === requestId) {
                showStatus(errorMessage(res.error), true)
                finish()
            }
        } catch (error) {
            if (activeRequestId === requestId) {
                showStatus(errorMessage(error?.message), true)
                finish()
            }
        }
    }

    function autoGrowInput() {
        input.style.height = 'auto'
        input.style.height = `${input.scrollHeight}px`
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const text = (input.value || '').trim()
        if (!text) return
        input.value = ''
        autoGrowInput()
        sendMessage(text)
    })

    input.addEventListener('input', autoGrowInput)

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            if (typeof form.requestSubmit === 'function') form.requestSubmit()
            else form.dispatchEvent(new Event('submit', { cancelable: true }))
        }
    })

    quotaBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (!quotaPopover) return
        quotaPopover.style.display = quotaPopover.style.display === 'none' ? '' : 'none'
    })

    document.addEventListener('click', (e) => {
        if (!quotaPopover || quotaPopover.style.display === 'none') return
        if (quotaPopover.contains(e.target) || quotaBtn?.contains(e.target)) return
        closeQuotaPopover()
    })

    settingsBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        toolsApi.executeAssistantTool('open_settings_section', { section: 'assistant' })
    })

    // BUGFIX (2026-09-10, "Очистить историю ИИ — всплывающее окно в нашем
    // стиле сделать" — live user request): window.confirm() is the bare OS
    // dialog, jarring next to the app's own dark UI. window.showConfirmModal
    // (renderer.js) is the shared styled confirm dialog already used by
    // notes-bind.js/todos-bind.js/webview-tabs-bind.js for the same kind of
    // destructive confirmation.
    clearHistoryBtn?.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (activeRequestId) return
        if (history.length === 0) return
        const ok = await window.showConfirmModal({
            title: tGet('assistant.clearHistory') || 'Очистить историю',
            message: tGet('assistant.clearHistoryConfirm'),
            confirmText: tGet('assistant.clearHistory') || 'Очистить',
            cancelText: tGet('assistant.cancel') || 'Отмена',
            danger: true
        })
        if (!ok) return
        history = []
        saveHistory()
        renderEmptyState()
    })

    panel.addEventListener('click', (e) => {
        e.stopPropagation()
        // panel останавливает всплытие до document, поэтому клики внутри
        // самой панели (но не по кольцу/попапу) закрываем здесь же.
        if (quotaPopover && quotaPopover.style.display !== 'none' &&
            !quotaPopover.contains(e.target) && !quotaBtn?.contains(e.target)) {
            closeQuotaPopover()
        }
    })

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        openRightPanel?.()
        requestAnimationFrame(() => input.focus())
        refreshQuota()
    })

    loadHistory()
    renderHistory()

    return {
        cancelActive() {
            if (activeRequestId) ipcRenderer.send('assistant:cancel', { requestId: activeRequestId })
        }
    }
}

module.exports = { bindAssistantUi }
