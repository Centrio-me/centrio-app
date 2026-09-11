// FEATURE (2026-09-11, "Онлайн чат должен добавляться как мессенджер...
// сделать интерфейс, похожий на Телеграм" — live user request). Replaces
// the earlier standalone-modal version of this UI (renderer/chat-widget-ui.js)
// — the chat widget now lives as a real tab, mounted into the tab's content
// pane the same way a <webview> would be, by renderer/webview-tabs-bind.js's
// addWebview() special-casing messenger.native === 'chat-widget' (see that
// file). Backend unchanged — same landing/chat-sites-routes.js this session
// already built and verified.
function createChatWidgetPane({ container, messengerId, authorizedInvoke, invokeIpc, tGet, hasEffectivePro, onUnreadChange }) {
    let site = null
    let conversations = []
    let activeConversationId = null
    let messages = []
    let pollTimer = null
    let destroyed = false

    function esc(str) {
        const div = document.createElement('div')
        div.textContent = String(str == null ? '' : str)
        return div.innerHTML
    }

    function fmtTime(iso) {
        try {
            const d = new Date(iso)
            const now = new Date()
            const sameDay = d.toDateString() === now.toDateString()
            return sameDay
                ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : d.toLocaleDateString([], { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } catch { return '' }
    }

    async function loadSite() {
        const result = await authorizedInvoke('api-chat-site-get')
        site = result.success ? result.data : null
    }

    async function loadConversations() {
        if (!site) return
        const result = await authorizedInvoke('api-chat-site-conversations', site.id)
        if (result.success) conversations = result.data
    }

    async function loadMessagesFresh(conversationId) {
        const result = await authorizedInvoke('api-chat-site-messages', site.id, conversationId)
        if (result.success) messages = result.data.messages
    }

    async function loadMessagesSince(conversationId, since) {
        const result = await authorizedInvoke('api-chat-site-messages', site.id, conversationId, since)
        if (result.success && result.data.messages.length) {
            messages = messages.concat(result.data.messages)
        }
    }

    // ── Views ──────────────────────────────────────────────────────────
    function renderPaywall() {
        container.innerHTML = `
            <div class="chatwidget-paywall">
                <div class="chatwidget-paywall-icon">💬</div>
                <h3>${esc(tGet('chatWidget.paywallTitle') || 'Онлайн-чат для сайта — Pro')}</h3>
                <p>${esc(tGet('chatWidget.paywallDesc') || 'Оформите Pro, чтобы продолжить пользоваться онлайн-чатом.')}</p>
            </div>`
    }

    function renderOnboarding() {
        container.innerHTML = `
            <div class="chatwidget-onboarding">
                <h3>${esc(tGet('chatWidget.setupTitle') || 'Подключите свой сайт')}</h3>
                <p class="chatwidget-hint">${esc(tGet('chatWidget.setupHint') || 'Укажите домен сайта, куда будет установлен виджет — по нему мы проверяем, что чат встроен именно туда.')}</p>
                <label class="chatwidget-label">${esc(tGet('chatWidget.domain') || 'Домен сайта')}</label>
                <input type="text" id="chatWidgetDomainInput-${messengerId}" class="chatwidget-input" placeholder="example.com" maxlength="253">
                <label class="chatwidget-label" style="margin-top:10px;">${esc(tGet('chatWidget.name') || 'Название')}</label>
                <input type="text" id="chatWidgetNameInput-${messengerId}" class="chatwidget-input" placeholder="${esc(tGet('chatWidget.namePlaceholder') || 'Мой сайт')}" maxlength="100">
                <div id="chatWidgetSetupMsg-${messengerId}" class="chatwidget-msg-status" style="display:none;margin-top:10px;"></div>
                <button class="chatwidget-btn-primary" id="chatWidgetSetupBtn-${messengerId}" style="margin-top:14px;">${esc(tGet('chatWidget.connect') || 'Подключить')}</button>
            </div>`

        container.querySelector(`#chatWidgetSetupBtn-${messengerId}`)?.addEventListener('click', async () => {
            const domain = container.querySelector(`#chatWidgetDomainInput-${messengerId}`)?.value.trim()
            const name = container.querySelector(`#chatWidgetNameInput-${messengerId}`)?.value.trim()
            const msgEl = container.querySelector(`#chatWidgetSetupMsg-${messengerId}`)
            if (!domain) return
            const result = await authorizedInvoke('api-chat-site-create', { domain, name })
            if (result.success) {
                site = result.data
                await render()
            } else if (msgEl) {
                msgEl.style.display = 'block'
                msgEl.className = 'chatwidget-msg-status err'
                msgEl.textContent = result.error || (tGet('chatWidget.setupError') || 'Не удалось подключить сайт')
            }
        })
    }

    function embedSnippet() {
        return `<script src="https://centrio.me/widget.js" data-token="${site.widgetToken}"></script>`
    }

    function renderMain() {
        const listHtml = conversations.length === 0
            ? `<div class="app-notif-empty">${esc(tGet('chatWidget.noConversations') || 'Пока нет диалогов')}</div>`
            : conversations.map(c => {
                const preview = c.lastMessage ? (c.lastMessage.fromVisitor ? '' : (tGet('chatWidget.you') || 'Вы: ')) + c.lastMessage.body : ''
                const isActive = c.id === activeConversationId
                const initial = (c.visitorName || c.visitorContact || '?').charAt(0).toUpperCase()
                return `
                    <div class="chatwidget-conv-item ${isActive ? 'active' : ''} ${c.status === 'CLOSED' ? 'closed' : ''}" data-id="${esc(c.id)}">
                        <div class="chatwidget-conv-avatar">${esc(initial)}</div>
                        <div class="chatwidget-conv-info">
                            <div class="chatwidget-conv-name">${esc(c.visitorName || c.visitorContact || (tGet('chatWidget.anonymous') || 'Гость'))}</div>
                            <div class="chatwidget-conv-preview">${esc(preview)}</div>
                        </div>
                        <div class="chatwidget-conv-time">${fmtTime(c.lastMessageAt)}</div>
                    </div>`
            }).join('')

        const activeConv = conversations.find(c => c.id === activeConversationId)

        let threadHtml
        if (!activeConv) {
            threadHtml = `<div class="chatwidget-thread-empty">${esc(tGet('chatWidget.selectConversation') || 'Выберите диалог слева')}</div>`
        } else {
            const msgsHtml = messages.map(m => `
                <div class="chatwidget-msg ${m.fromVisitor ? 'visitor' : 'operator'}">
                    <div class="chatwidget-msg-body">${esc(m.body)}</div>
                    <div class="chatwidget-msg-time">${fmtTime(m.createdAt)}</div>
                </div>`).join('')

            threadHtml = `
                <div class="chatwidget-thread-header">
                    <div class="chatwidget-conv-avatar">${esc((activeConv.visitorName || activeConv.visitorContact || '?').charAt(0).toUpperCase())}</div>
                    <div style="flex:1;min-width:0;">
                        <div class="chatwidget-thread-name">${esc(activeConv.visitorName || (tGet('chatWidget.anonymous') || 'Гость'))}</div>
                        ${activeConv.visitorContact ? `<div class="chatwidget-thread-contact">${esc(activeConv.visitorContact)}</div>` : ''}
                    </div>
                    <button class="chatwidget-btn-secondary" id="chatWidgetToggleStatusBtn-${messengerId}" data-status="${activeConv.status}">
                        ${activeConv.status === 'CLOSED' ? esc(tGet('chatWidget.reopen') || 'Открыть снова') : esc(tGet('chatWidget.close') || 'Закрыть диалог')}
                    </button>
                </div>
                <div class="chatwidget-thread-body" id="chatWidgetThreadBody-${messengerId}">${msgsHtml}</div>
                <div class="chatwidget-thread-reply">
                    <textarea id="chatWidgetReplyInput-${messengerId}" placeholder="${esc(tGet('chatWidget.replyPlaceholder') || 'Ответить…')}" maxlength="4000"></textarea>
                    <button class="chatwidget-btn-primary" id="chatWidgetSendBtn-${messengerId}">${esc(tGet('chatWidget.send') || 'Отправить')}</button>
                </div>`
        }

        container.innerHTML = `
            <div class="chatwidget-layout chatwidget-layout-pane">
                <div class="chatwidget-sidebar">
                    <div class="chatwidget-embed-box">
                        <div class="chatwidget-embed-label">${esc(tGet('chatWidget.embedLabel') || 'Код для вставки на сайт')}</div>
                        <code class="chatwidget-embed-code">${esc(embedSnippet())}</code>
                        <button class="chatwidget-btn-secondary" id="chatWidgetCopyBtn-${messengerId}">${esc(tGet('chatWidget.copy') || 'Скопировать')}</button>
                    </div>
                    <div class="chatwidget-conv-list">${listHtml}</div>
                </div>
                <div class="chatwidget-thread">${threadHtml}</div>
            </div>`

        container.querySelector(`#chatWidgetCopyBtn-${messengerId}`)?.addEventListener('click', () => {
            invokeIpc('copy-text-to-clipboard', embedSnippet()).catch(() => {})
        })

        container.querySelectorAll('.chatwidget-conv-item').forEach(el => {
            el.addEventListener('click', () => openConversation(el.dataset.id))
        })

        container.querySelector(`#chatWidgetToggleStatusBtn-${messengerId}`)?.addEventListener('click', async (e) => {
            const nextStatus = e.currentTarget.dataset.status === 'CLOSED' ? 'OPEN' : 'CLOSED'
            const result = await authorizedInvoke('api-chat-site-set-status', site.id, activeConversationId, nextStatus)
            if (result.success) {
                await loadConversations()
                renderMain()
            }
        })

        const sendReply = async () => {
            const input = container.querySelector(`#chatWidgetReplyInput-${messengerId}`)
            const text = input?.value.trim()
            if (!text || !activeConversationId) return
            input.value = ''
            const result = await authorizedInvoke('api-chat-site-reply', site.id, activeConversationId, text)
            if (result.success) {
                messages.push(result.data)
                await loadConversations()
                renderMain()
                const threadBody = container.querySelector(`#chatWidgetThreadBody-${messengerId}`)
                if (threadBody) threadBody.scrollTop = threadBody.scrollHeight
            }
        }
        container.querySelector(`#chatWidgetSendBtn-${messengerId}`)?.addEventListener('click', sendReply)
        container.querySelector(`#chatWidgetReplyInput-${messengerId}`)?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
        })

        const threadBody = container.querySelector(`#chatWidgetThreadBody-${messengerId}`)
        if (threadBody) threadBody.scrollTop = threadBody.scrollHeight
    }

    async function openConversation(id) {
        activeConversationId = id
        await loadMessagesFresh(id)
        renderMain()
    }

    async function render() {
        if (destroyed) return
        if (!hasEffectivePro()) { renderPaywall(); return }
        await loadSite()
        if (destroyed) return
        if (!site) { renderOnboarding(); return }
        await loadConversations()
        if (destroyed) return
        renderMain()
    }

    function totalUnread() {
        // "Unread" for the owner = visitor messages in conversations that
        // haven't been replied to since — approximated here as any OPEN
        // conversation whose last message is from the visitor (mirrors the
        // simple heuristic already used for the read-status stats feature
        // earlier this session: no per-message read-receipt table exists).
        return conversations.filter(c => c.status === 'OPEN' && c.lastMessage && c.lastMessage.fromVisitor).length
    }

    function startPolling() {
        stopPolling()
        pollTimer = setInterval(async () => {
            if (destroyed || !site) return
            const prevUnread = totalUnread()
            await loadConversations()
            if (destroyed) return
            if (activeConversationId) {
                const last = messages[messages.length - 1]
                await loadMessagesSince(activeConversationId, last ? last.createdAt : null)
            }
            renderMain()
            const nextUnread = totalUnread()
            if (nextUnread !== prevUnread) onUnreadChange?.(nextUnread)
        }, 5000)
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
    }

    function mount() {
        render()
        startPolling()
    }

    function destroy() {
        destroyed = true
        stopPolling()
    }

    return { mount, destroy }
}

module.exports = { createChatWidgetPane }
