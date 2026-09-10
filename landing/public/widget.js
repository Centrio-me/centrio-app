/*
 * Centrio Chat Widget (2026-09-11).
 * NOTE on deploy path: this file is deployed to
 * /var/www/centrio-web/public/widget.js (Next.js serves everything under
 * public/ at the site root — see scripts/deploy-widget.js) and embedded by
 * clients as:
 *   <script src="https://centrio.me/widget.js" data-token="THEIR_TOKEN"></script>
 *
 * Talks only to /api/widget/:token/* on api.centrio.me (see
 * landing/widget-routes.js) — that's the entire public, unauthenticated
 * surface this widget touches. No dependencies, no build step: this file is
 * shipped byte-for-byte to arbitrary third-party sites, so it stays plain,
 * small, and self-contained on purpose.
 */
(function () {
    'use strict'

    var CURRENT_SCRIPT = document.currentScript
    var TOKEN = CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute('data-token')
    if (!TOKEN) { console.warn('[Centrio Widget] Missing data-token attribute'); return }

    var API_BASE = 'https://api.centrio.me/api/widget/' + TOKEN
    var STORAGE_KEY = 'centrio_widget_' + TOKEN
    var POLL_INTERVAL_MS = 4000

    var state = loadState()
    var pollTimer = null
    var panelOpen = false
    var unread = 0

    function loadState() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY)
            return raw ? JSON.parse(raw) : { visitorId: null, conversationId: null, messages: [] }
        } catch (e) {
            return { visitorId: null, conversationId: null, messages: [] }
        }
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) {}
    }

    // ── UI ──────────────────────────────────────────────────────────────
    var css = '' +
        '#centrio-widget-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;' +
        'background:#5AA9FF;box-shadow:0 4px 20px rgba(0,0,0,.25);cursor:pointer;z-index:2147483000;' +
        'display:flex;align-items:center;justify-content:center;transition:transform .15s;border:none}' +
        '#centrio-widget-bubble:hover{transform:scale(1.06)}' +
        '#centrio-widget-badge{position:absolute;top:-4px;right:-4px;background:#ff4d4f;color:#fff;font:700 11px/18px sans-serif;' +
        'min-width:18px;height:18px;border-radius:9px;text-align:center;padding:0 4px;display:none}' +
        '#centrio-widget-panel{position:fixed;bottom:88px;right:20px;width:340px;max-width:calc(100vw - 32px);height:480px;' +
        'max-height:calc(100vh - 120px);background:#0b0a08;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.35);' +
        'display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#F5F1E8}' +
        '#centrio-widget-panel.open{display:flex}' +
        '#centrio-widget-header{background:#5AA9FF;color:#04161a;padding:14px 16px;font-weight:700;font-size:14px;' +
        'display:flex;align-items:center;justify-content:space-between}' +
        '#centrio-widget-close{background:none;border:none;color:#04161a;cursor:pointer;font-size:18px;line-height:1;padding:0}' +
        '#centrio-widget-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px}' +
        '.centrio-widget-msg{max-width:80%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.4;word-wrap:break-word}' +
        '.centrio-widget-msg.visitor{align-self:flex-end;background:#5AA9FF;color:#04161a;border-bottom-right-radius:3px}' +
        '.centrio-widget-msg.operator{align-self:flex-start;background:rgba(255,255,255,.08);border-bottom-left-radius:3px}' +
        '#centrio-widget-form{padding:12px;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:8px}' +
        '#centrio-widget-form input,#centrio-widget-form textarea{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);' +
        'border-radius:8px;color:#F5F1E8;padding:8px 10px;font-size:13px;font-family:inherit;outline:none}' +
        '#centrio-widget-form textarea{resize:none;min-height:40px}' +
        '#centrio-widget-send{background:#5AA9FF;color:#04161a;border:none;border-radius:8px;padding:9px;font-weight:700;' +
        'font-size:13px;cursor:pointer}' +
        '#centrio-widget-send:disabled{opacity:.5;cursor:not-allowed}'

    var styleEl = document.createElement('style')
    styleEl.textContent = css
    document.head.appendChild(styleEl)

    var bubble = document.createElement('button')
    bubble.id = 'centrio-widget-bubble'
    bubble.setAttribute('aria-label', 'Chat')
    bubble.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#04161a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>' +
        '<span id="centrio-widget-badge"></span>'
    document.body.appendChild(bubble)

    var panel = document.createElement('div')
    panel.id = 'centrio-widget-panel'
    panel.innerHTML =
        '<div id="centrio-widget-header"><span>Написать нам</span><button id="centrio-widget-close" aria-label="Close">&times;</button></div>' +
        '<div id="centrio-widget-body"></div>' +
        '<div id="centrio-widget-form"></div>'
    document.body.appendChild(panel)

    var bodyEl = panel.querySelector('#centrio-widget-body')
    var formEl = panel.querySelector('#centrio-widget-form')
    var badgeEl = bubble.querySelector('#centrio-widget-badge')

    function renderBadge() {
        if (unread > 0 && !panelOpen) {
            badgeEl.textContent = String(unread > 9 ? '9+' : unread)
            badgeEl.style.display = 'block'
        } else {
            badgeEl.style.display = 'none'
        }
    }

    function renderMessages() {
        bodyEl.innerHTML = state.messages.map(function (m) {
            var cls = m.fromVisitor ? 'visitor' : 'operator'
            return '<div class="centrio-widget-msg ' + cls + '">' + escapeHtml(m.body) + '</div>'
        }).join('')
        bodyEl.scrollTop = bodyEl.scrollHeight
    }

    function escapeHtml(str) {
        var div = document.createElement('div')
        div.textContent = String(str || '')
        return div.innerHTML
    }

    // Pre-conversation form: name + email/phone + first message.
    function renderStartForm() {
        formEl.innerHTML =
            '<input id="centrio-w-name" type="text" placeholder="Ваше имя" maxlength="100">' +
            '<input id="centrio-w-contact" type="text" placeholder="Email или телефон" maxlength="200">' +
            '<textarea id="centrio-w-msg" placeholder="Ваш вопрос…" maxlength="4000"></textarea>' +
            '<button id="centrio-widget-send" type="button">Отправить</button>'

        formEl.querySelector('#centrio-widget-send').addEventListener('click', function () {
            var name = formEl.querySelector('#centrio-w-name').value.trim()
            var contact = formEl.querySelector('#centrio-w-contact').value.trim()
            var msg = formEl.querySelector('#centrio-w-msg').value.trim()
            if (!msg) return
            var btn = formEl.querySelector('#centrio-widget-send')
            btn.disabled = true
            fetch(API_BASE + '/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    visitorId: state.visitorId,
                    visitorName: name || null,
                    visitorContact: contact || null,
                    message: msg,
                    pageOrigin: window.location.origin
                })
            }).then(function (r) { return r.json() }).then(function (res) {
                if (!res.success) { btn.disabled = false; return }
                state.visitorId = res.data.visitorId
                state.conversationId = res.data.conversationId
                state.messages = [{ fromVisitor: true, body: msg, createdAt: new Date().toISOString() }]
                saveState()
                renderMessages()
                renderReplyForm()
                startPolling()
            }).catch(function () { btn.disabled = false })
        })
    }

    // Once a conversation exists, the form is just a reply box.
    function renderReplyForm() {
        formEl.innerHTML =
            '<textarea id="centrio-w-msg" placeholder="Написать сообщение…" maxlength="4000"></textarea>' +
            '<button id="centrio-widget-send" type="button">Отправить</button>'

        var send = function () {
            var input = formEl.querySelector('#centrio-w-msg')
            var msg = input.value.trim()
            if (!msg) return
            input.value = ''
            state.messages.push({ fromVisitor: true, body: msg, createdAt: new Date().toISOString() })
            renderMessages()
            fetch(API_BASE + '/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationId: state.conversationId,
                    visitorId: state.visitorId,
                    body: msg,
                    pageOrigin: window.location.origin
                })
            }).catch(function () {})
        }
        formEl.querySelector('#centrio-widget-send').addEventListener('click', send)
        formEl.querySelector('#centrio-w-msg').addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
        })
    }

    function poll() {
        if (!state.conversationId) return
        var since = state.messages.length ? state.messages[state.messages.length - 1].createdAt : ''
        fetch(API_BASE + '/conversations/' + state.conversationId + '/messages?visitorId=' + encodeURIComponent(state.visitorId) + '&since=' + encodeURIComponent(since))
            .then(function (r) { return r.json() })
            .then(function (res) {
                if (!res.success || !res.data.length) return
                var newOperatorMsgs = 0
                res.data.forEach(function (m) {
                    state.messages.push(m)
                    if (!m.fromVisitor) newOperatorMsgs++
                })
                saveState()
                renderMessages()
                if (newOperatorMsgs > 0 && !panelOpen) {
                    unread += newOperatorMsgs
                    renderBadge()
                }
            })
            .catch(function () {})
    }

    function startPolling() {
        if (pollTimer) return
        pollTimer = setInterval(poll, POLL_INTERVAL_MS)
    }

    function openPanel() {
        panelOpen = true
        panel.classList.add('open')
        unread = 0
        renderBadge()
        if (state.conversationId) { renderMessages(); renderReplyForm(); startPolling() } else { renderStartForm() }
    }

    function closePanel() {
        panelOpen = false
        panel.classList.remove('open')
    }

    bubble.addEventListener('click', function () { panelOpen ? closePanel() : openPanel() })
    panel.querySelector('#centrio-widget-close').addEventListener('click', closePanel)

    if (state.conversationId) startPolling()
})()
