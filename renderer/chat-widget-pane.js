// FEATURE (2026-09-11, "Онлайн чат должен добавляться как мессенджер...
// сделать интерфейс, похожий на Телеграм" — live user request). Replaces
// the earlier standalone-modal version of this UI (renderer/chat-widget-ui.js)
// — the chat widget now lives as a real tab, mounted into the tab's content
// pane the same way a <webview> would be, by renderer/webview-tabs-bind.js's
// addWebview() special-casing messenger.native === 'chat-widget' (see that
// file). Backend unchanged — same landing/chat-sites-routes.js this session
// already built and verified.
// FEATURE (2026-09-12, "функционал расширь" — live user request): a few
// ready-made replies to insert with one click, Jivo/Intercom-style. Stored
// locally per messenger (no server model needed for something this small
// and account-local) via the same `store` shim every other renderer module
// already uses.
const DEFAULT_CANNED_REPLIES = [
    'Здравствуйте! Спасибо за обращение, сейчас посмотрю ваш вопрос.',
    'Уточните, пожалуйста, номер заказа?',
    'Передал ваш вопрос коллеге, ответим в ближайшее время.',
    'Спасибо за обращение! Хорошего дня.'
]

function createChatWidgetPane({ container, messengerId, authorizedInvoke, invokeIpc, ipcRenderer, store, tGet, hasEffectivePro, onUnreadChange }) {
    let site = null
    let conversations = []
    let activeConversationId = null
    let messages = []
    let pollTimer = null
    let destroyed = false
    let settingsOpen = false
    // FEATURE (2026-09-12, "функционал расширь" — live user request):
    // search + open/all filter for the conversation list, useful once it
    // grows past a handful of visitors.
    let convFilter = 'open'
    let convSearch = ''
    let cannedOpen = false

    function getCannedReplies() {
        return store?.get(`chatWidgetCannedReplies-${messengerId}`, DEFAULT_CANNED_REPLIES) ?? DEFAULT_CANNED_REPLIES
    }

    function saveCannedReplies(list) {
        store?.set(`chatWidgetCannedReplies-${messengerId}`, list)
    }
    // FEATURE (2026-09-12, "функционал расширь" — live user request): a
    // desktop notification (same channel every other messenger already
    // uses) when a NEW visitor message shows up, so the owner doesn't have
    // to keep the chat tab open/focused to notice one. Tracked by message
    // id so a poll tick never re-notifies for the same message twice.
    const notifiedMessageIds = new Set()

    // BUGFIX (2026-09-11, "data-token=undefined... сообщение с сайта не
    // отправляется" — live user report): main/ipc/api.js's wrapApi() wraps
    // EVERY IPC call's raw HTTP body as `{success:true, data: <body>}` —
    // that's the right layer for endpoints whose body IS the payload
    // (sync.js, notes.js, tickets.js all just `res.json(payload)` directly,
    // no envelope of their own). This session's newer routes
    // (chat-sites-routes.js, widget-routes.js, org-routes.js) instead
    // followed a `res.json({success, data})` convention of their OWN — so a
    // successful call here actually resolves to
    // `{success:true, data:{success:true, data:<real payload>}}`, one level
    // deeper than every call site below assumed. `unwrap()` peels that
    // extra layer off in one place instead of fixing it at each call site.
    function unwrap(result) {
        return result?.success && result.data?.success ? result.data.data : undefined
    }

    // FEATURE (2026-09-12, live visual review — "не должна уступать по
    // дизайну мессенджеру"): every avatar rendering the same flat --accent
    // color made a multi-conversation list look monotonous at a glance —
    // real messengers (Telegram, WhatsApp) assign each contact a distinct
    // color. Deterministic (same name always gets the same color, no
    // flicker on re-render) rather than random.
    const AVATAR_GRADIENTS = [
        ['#6366f1', '#818cf8'], ['#ec4899', '#f472b6'], ['#22c55e', '#4ade80'],
        ['#f59e0b', '#fbbf24'], ['#06b6d4', '#22d3ee'], ['#8b5cf6', '#a78bfa'],
        ['#ef4444', '#f87171'], ['#14b8a6', '#2dd4bf']
    ]
    function avatarGradient(seed) {
        let hash = 0
        for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
        const [c1, c2] = AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]
        return `background:linear-gradient(135deg, ${c1}, ${c2});box-shadow:0 2px 8px ${c1}40;`
    }

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
        site = unwrap(result) ?? null
    }

    let seededNotifiedIds = false

    async function loadConversations() {
        if (!site) return
        const result = await authorizedInvoke('api-chat-site-conversations', site.id)
        const data = unwrap(result)
        if (!data) return

        if (!seededNotifiedIds) {
            // First load after mount — these are pre-existing messages, not
            // "new" ones; seed the set so they're not notified once, then
            // never again until the site changes (which reloads a fresh
            // pane/instance anyway).
            data.forEach(c => { if (c.lastMessage) notifiedMessageIds.add(c.lastMessage.id) })
            seededNotifiedIds = true
        } else {
            notifyNewVisitorMessages(data)
        }
        conversations = data
    }

    function notifyNewVisitorMessages(freshConversations) {
        freshConversations.forEach(c => {
            const lm = c.lastMessage
            if (!lm || !lm.fromVisitor || notifiedMessageIds.has(lm.id)) return
            notifiedMessageIds.add(lm.id)
            ipcRenderer?.send('show-notification', {
                title: c.visitorName || c.visitorContact || tGet('chatWidget.anonymous') || 'Гость',
                body: lm.body,
                messengerId
            })
        })
    }

    async function loadMessagesFresh(conversationId) {
        const result = await authorizedInvoke('api-chat-site-messages', site.id, conversationId)
        const data = unwrap(result)
        if (data) messages = data.messages
    }

    async function loadMessagesSince(conversationId, since) {
        const result = await authorizedInvoke('api-chat-site-messages', site.id, conversationId, since)
        const data = unwrap(result)
        if (data && data.messages.length) {
            messages = messages.concat(data.messages)
        }
    }

    // FEATURE (2026-09-11, "внешний вид окна нужно давать настраивать
    // клиентам... лого можно ставить свой" — live user request).
    async function saveColor(color) {
        const result = await authorizedInvoke('api-chat-site-update', site.id, { color })
        const data = unwrap(result)
        if (data) site = data
        return !!data
    }

    async function uploadLogo(fileObj) {
        const buffer = await fileObj.arrayBuffer()
        const result = await authorizedInvoke('api-chat-site-upload-logo', site.id, {
            buffer,
            name: fileObj.name,
            type: fileObj.type
        })
        const data = unwrap(result)
        if (data) site = { ...site, widgetLogoUrl: data.widgetLogoUrl }
        return !!data
    }

    async function removeLogo() {
        const result = await authorizedInvoke('api-chat-site-delete-logo', site.id)
        if (result?.success) site = { ...site, widgetLogoUrl: null }
        return !!result?.success
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

        container.querySelector(`#chatWidgetSetupBtn-${messengerId}`)?.addEventListener('click', async (e) => {
            // BUGFIX (2026-09-11, "Слишком много запросов, попробуйте
            // позже" on the user's FIRST real attempt — live report): there
            // was no disabled-while-in-flight guard here, so impatiently
            // re-clicking "Подключить" (especially likely during the
            // earlier double-envelope bug, when a genuinely successful
            // create still LOOKED like nothing happened) fired one POST
            // /api/chat-sites per click — each one counting separately
            // against the 10/hour rate limit regardless of whether the
            // account already had a site (a repeat click after the first
            // success just gets a 409, but still consumes a request slot).
            const btn = e.currentTarget
            if (btn.disabled) return
            const domain = container.querySelector(`#chatWidgetDomainInput-${messengerId}`)?.value.trim()
            const name = container.querySelector(`#chatWidgetNameInput-${messengerId}`)?.value.trim()
            const msgEl = container.querySelector(`#chatWidgetSetupMsg-${messengerId}`)
            if (!domain) return
            btn.disabled = true
            const result = await authorizedInvoke('api-chat-site-create', { domain, name })
            const data = unwrap(result)
            if (data) {
                site = data
                await render()
            } else if (msgEl) {
                btn.disabled = false
                msgEl.style.display = 'block'
                msgEl.className = 'chatwidget-msg-status err'
                msgEl.textContent = result.error || (tGet('chatWidget.setupError') || 'Не удалось подключить сайт')
            }
        })
    }

    function embedSnippet() {
        return `<script src="https://centrio.me/widget.js" data-token="${site.widgetToken}"></script>`
    }

    function visibleConversations() {
        const q = convSearch.trim().toLowerCase()
        return conversations.filter(c => {
            if (convFilter === 'open' && c.status === 'CLOSED') return false
            if (!q) return true
            const haystack = `${c.visitorName || ''} ${c.visitorContact || ''}`.toLowerCase()
            return haystack.includes(q)
        })
    }

    function renderConvItem(c) {
        const preview = c.lastMessage ? (c.lastMessage.fromVisitor ? '' : (tGet('chatWidget.you') || 'Вы: ')) + c.lastMessage.body : ''
        const isActive = c.id === activeConversationId
        const needsReply = c.status === 'OPEN' && c.lastMessage && c.lastMessage.fromVisitor
        const initial = (c.visitorName || c.visitorContact || '?').charAt(0).toUpperCase()
        return `
            <div class="chatwidget-conv-item ${isActive ? 'active' : ''} ${c.status === 'CLOSED' ? 'closed' : ''} ${needsReply ? 'needs-reply' : ''}" data-id="${esc(c.id)}">
                <div class="chatwidget-conv-avatar" style="${avatarGradient(c.visitorName || c.visitorContact || c.id)}">${esc(initial)}</div>
                <div class="chatwidget-conv-info">
                    <div class="chatwidget-conv-name">${esc(c.visitorName || c.visitorContact || (tGet('chatWidget.anonymous') || 'Гость'))}</div>
                    <div class="chatwidget-conv-preview">${esc(preview)}</div>
                </div>
                <div class="chatwidget-conv-time">${fmtTime(c.lastMessageAt)}</div>
            </div>`
    }

    function bindConvItemClicks(listEl) {
        listEl.querySelectorAll('.chatwidget-conv-item').forEach(el => {
            el.addEventListener('click', () => openConversation(el.dataset.id))
        })
    }

    function renderMain() {
        const filtered = visibleConversations()
        const listHtml = filtered.length === 0
            ? `<div class="app-notif-empty">${esc(tGet('chatWidget.noConversations') || 'Пока нет диалогов')}</div>`
            : filtered.map(renderConvItem).join('')

        const activeConv = conversations.find(c => c.id === activeConversationId)

        let threadHtml
        if (!activeConv) {
            threadHtml = `<div class="chatwidget-thread-empty">${esc(tGet('chatWidget.selectConversation') || 'Выберите диалог слева')}</div>`
        } else {
            const msgsHtml = messages.map(m => `
                <div class="chatwidget-msg ${m.fromVisitor ? 'visitor' : 'operator'}">
                    <div class="chatwidget-msg-body">${esc(m.body)}<span class="chatwidget-msg-time-inline">${fmtTime(m.createdAt)}</span></div>
                </div>`).join('')

            threadHtml = `
                <div class="chatwidget-thread-header">
                    <div class="chatwidget-conv-avatar" style="${avatarGradient(activeConv.visitorName || activeConv.visitorContact || activeConv.id)}">${esc((activeConv.visitorName || activeConv.visitorContact || '?').charAt(0).toUpperCase())}</div>
                    <div style="flex:1;min-width:0;">
                        <div class="chatwidget-thread-name">${esc(activeConv.visitorName || (tGet('chatWidget.anonymous') || 'Гость'))}</div>
                        ${activeConv.visitorContact ? `<div class="chatwidget-thread-contact">${esc(activeConv.visitorContact)}</div>` : ''}
                    </div>
                    <button class="chatwidget-btn-secondary chatwidget-btn-compact" id="chatWidgetToggleStatusBtn-${messengerId}" data-status="${activeConv.status}">
                        ${activeConv.status === 'CLOSED' ? esc(tGet('chatWidget.reopen') || 'Открыть') : esc(tGet('chatWidget.close') || 'Закрыть')}
                    </button>
                </div>
                <div class="chatwidget-thread-body" id="chatWidgetThreadBody-${messengerId}">${msgsHtml}</div>
                <div class="chatwidget-canned-popover ${cannedOpen ? 'open' : ''}" id="chatWidgetCannedPopover-${messengerId}">
                    ${getCannedReplies().map((r, i) => `
                        <div class="chatwidget-canned-item" data-index="${i}">
                            <span class="chatwidget-canned-text">${esc(r)}</span>
                            <button class="chatwidget-canned-remove" data-index="${i}" title="${esc(tGet('chatWidget.cannedRemove') || 'Удалить')}">&times;</button>
                        </div>`).join('') || `<div class="chatwidget-canned-empty">${esc(tGet('chatWidget.cannedEmpty') || 'Нет заготовок')}</div>`}
                    <div class="chatwidget-canned-add">
                        <input type="text" id="chatWidgetCannedInput-${messengerId}" placeholder="${esc(tGet('chatWidget.cannedAddPlaceholder') || 'Новая заготовка…')}" maxlength="500">
                        <button class="chatwidget-btn-secondary chatwidget-btn-compact" id="chatWidgetCannedAddBtn-${messengerId}">${esc(tGet('chatWidget.cannedAdd') || 'Добавить')}</button>
                    </div>
                </div>
                <div class="chatwidget-thread-reply">
                    <button class="chatwidget-settings-btn chatwidget-canned-btn" id="chatWidgetCannedBtn-${messengerId}" title="${esc(tGet('chatWidget.cannedReplies') || 'Заготовленные ответы')}">
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M13 2 3 14h7l-1 8 10-12h-7z"/>
                        </svg>
                    </button>
                    <textarea id="chatWidgetReplyInput-${messengerId}" placeholder="${esc(tGet('chatWidget.replyPlaceholder') || 'Ответить…')}" maxlength="4000"></textarea>
                    <button class="chatwidget-btn-primary" id="chatWidgetSendBtn-${messengerId}">${esc(tGet('chatWidget.send') || 'Отправить')}</button>
                </div>`
        }

        const widgetColor = site.widgetColor || '#5AA9FF'
        const widgetLogoUrl = site.widgetLogoUrl

        // FEATURE (2026-09-11, "она не должна уступать по дизайну
        // мессенджеру... все настройки спрячь" — live user request): embed
        // code + appearance controls used to sit permanently in the
        // sidebar, competing with the conversation list for space and
        // making the tab look like a settings form rather than a
        // messenger. Both now live behind a single gear icon → popover,
        // closed by default; the sidebar itself only ever shows a small
        // header + the conversation list, same balance a real messenger
        // tab keeps.
        container.innerHTML = `
            <div class="chatwidget-layout chatwidget-layout-pane">
                <div class="chatwidget-sidebar">
                    <div class="chatwidget-sidebar-header">
                        <div class="chatwidget-sidebar-title-wrap">
                            <span class="chatwidget-sidebar-title">${esc(site.name || tGet('chatWidget.title') || 'Чат для сайта')}</span>
                            <span class="chatwidget-alpha-badge" title="${esc(tGet('chatWidget.alphaHint') || 'Функция в разработке — возможны ошибки и изменения')}">${esc(tGet('chatWidget.alphaBadge') || 'ALPHA')}</span>
                        </div>
                        <button class="chatwidget-settings-btn" id="chatWidgetSettingsBtn-${messengerId}" title="${esc(tGet('chatWidget.settings') || 'Настройки виджета')}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="chatwidget-conv-toolbar">
                        <input type="text" id="chatWidgetSearchInput-${messengerId}" class="chatwidget-conv-search" placeholder="${esc(tGet('chatWidget.search') || 'Поиск…')}" value="${esc(convSearch)}">
                        <div class="chatwidget-conv-filter-tabs">
                            <button class="chatwidget-filter-tab ${convFilter === 'open' ? 'active' : ''}" data-filter="open">${esc(tGet('chatWidget.filterOpen') || 'Открытые')}</button>
                            <button class="chatwidget-filter-tab ${convFilter === 'all' ? 'active' : ''}" data-filter="all">${esc(tGet('chatWidget.filterAll') || 'Все')}</button>
                        </div>
                    </div>
                    <div class="chatwidget-conv-list" id="chatWidgetConvList-${messengerId}">${listHtml}</div>
                </div>
                <div class="chatwidget-thread">${threadHtml}</div>
            </div>
            <div class="chatwidget-settings-popover ${settingsOpen ? 'open' : ''}" id="chatWidgetSettingsPopover-${messengerId}">
                <div class="chatwidget-settings-popover-header">
                    <span>${esc(tGet('chatWidget.settings') || 'Настройки виджета')}</span>
                    <button class="chatwidget-settings-close" id="chatWidgetSettingsCloseBtn-${messengerId}">&times;</button>
                </div>
                <div class="chatwidget-embed-box">
                    <div class="chatwidget-embed-label">${esc(tGet('chatWidget.embedLabel') || 'Код для вставки на сайт')}</div>
                    <code class="chatwidget-embed-code">${esc(embedSnippet())}</code>
                    <button class="chatwidget-btn-secondary" id="chatWidgetCopyBtn-${messengerId}">${esc(tGet('chatWidget.copy') || 'Скопировать')}</button>
                </div>
                <div class="chatwidget-appearance-box">
                    <div class="chatwidget-embed-label">${esc(tGet('chatWidget.appearance') || 'Внешний вид виджета')}</div>
                    <div class="chatwidget-appearance-row">
                        <span class="chatwidget-appearance-rowlabel">${esc(tGet('chatWidget.color') || 'Цвет')}</span>
                        <input type="color" id="chatWidgetColorInput-${messengerId}" value="${esc(widgetColor)}">
                    </div>
                    <div class="chatwidget-appearance-row">
                        <span class="chatwidget-appearance-rowlabel">${esc(tGet('chatWidget.logo') || 'Логотип')}</span>
                        <div class="chatwidget-appearance-logo-controls">
                            ${widgetLogoUrl ? `<img src="${esc(widgetLogoUrl)}" class="chatwidget-appearance-logo-preview" alt="">` : ''}
                            <label class="chatwidget-btn-secondary chatwidget-logo-upload-label">
                                ${esc(tGet('chatWidget.uploadLogo') || 'Загрузить')}
                                <input type="file" accept="image/*" id="chatWidgetLogoInput-${messengerId}" style="display:none;">
                            </label>
                            ${widgetLogoUrl ? `<button class="chatwidget-btn-secondary" id="chatWidgetRemoveLogoBtn-${messengerId}">${esc(tGet('chatWidget.removeLogo') || 'Сбросить')}</button>` : ''}
                        </div>
                    </div>
                    <div id="chatWidgetAppearanceMsg-${messengerId}" class="chatwidget-msg-status" style="display:none;"></div>
                </div>
            </div>`

        const settingsBtn = container.querySelector(`#chatWidgetSettingsBtn-${messengerId}`)
        const settingsPopover = container.querySelector(`#chatWidgetSettingsPopover-${messengerId}`)
        settingsBtn?.addEventListener('click', (e) => {
            e.stopPropagation()
            settingsOpen = !settingsOpen
            settingsPopover?.classList.toggle('open', settingsOpen)
        })
        container.querySelector(`#chatWidgetSettingsCloseBtn-${messengerId}`)?.addEventListener('click', () => {
            settingsOpen = false
            settingsPopover?.classList.remove('open')
        })

        container.querySelector(`#chatWidgetCopyBtn-${messengerId}`)?.addEventListener('click', () => {
            invokeIpc('copy-text-to-clipboard', embedSnippet()).catch(() => {})
        })

        // Re-render only the list (not the whole pane) on search/filter
        // changes — re-running renderMain() on every keystroke would also
        // rebuild the thread pane and drop focus from the input itself.
        function rerenderConvListOnly() {
            const listEl = container.querySelector(`#chatWidgetConvList-${messengerId}`)
            if (!listEl) return
            const filtered = visibleConversations()
            listEl.innerHTML = filtered.length === 0
                ? `<div class="app-notif-empty">${esc(tGet('chatWidget.noConversations') || 'Пока нет диалогов')}</div>`
                : filtered.map(renderConvItem).join('')
            bindConvItemClicks(listEl)
        }

        const searchInput = container.querySelector(`#chatWidgetSearchInput-${messengerId}`)
        searchInput?.addEventListener('input', () => {
            convSearch = searchInput.value
            rerenderConvListOnly()
        })

        container.querySelectorAll(`.chatwidget-filter-tab`).forEach(tab => {
            tab.addEventListener('click', () => {
                convFilter = tab.dataset.filter
                renderMain()
                // Re-focus the search box after a full re-render (only
                // needed for the filter tabs, which do trigger a full
                // renderMain — the search input's own listener uses the
                // lighter list-only path above and never loses focus).
                container.querySelector(`#chatWidgetSearchInput-${messengerId}`)?.focus()
            })
        })

        const appearanceMsgEl = container.querySelector(`#chatWidgetAppearanceMsg-${messengerId}`)
        function showAppearanceMsg(text, isErr) {
            if (!appearanceMsgEl) return
            appearanceMsgEl.style.display = 'block'
            appearanceMsgEl.className = `chatwidget-msg-status${isErr ? ' err' : ''}`
            appearanceMsgEl.textContent = text
            setTimeout(() => { appearanceMsgEl.style.display = 'none' }, 2500)
        }

        const colorInput = container.querySelector(`#chatWidgetColorInput-${messengerId}`)
        colorInput?.addEventListener('change', async () => {
            const ok = await saveColor(colorInput.value)
            showAppearanceMsg(
                ok ? (tGet('chatWidget.saved') || 'Сохранено') : (tGet('chatWidget.saveError') || 'Не удалось сохранить'),
                !ok
            )
        })

        container.querySelector(`#chatWidgetLogoInput-${messengerId}`)?.addEventListener('change', async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            if (!file.type.startsWith('image/')) { showAppearanceMsg(tGet('chatWidget.logoTypeError') || 'Можно загрузить только изображение', true); return }
            if (file.size > 5 * 1024 * 1024) { showAppearanceMsg(tGet('chatWidget.logoSizeError') || 'Файл слишком большой (максимум 5 МБ)', true); return }
            const ok = await uploadLogo(file)
            if (ok) renderMain()
            else showAppearanceMsg(tGet('chatWidget.saveError') || 'Не удалось сохранить', true)
        })

        container.querySelector(`#chatWidgetRemoveLogoBtn-${messengerId}`)?.addEventListener('click', async () => {
            const ok = await removeLogo()
            if (ok) renderMain()
        })

        bindConvItemClicks(container.querySelector(`#chatWidgetConvList-${messengerId}`) || container)

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
            const data = unwrap(result)
            if (data) {
                messages.push(data)
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

        const cannedPopover = container.querySelector(`#chatWidgetCannedPopover-${messengerId}`)
        container.querySelector(`#chatWidgetCannedBtn-${messengerId}`)?.addEventListener('click', (e) => {
            e.stopPropagation()
            cannedOpen = !cannedOpen
            cannedPopover?.classList.toggle('open', cannedOpen)
        })
        cannedPopover?.querySelectorAll('.chatwidget-canned-item').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target.closest('.chatwidget-canned-remove')) return
                const replies = getCannedReplies()
                const text = replies[Number(el.dataset.index)]
                const input = container.querySelector(`#chatWidgetReplyInput-${messengerId}`)
                if (input && text) {
                    input.value = text
                    input.focus()
                }
                cannedOpen = false
                cannedPopover.classList.remove('open')
            })
        })
        cannedPopover?.querySelectorAll('.chatwidget-canned-remove').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation()
                const replies = getCannedReplies()
                replies.splice(Number(el.dataset.index), 1)
                saveCannedReplies(replies)
                renderMain()
            })
        })
        container.querySelector(`#chatWidgetCannedAddBtn-${messengerId}`)?.addEventListener('click', () => {
            const input = container.querySelector(`#chatWidgetCannedInput-${messengerId}`)
            const text = input?.value.trim()
            if (!text) return
            const replies = getCannedReplies()
            replies.push(text)
            saveCannedReplies(replies)
            cannedOpen = true
            renderMain()
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
