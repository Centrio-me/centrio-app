// renderer/support-tickets-ui.js
// Support window inside the app (2026-09-21, "для PRO поддержка и тикеты доступны прямо из
// приложения. Синхронизируются с ЛК"): thin UI over the SAME Ticket/TicketMessage API the
// website's dashboard uses (src/routes/tickets.js), so tickets are shared with centrio.me.
//
// 2026-09-30: standalone #supportModal, live polling, real typing indicator and notifications.
// 2026-10-10 (3.2): redesigned in the style of the AI assistant. A topic is chosen before writing
// (support / idea / bug / question), messages can carry images (paperclip, paste, drag and drop),
// the bot's messages are marked, and the page says that no ticket is left without an answer.
'use strict'

const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const FRESH_TICKET_MS = 2 * 60 * 1000

function bindSupportTicketsUi({
    authorizedInvoke, tGet, hasEffectivePro, ipcRenderer, playNotifSound,
    openCloudLogin, openUrl, cloudStore, addMessengerNotification
}) {
    const $ = (id) => document.getElementById(id)
    const modalEl = $('supportModal')
    const listEl = $('supportTicketsList')
    if (!modalEl || !listEl) return {}

    const loadingEl = $('supportTicketsLoading')
    const emptyEl = $('supportTicketsEmpty')
    const countEl = $('supportCountLabel')
    const sidebarBadgeEl = $('supportSidebarBadge')
    const sidebarBtn = $('supportSidebarBtn')
    const mainEl = modalEl.querySelector('.sp2-main')

    const idleView = $('supportIdleView')
    const newView = $('supportNewTicketForm')
    const threadView = $('ticketThreadView')

    const newBtn = $('supportNewTicketBtn')
    const idleNewBtn = $('supportIdleNewBtn')
    const newTitleEl = $('supportNewTitle')
    const topicsEl = $('supportTopics')
    const newSubject = $('supportNewSubject')
    const newBody = $('supportNewBody')
    const newShotsEl = $('supportNewShots')
    const newErrorEl = $('supportNewError')
    const newAttachBtn = $('supportNewAttachBtn')
    const newCancelBtn = $('supportNewCancelBtn')
    const newSubmitBtn = $('supportNewSubmitBtn')

    const subjectEl = $('ticketThreadSubject')
    const categoryEl = $('ticketThreadCategory')
    const statusEl = $('ticketThreadStatus')
    const stepsEl = $('ticketThreadSteps')
    const messagesEl = $('ticketThreadMessages')
    const typingEl = $('ticketTypingIndicator')
    const typingLabelEl = $('ticketTypingLabel')
    const replyInput = $('ticketReplyInput')
    const replySendBtn = $('ticketReplySendBtn')
    const replyShotsEl = $('ticketReplyShots')
    const replyErrorEl = $('ticketReplyError')
    const replyAttachBtn = $('ticketReplyAttachBtn')

    const fileInput = $('supportFileInput')
    const lightboxEl = $('supportLightbox')

    let currentTicketId = null
    let currentTicket = null
    let selectedTopic = null
    let threadPollTimer = null
    let knownMessageIds = new Set()
    let newImages = []
    let replyImages = []
    let attachTarget = 'new'
    const imageCache = new Map()

    const escapeText = (value) => String(value == null ? '' : value)
    const tt = (key, fallback = '') => tGet(key) || fallback

    function fmtDate(iso) {
        try {
            return new Date(iso).toLocaleString(undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        } catch { return '' }
    }

    // ---- per-ticket "seen" counters and client-side hiding (unchanged behaviour) ----
    const SEEN_COUNTS_KEY = 'centrio-support-seen-counts'
    const DISMISSED_TICKETS_KEY = 'centrio-support-dismissed-tickets'
    function readMap(key) {
        try { return JSON.parse(localStorage.getItem(key) || '{}') } catch { return {} }
    }
    function writeMap(key, map) {
        try { localStorage.setItem(key, JSON.stringify(map)) } catch { /* storage may be blocked */ }
    }
    const getSeenCounts = () => readMap(SEEN_COUNTS_KEY)
    const setSeenCounts = (map) => writeMap(SEEN_COUNTS_KEY, map)
    function dismissTicket(ticketId, messageCount) {
        const dismissed = readMap(DISMISSED_TICKETS_KEY)
        dismissed[ticketId] = messageCount
        writeMap(DISMISSED_TICKETS_KEY, dismissed)
    }
    // A hidden ticket comes back by itself as soon as a new message arrives in it.
    function filterDismissed(tickets) {
        const dismissed = readMap(DISMISSED_TICKETS_KEY)
        let changed = false
        const visible = tickets.filter((t) => {
            const at = dismissed[t.id]
            if (at === undefined) return true
            if ((t._count?.messages || 0) > at) { delete dismissed[t.id]; changed = true; return true }
            return false
        })
        if (changed) writeMap(DISMISSED_TICKETS_KEY, dismissed)
        return visible
    }

    function updateBadge(hasUnnotified) {
        if (sidebarBadgeEl) sidebarBadgeEl.style.display = hasUnnotified ? '' : 'none'
    }

    // ---- labels ----
    function tagText(category) {
        const keys = { support: 'cloud.supportTagSupport', idea: 'cloud.supportTagIdea', bug: 'cloud.supportTagBug', question: 'cloud.supportTagQuestion' }
        return keys[category] ? tt(keys[category]) : ''
    }

    // What the customer should understand at a glance: who has the ticket right now.
    function rowState(ticket) {
        if (ticket.status === 'CLOSED') return { cls: 's-done', text: tt('cloud.supportRowDone') }
        if (ticket.botStage === 'CLARIFYING') return { cls: 's-bot', text: tt('cloud.supportRowClarify') }
        if (ticket.botStage === 'ESCALATED') return { cls: 's-team', text: tt('cloud.supportRowTeam') }
        if (ticket.status === 'ANSWERED') return { cls: 's-answered', text: tt('cloud.supportRowAnswered') }
        const fresh = Date.now() - new Date(ticket.createdAt).getTime() < FRESH_TICKET_MS
        return fresh
            ? { cls: 's-bot', text: tt('cloud.supportRowBot') }
            : { cls: 's-team', text: tt('cloud.supportRowTeam') }
    }

    // ---- notifications for new replies (unchanged logic) ----
    async function checkForNewReplies(tickets, { seedOnly = false } = {}) {
        const seen = getSeenCounts()
        let anyUnnotified = false
        const isThreadOpen = modalEl.classList.contains('show') && threadView.style.display !== 'none'
        for (const t of tickets) {
            const count = t._count?.messages || 0
            const prev = seen[t.id]
            const isNewReply = prev !== undefined && count > prev && (t.status === 'ANSWERED' || t.status === 'CLOSED')
            if (isNewReply && !seedOnly && !(isThreadOpen && currentTicketId === t.id)) {
                anyUnnotified = true
                fireReplyNotification(t).catch(() => {})
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
        const title = last.isBot ? tt('cloud.supportBotName', tt('cloud.supportSection')) : tt('cloud.supportSection')
        const body = (last.body || '').slice(0, 200)
        if (typeof addMessengerNotification === 'function') addMessengerNotification(title, body, ticket.subject, null, null)
        playNotifSound?.(null)
        try {
            ipcRenderer?.send?.('show-notification', { title: ticket.subject || title, body, icon: '', silent: true })
        } catch { /* notification is best effort */ }
        updateBadge(true)
    }

    // ---- ticket list ----
    function renderCard(t) {
        const card = document.createElement('div')
        card.className = 'sp2-card' + (t.id === currentTicketId ? ' active' : '')
        card.dataset.id = t.id

        const top = document.createElement('div')
        top.className = 'sp2-card-top'
        const title = document.createElement('b')
        title.textContent = t.subject
        const time = document.createElement('time')
        time.textContent = fmtDate(t.updatedAt)
        top.append(title, time)

        const sub = document.createElement('div')
        sub.className = 'sp2-card-sub'
        if (t.category) {
            const tag = document.createElement('span')
            tag.className = `sp2-tag t-${t.category}`
            tag.textContent = tagText(t.category)
            sub.appendChild(tag)
        }
        const state = rowState(t)
        const stateEl = document.createElement('span')
        stateEl.className = `sp2-state ${state.cls}`
        stateEl.textContent = state.text
        sub.appendChild(stateEl)

        const remove = document.createElement('button')
        remove.type = 'button'
        remove.className = 'sp2-card-x'
        remove.setAttribute('aria-label', tt('cloud.supportDeleteBtn', 'Delete'))
        remove.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
        remove.addEventListener('click', async (e) => {
            e.stopPropagation()
            const ok = await window.showConfirmModal?.({
                title: tt('cloud.supportDeleteTitle', 'Remove the ticket?'),
                message: tt('cloud.supportDeleteText', '').replace('{subject}', t.subject),
                confirmText: tt('cloud.supportDelete', 'Remove'),
                cancelText: tt('cloud.supportCancel', 'Cancel'),
                danger: true
            })
            if (!ok) return
            dismissTicket(t.id, t._count?.messages || 0)
            if (currentTicketId === t.id) showIdle()
            loadTickets()
        })

        card.append(top, sub, remove)
        card.addEventListener('click', () => openThread(t.id))
        return card
    }

    async function loadTickets({ seedOnly = false } = {}) {
        if (typeof authorizedInvoke !== 'function') return
        loadingEl.style.display = ''
        emptyEl.style.display = 'none'
        const result = await authorizedInvoke('api-tickets-list').catch(() => null)
        loadingEl.style.display = 'none'

        const allTickets = result?.success ? (result.data?.tickets || []) : []
        const hasUnnotified = await checkForNewReplies(allTickets, { seedOnly })
        if (!hasUnnotified) updateBadge(false)

        const tickets = filterDismissed(allTickets)
        listEl.textContent = ''
        countEl.textContent = tickets.length ? tt('cloud.supportCount').replace('{n}', String(tickets.length)) : ''
        emptyEl.style.display = tickets.length ? 'none' : ''
        tickets.forEach((t) => listEl.appendChild(renderCard(t)))
    }

    const LIST_POLL_MS = 20 * 1000
    async function pollListQuietly() {
        if (typeof hasEffectivePro !== 'function' || !hasEffectivePro()) return
        if (typeof authorizedInvoke !== 'function') return
        const result = await authorizedInvoke('api-tickets-list').catch(() => null)
        if (!result?.success) return
        const hasUnnotified = await checkForNewReplies(result.data?.tickets || [])
        if (!hasUnnotified) updateBadge(false)
        if (modalEl.classList.contains('show')) loadTickets()
    }

    // ---- views ----
    function showView(name) {
        idleView.style.display = name === 'idle' ? '' : 'none'
        newView.style.display = name === 'new' ? 'flex' : 'none'
        threadView.style.display = name === 'thread' ? 'flex' : 'none'
        if (name !== 'thread') { stopThreadPoll(); currentTicketId = null; currentTicket = null }
        listEl.querySelectorAll('.sp2-card').forEach((c) => c.classList.toggle('active', c.dataset.id === currentTicketId))
    }

    function showIdle() { showView('idle') }

    function renderHeadline() {
        const text = tt('cloud.supportNewTitle')
        const match = /\[\[(.+?)\]\]/.exec(text)
        newTitleEl.textContent = ''
        if (!match) { newTitleEl.textContent = text; return }
        newTitleEl.append(text.slice(0, match.index))
        const word = document.createElement('span')
        word.className = 'sp2-u'
        word.textContent = match[1]
        newTitleEl.append(word, text.slice(match.index + match[0].length))
    }

    function showNewForm() {
        showView('new')
        renderHeadline()
        selectTopic(null)
        newSubject.value = ''
        newBody.value = ''
        newImages = []
        renderThumbs(newShotsEl, newImages, 'new')
        newErrorEl.style.display = 'none'
    }

    function selectTopic(topic) {
        selectedTopic = topic
        topicsEl.querySelectorAll('.sp2-topic').forEach((b) => b.classList.toggle('on', b.dataset.topic === topic))
    }

    // ---- images ----
    function showError(target, text) {
        const el = target === 'new' ? newErrorEl : replyErrorEl
        el.textContent = text
        el.style.display = text ? '' : 'none'
    }

    function renderThumbs(container, list, target) {
        container.textContent = ''
        list.forEach((item, index) => {
            const thumb = document.createElement('div')
            thumb.className = 'sp2-thumb'
            const img = document.createElement('img')
            img.alt = ''
            img.src = item.preview
            const remove = document.createElement('button')
            remove.type = 'button'
            remove.textContent = '×'
            remove.addEventListener('click', () => {
                URL.revokeObjectURL(item.preview)
                list.splice(index, 1)
                renderThumbs(container, list, target)
            })
            thumb.append(img, remove)
            container.appendChild(thumb)
        })
    }

    function addFiles(files, target) {
        const list = target === 'new' ? newImages : replyImages
        const container = target === 'new' ? newShotsEl : replyShotsEl
        showError(target, '')
        for (const file of Array.from(files || [])) {
            if (!IMAGE_MIMES.includes(file.type)) { showError(target, tt('cloud.supportAttachErrType')); continue }
            if (file.size > MAX_IMAGE_BYTES) { showError(target, tt('cloud.supportAttachErrSize')); continue }
            if (list.length >= MAX_IMAGES) { showError(target, tt('cloud.supportAttachErrCount')); break }
            list.push({ file, preview: URL.createObjectURL(file) })
        }
        renderThumbs(container, list, target)
    }

    function pickFiles(target) {
        attachTarget = target
        fileInput.value = ''
        fileInput.click()
    }

    async function packImages(list) {
        return Promise.all(list.map(async ({ file }) => ({
            name: file.name || 'image',
            mime: file.type,
            data: new Uint8Array(await file.arrayBuffer())
        })))
    }

    function clearImages(list, container, target) {
        list.forEach((item) => URL.revokeObjectURL(item.preview))
        list.length = 0
        renderThumbs(container, list, target)
    }

    // Image of a message: fetched with the session token, cached as a data URL.
    async function loadImage(ticketId, name) {
        const key = `${ticketId}/${name}`
        if (imageCache.has(key)) return imageCache.get(key)
        const result = await authorizedInvoke('api-tickets-file', ticketId, name).catch(() => null)
        if (!result?.success || !result.data?.base64) return null
        const url = `data:${result.data.mime};base64,${result.data.base64}`
        imageCache.set(key, url)
        return url
    }

    function openLightbox(url) {
        lightboxEl.querySelector('img').src = url
        lightboxEl.style.display = 'flex'
    }
    function closeLightbox() { lightboxEl.style.display = 'none' }

    function renderPictures(ticketId, names) {
        const wrap = document.createElement('div')
        wrap.className = 'sp2-pics' + (names.length === 1 ? ' one' : '')
        names.forEach((name) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'sp2-pic'
            const img = document.createElement('img')
            img.alt = ''
            button.appendChild(img)
            loadImage(ticketId, name).then((url) => {
                if (!url) { button.remove(); return }
                img.src = url
                button.addEventListener('click', () => openLightbox(url))
            })
            wrap.appendChild(button)
        })
        return wrap
    }

    // ---- thread ----
    function renderMessage(m) {
        const row = document.createElement('div')
        const mine = !m.isAdmin
        row.className = 'sp2-msg' + (mine ? ' me' : '')
        row.dataset.bot = m.isBot ? '1' : ''

        if (!mine) {
            const who = document.createElement('div')
            who.className = 'sp2-who'
            who.append(m.isBot ? tt('cloud.supportBotName') : tt('cloud.supportTeamName'))
            if (m.isBot) {
                const badge = document.createElement('span')
                badge.className = 'sp2-badge'
                badge.textContent = tt('cloud.supportBotBadge')
                who.appendChild(badge)
            }
            row.appendChild(who)
        }

        const line = document.createElement('div')
        line.className = 'sp2-row'
        if (!mine) {
            if (m.isBot) {
                const av = document.createElement('img')
                av.className = 'sp2-av'
                av.src = 'assets/logo.png'
                av.alt = ''
                line.appendChild(av)
            } else {
                const av = document.createElement('span')
                av.className = 'sp2-av human'
                av.textContent = 'C'
                line.appendChild(av)
            }
        }
        const body = document.createElement('div')
        body.className = 'sp2-body'
        const bubble = document.createElement('div')
        bubble.className = 'sp2-bubble'
        bubble.textContent = escapeText(m.body)
        body.appendChild(bubble)
        if (m.attachments && m.attachments.length && currentTicketId) {
            body.appendChild(renderPictures(currentTicketId, m.attachments))
        }
        line.appendChild(body)
        row.appendChild(line)

        const time = document.createElement('div')
        time.className = 'sp2-time'
        time.textContent = fmtDate(m.createdAt)
        row.appendChild(time)
        return row
    }

    function renderSteps(ticket) {
        const messages = ticket.messages || []
        const botAnswered = messages.some((m) => m.isBot)
        const withTeam = ticket.botStage === 'ESCALATED' || messages.some((m) => m.isAdmin && !m.isBot)
        const done = ticket.status === 'CLOSED'
        const steps = [
            { text: tt('cloud.supportStepAccepted'), cls: 'ok', mark: '✓ ' },
            { text: tt('cloud.supportStepBot'), cls: botAnswered ? 'ok' : '', mark: botAnswered ? '✓ ' : '' },
            { text: tt('cloud.supportStepTeam'), cls: withTeam && !done ? 'on' : (withTeam ? 'ok' : ''), mark: withTeam ? (done ? '✓ ' : '● ') : '' },
            { text: tt('cloud.supportStepDone'), cls: done ? 'ok' : '', mark: done ? '✓ ' : '' }
        ]
        stepsEl.textContent = ''
        steps.forEach((step, index) => {
            if (index) stepsEl.appendChild(document.createElement('i'))
            const span = document.createElement('span')
            if (step.cls) span.className = step.cls
            span.textContent = step.mark + step.text
            stepsEl.appendChild(span)
        })
    }

    // The "handed over to the team" chip sits right after the last bot message.
    function placeHandoffChip(ticket) {
        messagesEl.querySelector('.sp2-chip')?.remove()
        if (ticket.botStage !== 'ESCALATED') return
        const botRows = messagesEl.querySelectorAll('.sp2-msg[data-bot="1"]')
        const last = botRows[botRows.length - 1]
        if (!last) return
        const chip = document.createElement('div')
        chip.className = 'sp2-chip'
        chip.textContent = tt('cloud.supportHandoff')
        last.after(chip)
    }

    function applyTicketHeader(ticket) {
        currentTicket = ticket
        subjectEl.textContent = ticket.subject
        categoryEl.className = 'sp2-tag' + (ticket.category ? ` t-${ticket.category}` : '')
        categoryEl.textContent = ticket.category ? tagText(ticket.category) : ''
        const state = rowState(ticket)
        statusEl.className = `sp2-state ${state.cls}`
        statusEl.textContent = state.text
        renderSteps(ticket)
    }

    function showTyping(isTyping, typingBy) {
        if (!isTyping) { typingEl.style.display = 'none'; return }
        typingLabelEl.textContent = typingBy === 'bot' ? tt('cloud.supportTypingBot') : tt('cloud.supportTypingAdmin')
        typingEl.style.display = ''
        messagesEl.scrollTop = messagesEl.scrollHeight
    }

    function appendNewMessages(ticket) {
        let appended = false
        ;(ticket.messages || []).forEach((m) => {
            if (knownMessageIds.has(m.id)) return
            knownMessageIds.add(m.id)
            messagesEl.appendChild(renderMessage(m))
            appended = true
        })
        placeHandoffChip(ticket)
        return appended
    }

    async function pollThreadOnce() {
        if (!currentTicketId) return
        const id = currentTicketId
        const result = await authorizedInvoke('api-tickets-get', id).catch(() => null)
        if (!result?.success || !result.data || currentTicketId !== id) return
        const ticket = result.data
        applyTicketHeader(ticket)
        if (appendNewMessages(ticket)) {
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
        showView('thread')
        currentTicketId = id
        knownMessageIds = new Set()
        subjectEl.textContent = '—'
        categoryEl.textContent = ''
        statusEl.textContent = ''
        stepsEl.textContent = ''
        messagesEl.textContent = ''
        replyErrorEl.style.display = 'none'
        replyInput.value = ''
        clearImages(replyImages, replyShotsEl, 'reply')
        showTyping(false)
        listEl.querySelectorAll('.sp2-card').forEach((c) => c.classList.toggle('active', c.dataset.id === id))

        const result = await authorizedInvoke('api-tickets-get', id).catch(() => null)
        if (!result?.success || !result.data || currentTicketId !== id) return
        const ticket = result.data
        applyTicketHeader(ticket)
        appendNewMessages(ticket)
        messagesEl.scrollTop = messagesEl.scrollHeight
        showTyping(!!ticket.isTyping, ticket.typingBy)

        const seen = getSeenCounts()
        seen[id] = ticket.messages?.length || 0
        setSeenCounts(seen)
        updateBadge(false)
        startThreadPoll()
        replyInput.focus()
    }

    async function sendReply() {
        const body = replyInput.value.trim()
        if ((!body && !replyImages.length) || !currentTicketId) return
        replyErrorEl.style.display = 'none'
        replySendBtn.disabled = true
        const images = await packImages(replyImages)
        const result = await authorizedInvoke('api-tickets-reply', currentTicketId, body, images).catch(() => null)
        replySendBtn.disabled = false
        if (!result?.success) {
            showError('reply', result?.error || result?.data?.error || 'Error')
            return
        }
        replyInput.value = ''
        clearImages(replyImages, replyShotsEl, 'reply')
        knownMessageIds.add(result.data.id)
        messagesEl.appendChild(renderMessage(result.data))
        messagesEl.scrollTop = messagesEl.scrollHeight
        if (currentTicket) applyTicketHeader({ ...currentTicket, status: 'OPEN', botStage: currentTicket.botStage, messages: [...(currentTicket.messages || []), result.data] })
        showTyping(false)
    }

    async function createTicket() {
        const subject = newSubject.value.trim()
        const body = newBody.value.trim()
        showError('new', '')
        if (!selectedTopic) { showError('new', tt('cloud.supportTopicRequired')); return }
        if (!subject || (!body && !newImages.length)) {
            showError('new', tt('cloud.supportSubjectPh') + ' / ' + tt('cloud.supportBodyPh'))
            return
        }
        newSubmitBtn.disabled = true
        const images = await packImages(newImages)
        const result = await authorizedInvoke('api-tickets-create', subject, body, selectedTopic, images).catch(() => null)
        newSubmitBtn.disabled = false
        if (!result?.success) {
            showError('new', result?.error || result?.data?.error || 'Error')
            return
        }
        clearImages(newImages, newShotsEl, 'new')
        newSubject.value = ''
        newBody.value = ''
        await loadTickets()
        // Straight into the new ticket: the customer sees at once how the assistant answers.
        if (result.data?.id) openThread(result.data.id)
    }

    function openSupportModal() {
        modalEl.classList.add('show')
        showIdle()
        loadTickets()
    }

    function closeSupportModal() {
        stopThreadPoll()
        closeLightbox()
        modalEl.classList.remove('show')
        currentTicketId = null
    }

    // ---- events ----
    newBtn?.addEventListener('click', showNewForm)
    idleNewBtn?.addEventListener('click', showNewForm)
    newCancelBtn?.addEventListener('click', showIdle)
    newSubmitBtn?.addEventListener('click', createTicket)
    topicsEl?.addEventListener('click', (e) => {
        const button = e.target.closest('.sp2-topic')
        if (button) selectTopic(button.dataset.topic)
    })
    newAttachBtn?.addEventListener('click', () => pickFiles('new'))
    replyAttachBtn?.addEventListener('click', () => pickFiles('reply'))
    fileInput?.addEventListener('change', () => addFiles(fileInput.files, attachTarget))
    replySendBtn?.addEventListener('click', sendReply)
    replyInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
    })
    const autoGrow = () => { replyInput.style.height = 'auto'; replyInput.style.height = Math.min(replyInput.scrollHeight, 140) + 'px' }
    replyInput?.addEventListener('input', autoGrow)

    // Paste a screenshot straight from the clipboard into either text field.
    function onPaste(target) {
        return (e) => {
            const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
            if (!files.length) return
            e.preventDefault()
            addFiles(files, target)
        }
    }
    newBody?.addEventListener('paste', onPaste('new'))
    replyInput?.addEventListener('paste', onPaste('reply'))

    // Drag and drop images onto the right-hand pane.
    mainEl?.addEventListener('dragover', (e) => {
        if (!Array.from(e.dataTransfer?.types || []).includes('Files')) return
        e.preventDefault()
        mainEl.classList.add('drop')
    })
    mainEl?.addEventListener('dragleave', (e) => {
        if (e.target === mainEl) mainEl.classList.remove('drop')
    })
    mainEl?.addEventListener('drop', (e) => {
        mainEl.classList.remove('drop')
        const files = Array.from(e.dataTransfer?.files || []).filter((f) => f.type.startsWith('image/'))
        if (!files.length) return
        e.preventDefault()
        if (newView.style.display !== 'none') addFiles(files, 'new')
        else if (threadView.style.display !== 'none') addFiles(files, 'reply')
    })

    lightboxEl?.addEventListener('click', closeLightbox)
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !modalEl.classList.contains('show')) return
        if (lightboxEl.style.display !== 'none') closeLightbox()
        else closeSupportModal()
    })
    $('closeSupportModalBtn')?.addEventListener('click', closeSupportModal)
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) closeSupportModal() })

    sidebarBtn?.addEventListener('click', () => {
        if (!cloudStore?.isLoggedIn?.()) { openCloudLogin?.(); return }
        if (typeof hasEffectivePro === 'function' && !hasEffectivePro()) {
            openUrl?.('https://centrio.me/dashboard?tab=support')
            return
        }
        openSupportModal()
    })

    // Quiet background check for the sidebar badge; the first pass only seeds the counters so
    // existing history does not notify all at once.
    loadTickets({ seedOnly: true })
    setInterval(pollListQuietly, LIST_POLL_MS)

    return { loadTickets, openSupportModal, closeSupportModal }
}

module.exports = { bindSupportTicketsUi }
