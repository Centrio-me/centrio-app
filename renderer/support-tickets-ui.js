// renderer/support-tickets-ui.js
// FEATURE (2026-09-21, "для PRO поддержка и тикеты доступны прямо из
// приложения. Синхронизируются с ЛК. Даже старые" — live user request):
// thin UI over the SAME Ticket/TicketMessage API the website's own
// dashboard already used (src/routes/tickets.js) — same account, same
// rows, so anything created on centrio.me (including tickets from before
// this feature existed) shows up here automatically. No separate sync step.
//
// Gated to Pro in the UI only (see the 'cloud-profile-opened' listener
// below) — the API itself is auth-only, matching the website's own posture.
'use strict'

function bindSupportTicketsUi({ authorizedInvoke, tGet }) {
    const listEl      = document.getElementById('supportTicketsList')
    const loadingEl   = document.getElementById('supportTicketsLoading')
    const emptyEl     = document.getElementById('supportTicketsEmpty')
    const sectionEl   = document.getElementById('cpSupportSection')
    const badgeEl     = document.getElementById('cloudSupportBadge')

    const newBtn      = document.getElementById('supportNewTicketBtn')
    const newForm      = document.getElementById('supportNewTicketForm')
    const newSubject   = document.getElementById('supportNewSubject')
    const newBody      = document.getElementById('supportNewBody')
    const newCancelBtn = document.getElementById('supportNewCancelBtn')
    const newSubmitBtn = document.getElementById('supportNewSubmitBtn')
    const newErrorEl   = document.getElementById('supportNewError')

    const threadView    = document.getElementById('ticketThreadView')
    const profileView   = document.getElementById('cloudProfileView')
    const backBtn       = document.getElementById('ticketThreadBackBtn')
    const subjectEl      = document.getElementById('ticketThreadSubject')
    const statusPillEl   = document.getElementById('ticketThreadStatus')
    const messagesEl     = document.getElementById('ticketThreadMessages')
    const replyInput     = document.getElementById('ticketReplyInput')
    const replySendBtn   = document.getElementById('ticketReplySendBtn')
    const replyErrorEl   = document.getElementById('ticketReplyError')

    if (!sectionEl || !listEl) return { }

    let currentTicketId = null

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

    function updateBadge(tickets) {
        if (!badgeEl) return
        const answered = (tickets || []).filter(t => t.status === 'ANSWERED').length
        if (answered > 0) {
            badgeEl.textContent = String(answered)
            badgeEl.style.display = ''
        } else {
            badgeEl.style.display = 'none'
        }
    }

    async function loadTickets() {
        if (typeof authorizedInvoke !== 'function') return
        loadingEl.style.display = ''
        emptyEl.style.display = 'none'
        listEl.textContent = ''

        const result = await authorizedInvoke('api-tickets-list').catch(() => null)
        loadingEl.style.display = 'none'

        const tickets = result?.success ? (result.data?.tickets || []) : []
        updateBadge(tickets)
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

    async function openThread(id) {
        currentTicketId = id
        profileView.style.display = 'none'
        threadView.style.display = 'flex'
        subjectEl.textContent = '—'
        statusPillEl.textContent = '—'
        messagesEl.textContent = ''
        replyErrorEl.style.display = 'none'
        replyInput.value = ''

        const result = await authorizedInvoke('api-tickets-get', id).catch(() => null)
        if (!result?.success || !result.data) return

        const ticket = result.data
        subjectEl.textContent = ticket.subject
        statusPillEl.textContent = statusLabel(ticket.status)
        statusPillEl.className = `cp-ticket-status-pill cp-ticket-status-${(ticket.status || '').toLowerCase()}`
        ;(ticket.messages || []).forEach((m) => messagesEl.appendChild(renderMessage(m)))
        messagesEl.scrollTop = messagesEl.scrollHeight
    }

    function closeThread() {
        threadView.style.display = 'none'
        profileView.style.display = 'flex'
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
        messagesEl.appendChild(renderMessage(result.data))
        messagesEl.scrollTop = messagesEl.scrollHeight
        statusPillEl.textContent = statusLabel('OPEN')
        statusPillEl.className = 'cp-ticket-status-pill cp-ticket-status-open'
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
        loadTickets()
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

    document.addEventListener('cloud-profile-opened', (e) => {
        const isPro = !!e.detail?.isPro
        sectionEl.style.display = isPro ? '' : 'none'
        if (isPro) loadTickets()
    })

    return { loadTickets }
}

module.exports = { bindSupportTicketsUi }
