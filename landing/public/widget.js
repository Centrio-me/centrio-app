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
    // BUGFIX/FEATURE (2026-09-11, live user report — "иконка чата в углу
    // пустая... сам чат ужасен... должен быть похож на нашу программу"):
    // the bubble used a hand-drawn stroke-only SVG at 26px that read as
    // "empty" at a glance on some renderers; switched to the real Centrio
    // logo image (same asset the desktop app itself uses), which also
    // directly addresses "should look like our program" — it's the same
    // mark. Redesigned the empty/pre-conversation state to show that logo
    // plus a greeting instead of a bare black rectangle, and generally
    // tightened spacing/contrast to match the desktop app's own dark theme
    // (bg #0b0a08, warm text #F5F1E8, accent #5AA9FF) rather than a generic
    // dark box.
    var LOGO_URL = 'https://centrio.me/logo.png'

    var css = '' +
        '#centrio-widget-bubble{position:fixed;bottom:20px;right:20px;width:58px;height:58px;border-radius:50%;' +
        'background:#5AA9FF;box-shadow:0 6px 24px rgba(0,0,0,.35);cursor:pointer;z-index:2147483000;' +
        'display:flex;align-items:center;justify-content:center;transition:transform .15s;border:none;padding:0}' +
        '#centrio-widget-bubble:hover{transform:scale(1.07)}' +
        '#centrio-widget-bubble img{width:32px;height:32px;object-fit:contain;border-radius:50%;pointer-events:none}' +
        '#centrio-widget-badge{position:absolute;top:-3px;right:-3px;background:#ff4d4f;color:#fff;font:700 11px/18px -apple-system,sans-serif;' +
        'min-width:18px;height:18px;border-radius:9px;text-align:center;padding:0 4px;display:none;box-shadow:0 0 0 2px #0b0a08}' +
        '#centrio-widget-panel{position:fixed;bottom:90px;right:20px;width:360px;max-width:calc(100vw - 32px);height:520px;' +
        'max-height:calc(100vh - 120px);background:#0b0a08;border-radius:18px;box-shadow:0 16px 48px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.06);' +
        'display:none;flex-direction:column;overflow:hidden;z-index:2147483000;' +
        'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#F5F1E8}' +
        '#centrio-widget-panel.open{display:flex;animation:centrio-widget-in .18s ease}' +
        '@keyframes centrio-widget-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
        '#centrio-widget-header{background:#5AA9FF;color:#04161a;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0}' +
        '#centrio-widget-header img{width:28px;height:28px;border-radius:50%;object-fit:contain;background:rgba(4,22,26,.08)}' +
        '#centrio-widget-header-title{flex:1;min-width:0}' +
        '#centrio-widget-header-name{font-weight:800;font-size:14px;line-height:1.2}' +
        '#centrio-widget-header-status{font-size:11px;opacity:.75;line-height:1.2}' +
        '#centrio-widget-close{background:none;border:none;color:#04161a;cursor:pointer;font-size:20px;line-height:1;padding:4px;opacity:.7}' +
        '#centrio-widget-close:hover{opacity:1}' +
        '#centrio-widget-body{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:9px}' +
        '#centrio-widget-greeting{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:10px;padding:20px}' +
        '#centrio-widget-greeting img{width:52px;height:52px;border-radius:50%;object-fit:contain;box-shadow:0 4px 16px rgba(90,169,255,.25)}' +
        '#centrio-widget-greeting-title{font-size:15px;font-weight:800;color:#F5F1E8}' +
        '#centrio-widget-greeting-sub{font-size:12.5px;color:rgba(245,241,232,.55);max-width:240px;line-height:1.5}' +
        '.centrio-widget-msg{max-width:78%;padding:9px 12px;border-radius:13px;font-size:13.5px;line-height:1.45;word-wrap:break-word}' +
        '.centrio-widget-msg.visitor{align-self:flex-end;background:#5AA9FF;color:#04161a;border-bottom-right-radius:4px;font-weight:500}' +
        '.centrio-widget-msg.operator{align-self:flex-start;background:rgba(255,255,255,.07);border-bottom-left-radius:4px}' +
        '#centrio-widget-form{padding:12px 14px 14px;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:8px;flex-shrink:0}' +
        '#centrio-widget-form input,#centrio-widget-form textarea{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);' +
        'border-radius:10px;color:#F5F1E8;padding:10px 12px;font-size:13.5px;font-family:inherit;outline:none;transition:border-color .15s,background .15s}' +
        '#centrio-widget-form input:focus,#centrio-widget-form textarea:focus{border-color:#5AA9FF;background:rgba(90,169,255,.08)}' +
        '#centrio-widget-form input::placeholder,#centrio-widget-form textarea::placeholder{color:rgba(245,241,232,.35)}' +
        '#centrio-widget-form textarea{resize:none;min-height:44px;font-family:inherit}' +
        '#centrio-widget-send{background:#5AA9FF;color:#04161a;border:none;border-radius:10px;padding:10px;font-weight:700;' +
        'font-size:13.5px;cursor:pointer;transition:opacity .15s}' +
        '#centrio-widget-send:hover{opacity:.9}' +
        '#centrio-widget-send:disabled{opacity:.5;cursor:not-allowed}'

    var styleEl = document.createElement('style')
    styleEl.textContent = css
    document.head.appendChild(styleEl)

    var bubble = document.createElement('button')
    bubble.id = 'centrio-widget-bubble'
    bubble.setAttribute('aria-label', 'Открыть чат')
    bubble.innerHTML = '<img src="' + LOGO_URL + '" alt="">' +
        '<span id="centrio-widget-badge"></span>'
    document.body.appendChild(bubble)

    var panel = document.createElement('div')
    panel.id = 'centrio-widget-panel'
    panel.innerHTML =
        '<div id="centrio-widget-header">' +
        '<img src="' + LOGO_URL + '" alt="">' +
        '<div id="centrio-widget-header-title"><div id="centrio-widget-header-name">Написать нам</div>' +
        '<div id="centrio-widget-header-status">Обычно отвечаем в течение дня</div></div>' +
        '<button id="centrio-widget-close" aria-label="Закрыть">&times;</button>' +
        '</div>' +
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
        if (state.messages.length === 0) {
            bodyEl.innerHTML =
                '<div id="centrio-widget-greeting"><img src="' + LOGO_URL + '" alt="">' +
                '<div id="centrio-widget-greeting-title">Здравствуйте! 👋</div>' +
                '<div id="centrio-widget-greeting-sub">Напишите нам — ответим прямо здесь, как только увидим ваше сообщение.</div></div>'
            return
        }
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
        renderMessages()
        if (state.conversationId) { renderReplyForm(); startPolling() } else { renderStartForm() }
    }

    function closePanel() {
        panelOpen = false
        panel.classList.remove('open')
    }

    bubble.addEventListener('click', function () { panelOpen ? closePanel() : openPanel() })
    panel.querySelector('#centrio-widget-close').addEventListener('click', closePanel)

    if (state.conversationId) startPolling()
})()
