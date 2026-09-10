// FEATURE (2026-09-11, "встроенный чат-виджет" — Pro). Клиент подключает
// свой сайт (домен) один раз, получает <script> для вставки на сайт (см.
// landing/public/widget.js), и все сообщения посетителей приходят прямо
// сюда, без почты/сторонних сервисов. Один сайт на аккаунт в v1.
//
// Backend (все три поверхности новые, добавлены тем же днём):
//   landing/chat-sites-routes.js — authenticated CRUD для этой панели
//   landing/widget-routes.js     — публичный, без авторизации, для самого виджета
//   landing/public/widget.js     — сам встраиваемый скрипт
function createChatWidgetUi({ authorizedInvoke, invokeIpc, tGet, hasEffectivePro, showUpgradeModal }) {
    const modal = document.getElementById('chatWidgetModal')
    const body = document.getElementById('chatWidgetBody')
    const closeBtn = document.getElementById('closeChatWidgetBtn')
    if (!modal || !body) return {}

    let site = null
    let conversations = []
    let activeConversationId = null
    let messages = []
    let pollTimer = null

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
        body.innerHTML = `
            <div class="chatwidget-paywall">
                <div class="chatwidget-paywall-icon">💬</div>
                <h3>${esc(tGet('chatWidget.paywallTitle') || 'Онлайн-чат для сайта — Pro')}</h3>
                <p>${esc(tGet('chatWidget.paywallDesc') || 'Подключите виджет чата на свой сайт — сообщения посетителей будут приходить прямо сюда, без почты и сторонних сервисов.')}</p>
                <button class="chatwidget-btn-primary" id="chatWidgetUpgradeBtn">${esc(tGet('chatWidget.upgrade') || 'Оформить Pro')}</button>
            </div>`
        document.getElementById('chatWidgetUpgradeBtn')?.addEventListener('click', () => {
            showUpgradeModal(
                tGet('chatWidget.paywallTitle') || 'Онлайн-чат для сайта — Pro',
                tGet('chatWidget.paywallDesc') || 'Подключите виджет чата на свой сайт — сообщения посетителей будут приходить прямо сюда.'
            )
        })
    }

    function renderOnboarding() {
        body.innerHTML = `
            <div class="chatwidget-onboarding">
                <h3>${esc(tGet('chatWidget.setupTitle') || 'Подключите свой сайт')}</h3>
                <p class="chatwidget-hint">${esc(tGet('chatWidget.setupHint') || 'Укажите домен сайта, куда будет установлен виджет — по нему мы проверяем, что чат встроен именно туда.')}</p>
                <label class="chatwidget-label">${esc(tGet('chatWidget.domain') || 'Домен сайта')}</label>
                <input type="text" id="chatWidgetDomainInput" class="chatwidget-input" placeholder="example.com" maxlength="253">
                <label class="chatwidget-label" style="margin-top:10px;">${esc(tGet('chatWidget.name') || 'Название')}</label>
                <input type="text" id="chatWidgetNameInput" class="chatwidget-input" placeholder="${esc(tGet('chatWidget.namePlaceholder') || 'Мой сайт')}" maxlength="100">
                <div id="chatWidgetSetupMsg" class="chatwidget-msg-status" style="display:none;margin-top:10px;"></div>
                <button class="chatwidget-btn-primary" id="chatWidgetSetupBtn" style="margin-top:14px;">${esc(tGet('chatWidget.connect') || 'Подключить')}</button>
            </div>`

        document.getElementById('chatWidgetSetupBtn')?.addEventListener('click', async () => {
            const domain = document.getElementById('chatWidgetDomainInput')?.value.trim()
            const name = document.getElementById('chatWidgetNameInput')?.value.trim()
            const msgEl = document.getElementById('chatWidgetSetupMsg')
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
                return `
                    <div class="chatwidget-conv-item ${isActive ? 'active' : ''} ${c.status === 'CLOSED' ? 'closed' : ''}" data-id="${esc(c.id)}">
                        <div class="chatwidget-conv-name">${esc(c.visitorName || c.visitorContact || (tGet('chatWidget.anonymous') || 'Гость'))}</div>
                        <div class="chatwidget-conv-preview">${esc(preview)}</div>
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
                    <div>
                        <div class="chatwidget-thread-name">${esc(activeConv.visitorName || (tGet('chatWidget.anonymous') || 'Гость'))}</div>
                        ${activeConv.visitorContact ? `<div class="chatwidget-thread-contact">${esc(activeConv.visitorContact)}</div>` : ''}
                    </div>
                    <button class="chatwidget-btn-secondary" id="chatWidgetToggleStatusBtn" data-status="${activeConv.status}">
                        ${activeConv.status === 'CLOSED' ? esc(tGet('chatWidget.reopen') || 'Открыть снова') : esc(tGet('chatWidget.close') || 'Закрыть диалог')}
                    </button>
                </div>
                <div class="chatwidget-thread-body" id="chatWidgetThreadBody">${msgsHtml}</div>
                <div class="chatwidget-thread-reply">
                    <textarea id="chatWidgetReplyInput" placeholder="${esc(tGet('chatWidget.replyPlaceholder') || 'Ответить…')}" maxlength="4000"></textarea>
                    <button class="chatwidget-btn-primary" id="chatWidgetSendBtn">${esc(tGet('chatWidget.send') || 'Отправить')}</button>
                </div>`
        }

        body.innerHTML = `
            <div class="chatwidget-layout">
                <div class="chatwidget-sidebar">
                    <div class="chatwidget-embed-box">
                        <div class="chatwidget-embed-label">${esc(tGet('chatWidget.embedLabel') || 'Код для вставки на сайт')}</div>
                        <code class="chatwidget-embed-code">${esc(embedSnippet())}</code>
                        <button class="chatwidget-btn-secondary" id="chatWidgetCopyBtn">${esc(tGet('chatWidget.copy') || 'Скопировать')}</button>
                    </div>
                    <div class="chatwidget-conv-list">${listHtml}</div>
                </div>
                <div class="chatwidget-thread">${threadHtml}</div>
            </div>`

        document.getElementById('chatWidgetCopyBtn')?.addEventListener('click', () => {
            invokeIpc('copy-text-to-clipboard', embedSnippet()).catch(() => {})
        })

        body.querySelectorAll('.chatwidget-conv-item').forEach(el => {
            el.addEventListener('click', () => openConversation(el.dataset.id))
        })

        document.getElementById('chatWidgetToggleStatusBtn')?.addEventListener('click', async (e) => {
            const nextStatus = e.currentTarget.dataset.status === 'CLOSED' ? 'OPEN' : 'CLOSED'
            const result = await authorizedInvoke('api-chat-site-set-status', site.id, activeConversationId, nextStatus)
            if (result.success) {
                await loadConversations()
                renderMain()
            }
        })

        const sendReply = async () => {
            const input = document.getElementById('chatWidgetReplyInput')
            const text = input?.value.trim()
            if (!text || !activeConversationId) return
            input.value = ''
            const result = await authorizedInvoke('api-chat-site-reply', site.id, activeConversationId, text)
            if (result.success) {
                messages.push(result.data)
                await loadConversations()
                renderMain()
                const threadBody = document.getElementById('chatWidgetThreadBody')
                if (threadBody) threadBody.scrollTop = threadBody.scrollHeight
            }
        }
        document.getElementById('chatWidgetSendBtn')?.addEventListener('click', sendReply)
        document.getElementById('chatWidgetReplyInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
        })

        const threadBody = document.getElementById('chatWidgetThreadBody')
        if (threadBody) threadBody.scrollTop = threadBody.scrollHeight
    }

    async function openConversation(id) {
        activeConversationId = id
        await loadMessagesFresh(id)
        renderMain()
    }

    async function render() {
        if (!hasEffectivePro()) { renderPaywall(); return }
        await loadSite()
        if (!site) { renderOnboarding(); return }
        await loadConversations()
        renderMain()
    }

    function startPolling() {
        stopPolling()
        pollTimer = setInterval(async () => {
            if (!site) return
            await loadConversations()
            if (activeConversationId) {
                const last = messages[messages.length - 1]
                await loadMessagesSince(activeConversationId, last ? last.createdAt : null)
            }
            renderMain()
        }, 5000)
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer)
        pollTimer = null
    }

    function openModal() {
        modal.classList.add('show')
        render()
        startPolling()
    }

    function closeModal() {
        modal.classList.remove('show')
        stopPolling()
    }

    closeBtn?.addEventListener('click', closeModal)
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })

    return { openModal, closeModal }
}

module.exports = { createChatWidgetUi }
