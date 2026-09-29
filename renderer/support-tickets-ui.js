// renderer/support-tickets-ui.js
// FEATURE (2026-09-21, "для PRO поддержка и тикеты доступны прямо из
// приложения. Синхронизируются с ЛК. Даже старые" — live user request):
// thin UI over the SAME Ticket/TicketMessage API the website's own
// dashboard already used (src/routes/tickets.js) — same account, same
// rows, so anything created on centrio.me (including tickets from before
// this feature existed) shows up here automatically. No separate sync step.
//
// REWORKED (2026-09-30, live 5-item feedback — "у поддержки должен быть
// своё всплывающее окно... полноценные уведомления... тикеты работают как
// переписка... с троеточием"): support now owns a standalone #supportModal
// (see index.html) instead of living inside the profile popup, polls for
// live updates instead of needing a manual reopen, shows a real typing
// indicator backed by the server's typingUntil/typingBy fields (see
// tickets.js's GET /:id and support-bot.js/admin.js on the backend), and
// fires real notifications (notification center + sidebar dot + sound)
// through the SAME infra messenger notifications already use
// (addMessengerNotification/playNotifSound/'show-notification' — see
// webview-notify.js for the reference pattern this mirrors).
'use strict'

function bindSupportTicketsUi({
    authorizedInvoke, tGet, hasEffectivePro, ipcRenderer, playNotifSound,
    openCloudLogin, openUrl, cloudStore, addMessengerNotification
}) {
    const modalEl     = document.getElementById('supportModal')
    const listEl      = document.getElementById('supportTicketsList')
    const loadingEl   = document.getElementById('supportTicketsLoading')
    const emptyEl     = document.getElementById('supportTicketsEmpty')
    const listViewEl  = document.getElementById('supportListView')
    const sidebarBadgeEl = document.getElementById('supportSidebarBadge')
    const sidebarBtn     = document.getElementById('supportSidebarBtn')
    const closeBtn1       = document.getElementById('closeSupportModalBtn')
    const closeBtn2       = document.getElementById('closeSupportModalBtn2')

    const newBtn      = document.getElementById('supportNewTicketBtn')
    const newForm      = document.getElementById('supportNewTicketForm')
    const newSubject   = document.getElementById('supportNewSubject')
    const newBody      = document.getElementById('supportNewBody')
    const newCancelBtn = document.getElementById('supportNewCancelBtn')
    const newSubmitBtn = document.getElementById('supportNewSubmitBtn')
    const newErrorEl   = document.getElementById('supportNewError')

    const threadView    = document.getElementById('ticketThreadView')
    const backBtn        = document.getElementById('ticketThreadBackBtn')
    const subjectEl       = document.getElementById('ticketThreadSubject')
    const statusPillEl    = document.getElementById('ticketThreadStatus')
    const messagesEl      = document.getElementById('ticketThreadMessages')
    const typingIndicatorEl = document.getElementById('ticketTypingIndicator')
    const typingLabelEl     = document.getElementById('ticketTypingLabel')
    const replyInput     = document.getElementById('ticketReplyInput')
    const replySendBtn   = document.getElementById('ticketReplySendBtn')
    const replyErrorEl   = document.getElementById('ticketReplyError')

    if (!modalEl || !listEl) return { }

    let currentTicketId = null
    let threadPollTimer = null
    let listPollTimer = null
    let knownMessageIds = new Set()

    const STATUS_LABELS = {
        OPEN:     () => tGet('cloud.supportStatusOpen'),
        ANSWERED: () => tGet('cloud.supportStatusAnswered'),
        CLOSED:   () => tGet('cloud.supportStatusClosed')
    }

    function statusLabel(status) {
        const fn = STATUS_LABELS[status]
        return fn ? fn() : status
    }

    function fmtDate(iso) {
        try {
            return new Date(iso).toLocaleString(undefined, {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit'
            })
        } catch {
            return ''
        }
    }

    // Persisted per-ticket "last seen message count" — used both to know
    // when a NEW admin/bot reply landed (for notifications, see
    // checkForNewReplies below) and to seed a baseline on first-ever run so
    // existing already-answered tickets don't all notify at once the first
    // time this feature loads on a given install.
    const SEEN_COUNTS_KEY = 'centrio-support-seen-counts'
    function getSeenCounts() {
        try { return JSON.parse(localStorage.getItem(SEEN_COUNTS_KEY) || '{}') }
        catch { return {} }
    }
    function setSeenCounts(map) {
        try { localStorage.setItem(SEEN_COUNTS_KEY, JSON.stringify(map)) } catch {}
    }

    function updateBadge(hasUnnotified) {
        if (!sidebarBadgeEl) return
        sidebarBadgeEl.style.display = hasUnnotified ? '' : 'none'
    }

    // FEATURE (2026-09-30, item 3/4 — "полноценные уведомления... на
    // иконке поддержки справа сверху синий кружочек... звук"): compares
    // each ticket's message count against what we last saw. A count that
    // went UP while status is ANSWERED or CLOSED is unambiguously a new
    // reply from a human admin or the bot — a user's own reply always
    // flips status back to OPEN first (see tickets.js's POST
    // /:id/messages), so this can never misfire on the user's own message.
    // This also fixes the older badge logic, which only checked
    // status==='ANSWERED' and silently missed every bot-closed ticket.
    async function checkForNewReplies(tickets, { seedOnly = false } = {}) {
        const seen = getSeenCounts()
        let anyUnnotified = false
        const isThreadOpen = modalEl.classList.contains('show') && threadView.style.display !== 'none'

        for (const t of tickets) {
            const count = t._count?.messages || 0
            const prevCount = seen[t.id]
            const isNewReply = prevCount !== undefined && count > prevCount &&
                (t.status === 'ANSWERED' || t.status === 'CLOSED')

            if (isNewReply && !seedOnly) {
                // The currently-open thread already shows the message live
                // via pollThreadOnce() below — no need for a duplicate
                // notification for the exact ticket the user is looking at.
                if (!(isThreadOpen && currentTicketId === t.id)) {
                    anyUnnotified = true
                    fireReplyNotification(t).catch(() => {})
                }
            }
            seen[t.id] = count
        }
        setSeenCounts(seen)
        return anyUnnotified
    }

    async function fireReplyNotification(ticket) {
        const result = await authorizedInvoke('api-tickets-get', ticket.id).catch(() => null)
        if (!result?.success || !result.data) return
        const messages = result.data.messages || []
        const last = messages[messages.length - 1]
        if (!last || !last.isAdmin) return

        const isBot = !!last.isBot
        const title = isBot ? tGet('cloud.supportTypingBot').replace('…', '') : tGet('cloud.supportSection')
        const body = (last.body || '').slice(0, 200)

        if (typeof addMessengerNotification === 'function') {
            addMessengerNotification(title, body, ticket.subject, null, null)
        }
        playNotifSound?.(null)
        try {
            ipcRenderer?.send?.('show-notification', {
                title: ticket.subject || title,
                body,
                icon: '',
                silent: true
            })
        } catch {}
        updateBadge(true)
    }

    async function loadTickets({ seedOnly = false } = {}) {
        if (typeof authorizedInvoke !== 'function') return
        loadingEl.style.display = ''
        emptyEl.style.display = 'none'
        listEl.textContent = ''

        const result = await authorizedInvoke('api-tickets-list').catch(() => null)
        loadingEl.style.display = 'none'

        const tickets = result?.success ? (result.data?.tickets || []) : []
        const hasUnnotified = await checkForNewReplies(tickets, { seedOnly })
        if (!hasUnnotified) updateBadge(false)

        if (tickets.length === 0) {
            emptyEl.style.display = ''
            return
        }

        tickets.forEach((t) => {
            const row = document.createElement('div')
            row.className = 'cp-ticket-row'

            const main = document.createElement('div')
            main.className = 'cp-ticket-main'
            const subj = document.createElement('div')
            subj.className = 'cp-ticket-subject'
            subj.textContent = t.subject
            const meta = document.createElement('div')
            meta.className = 'cp-ticket-meta'
            meta.textContent = fmtDate(t.updatedAt)
            main.appendChild(subj)
            main.appendChild(meta)

            const pill = document.createElement('span')
            pill.className = `cp-ticket-status-pill cp-ticket-status-${(t.status || '').toLowerCase()}`
            pill.textContent = statusLabel(t.status)

            row.appendChild(main)
            row.appendChild(pill)
            row.addEventListener('click', () => openThread(t.id))
            listEl.appendChild(row)
        })
    }

    // Тихий фоновый поллинг (2026-09-29, доработан 2026-09-30 под живые
    // уведомления) — раз в 20с вместо прежних 5 минут: минимально ощутимо
    // при таком редком типе трафика (тикеты поддержки), но достаточно
    // быстро, чтобы синий кружок/уведомление реально ощущались "в реальном
    // времени" (item 3), а не только после следующего открытия попапа.
    const LIST_POLL_MS = 20 * 1000
    async function pollListQuietly() {
        if (typeof hasEffectivePro !== 'function' || !hasEffectivePro()) return
        if (typeof authorizedInvoke !== 'function') return
        const result = await authorizedInvoke('api-tickets-list').catch(() => null)
        if (!result?.success) return
        const tickets = result.data?.tickets || []
        const hasUnnotified = await checkForNewReplies(tickets)
        if (!hasUnnotified) updateBadge(false)
        // If the list view happens to be visible (modal open, on the list
        // screen), keep it fresh too — cheap since we already have the data.
        if (modalEl.classList.contains('show') && listViewEl.style.display !== 'none') {
            loadTickets()
        }
    }

    function renderMessage(m) {
        const row = document.createElement('div')
        row.className = 'cp-thread-msg' + (m.isAdmin ? ' is-admin' : ' is-user')
        const bubble = document.createElement('div')
        bubble.className = 'cp-thread-bubble'
        bubble.textContent = m.body
        const time = document.createElement('div')
        time.className = 'cp-thread-msg-time'
        time.textContent = fmtDate(m.createdAt)
        row.appendChild(bubble)
        row.appendChild(time)
        return row
    }

    function showTyping(isTyping, typingBy) {
        if (!typingIndicatorEl) return
        if (!isTyping) {
            typingIndicatorEl.style.display = 'none'
            return
        }
        typingLabelEl.textContent = typingBy === 'bot'
            ? tGet('cloud.supportTypingBot')
            : tGet('cloud.supportTypingAdmin')
        typingIndicatorEl.style.display = ''
        messagesEl.scrollTop = messagesEl.scrollHeight
    }

    // FEATURE (2026-09-30, item 5 — "тикеты работают как переписка...
    // видит в прямом режиме, что новое сообщение пришло, без открыть,
    // закрыть"): single poll used both to append newly-arrived messages
    // live and to drive the typing indicator, since both come from the
    // same GET /:id payload (see tickets.js).
    async function pollThreadOnce() {
        if (!currentTicketId) return
        const id = currentTicketId
        const result = await authorizedInvoke('api-tickets-get', id).catch(() => null)
        if (!result?.success || !result.data || currentTicketId !== id) return

        const ticket = result.data
        statusPillEl.textContent = statusLabel(ticket.status)
        statusPillEl.className = `cp-ticket-status-pill cp-ticket-status-${(ticket.status || '').toLowerCase()}`

        let appended = false
        ;(ticket.messages || []).forEach((m) => {
            if (knownMessageIds.has(m.id)) return
            knownMessageIds.add(m.id)
            messagesEl.appendChild(renderMessage(m))
            appended = true
        })
        if (appended) {
            // A message just landed for the ticket the user is actively
            // looking at — keep the seen-count baseline in sync so the
            // quiet background poll doesn't also fire a redundant
            // notification for it a few seconds later.
            const seen = getSeenCounts()
            seen[id] = ticket.messages?.length || 0
            setSeenCounts(seen)
            messagesEl.scrollTop = messagesEl.scrollHeight
        }

        showTyping(!!ticket.isTyping, ticket.typingBy)
    }

    const THREAD_POLL_MS = 3000
    function startThreadPoll() {
        stopThreadPoll()
        threadPollTimer = setInterval(pollThreadOnce, THREAD_POLL_MS)
    }
    function stopThreadPoll() {
        if (threadPollTimer) { clearInterval(threadPollTimer); threadPollTimer = null }
    }

    async function openThread(id) {
        currentTicketId = id
        knownMessageIds = new Set()
        listViewEl.style.display = 'none'
        threadView.style.display = 'flex'
        subjectEl.textContent = '—'
        statusPillEl.textContent = '—'
        messagesEl.textContent = ''
        replyErrorEl.style.display = 'none'
        replyInput.value = ''
        showTyping(false)

        const result = await authorizedInvoke('api-tickets-get', id).catch(() => null)
        if (!result?.success || !result.data || currentTicketId !== id) return

        const ticket = result.data
        subjectEl.textContent = ticket.subject
        statusPillEl.textContent = statusLabel(ticket.status)
        statusPillEl.className = `cp-ticket-status-pill cp-ticket-status-${(ticket.status || '').toLowerCase()}`
        ;(ticket.messages || []).forEach((m) => {
            knownMessageIds.add(m.id)
            messagesEl.appendChild(renderMessage(m))
        })
        messagesEl.scrollTop = messagesEl.scrollHeight
        showTyping(!!ticket.isTyping, ticket.typingBy)

        const seen = getSeenCounts()
        seen[id] = ticket.messages?.length || 0
        setSeenCounts(seen)
        updateBadge(false)

        startThreadPoll()
    }

    function closeThread() {
        stopThreadPoll()
        threadView.style.display = 'none'
        listViewEl.style.display = ''
        currentTicketId = null
        loadTickets()
    }

    async function sendReply() {
        const body = replyInput.value.trim()
        if (!body || !currentTicketId) return
        replyErrorEl.style.display = 'none'
        replySendBtn.disabled = true

        const result = await authorizedInvoke('api-tickets-reply', currentTicketId, body).catch(() => null)
        replySendBtn.disabled = false

        if (!result?.success) {
            replyErrorEl.textContent = result?.error || result?.data?.error || 'Error'
            replyErrorEl.style.display = ''
            return
        }
        replyInput.value = ''
        knownMessageIds.add(result.data.id)
        messagesEl.appendChild(renderMessage(result.data))
        messagesEl.scrollTop = messagesEl.scrollHeight
        statusPillEl.textContent = statusLabel('OPEN')
        statusPillEl.className = 'cp-ticket-status-pill cp-ticket-status-open'
        showTyping(false)
    }

    async function createTicket() {
        const subject = newSubject.value.trim()
        const body = newBody.value.trim()
        newErrorEl.style.display = 'none'
        if (!subject || !body) {
            newErrorEl.textContent = tGet('cloud.supportSubjectPh') + ' / ' + tGet('cloud.supportBodyPh')
            newErrorEl.style.display = ''
            return
        }

        newSubmitBtn.disabled = true
        const result = await authorizedInvoke('api-tickets-create', subject, body).catch(() => null)
        newSubmitBtn.disabled = false

        if (!result?.success) {
            newErrorEl.textContent = result?.error || result?.data?.error || 'Error'
            newErrorEl.style.display = ''
            return
        }

        newSubject.value = ''
        newBody.value = ''
        newForm.style.display = 'none'

        // UX (2026-09-30, "когда начинаешь новый тикет — после создания
        // сразу в него проваливаешься... а не ещё раз нужно на созданный
        // нажать" — live request): drop straight into the new ticket's
        // thread instead of just refreshing the list and making the user
        // find+click their own just-created row.
        if (result.data?.id) {
            openThread(result.data.id)
        } else {
            loadTickets()
        }
    }

    function openSupportModal() {
        modalEl.classList.add('show')
        listViewEl.style.display = ''
        threadView.style.display = 'none'
        currentTicketId = null
        loadTickets()
    }

    function closeSupportModal() {
        stopThreadPoll()
        modalEl.classList.remove('show')
        currentTicketId = null
    }

    newBtn?.addEventListener('click', () => {
        const isOpen = newForm.style.display !== 'none'
        newForm.style.display = isOpen ? 'none' : ''
        newErrorEl.style.display = 'none'
    })
    newCancelBtn?.addEventListener('click', () => {
        newForm.style.display = 'none'
        newErrorEl.style.display = 'none'
    })
    newSubmitBtn?.addEventListener('click', createTicket)
    backBtn?.addEventListener('click', closeThread)
    replySendBtn?.addEventListener('click', sendReply)
    replyInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
    })

    closeBtn1?.addEventListener('click', closeSupportModal)
    closeBtn2?.addEventListener('click', closeSupportModal)
    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeSupportModal()
    })

    // FEATURE (2026-09-30, item 1 — "у поддержки должен быть своё
    // всплывающее окно, а не окно профиля"): this button used to route
    // through openCloudProfile() and scroll to a section buried inside it
    // (see git history) — now it opens #supportModal directly, the same
    // Pro-gating the old handler had, just without the profile popup as a
    // middleman.
    sidebarBtn?.addEventListener('click', () => {
        if (!cloudStore?.isLoggedIn?.()) { openCloudLogin?.(); return }
        if (typeof hasEffectivePro === 'function' && !hasEffectivePro()) {
            openUrl?.('https://centrio.me/dashboard?tab=support')
            return
        }
        openSupportModal()
    })

    // Тихий фон для бейджа сайдбара — не ждём, пока пользователь сам
    // откроет модал. Первый вызов сразу как "seedOnly" (не спамим
    // уведомлениями по всей уже существующей истории тикетов при первом
    // запуске после обновления), дальше — обычные поллы каждые 20с.
    loadTickets({ seedOnly: true })
    listPollTimer = setInterval(pollListQuietly, LIST_POLL_MS)

    return { loadTickets, openSupportModal, closeSupportModal }
}

module.exports = { bindSupportTicketsUi }
