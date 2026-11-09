// Morning summary and the assistant's own messages (3.7.1).
// Once a day, when the person sits down at the computer in the morning (after the work day starts, if a schedule is
// set), the assistant writes what came in while they were away. The card shows next to the assistant button even with
// the panel closed; the same text goes into the assistant chat. The summary is built on the computer
// (morning-summary-logic.js); only "Разобрать с ассистентом" sends anything to the AI, and only when the person asks.
const { buildMorningSummary, shouldShowMorningSummary } = require('./morning-summary-logic')
const { isWithinWorkHours } = require('../shared/work-hours')

const CHECK_MS = 60 * 1000
const ACTIVE_WINDOW_MS = 2 * 60 * 1000
const SAVE_ACTIVITY_MS = 5 * 60 * 1000
const AWAY_MIN_MS = 4 * 60 * 60 * 1000
const FALLBACK_SINCE_MS = 16 * 60 * 60 * 1000

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function createMorningSummary({ state, store, tGet, switchTab, assistantUi, openAssistant, getNotifications, hasEffectivePro }) {
    const t = (key, params) => tGet(`v371.ms.${key}`, params)
    const readState = () => store.get('morningSummary', {}) || {}
    const writeState = (patch) => store.set('morningSummary', { ...readState(), ...patch })

    // When the person was last at the computer before this session: the summary covers everything after that.
    const previousActivity = Number(readState().lastActiveAt) || 0
    let lastInputAt = Date.now()
    let lastSavedAt = 0
    let card = null

    const markInput = () => {
        lastInputAt = Date.now()
        if (lastInputAt - lastSavedAt > SAVE_ACTIVITY_MS) { lastSavedAt = lastInputAt; writeState({ lastActiveAt: lastInputAt }) }
    }
    ;['mousemove', 'keydown', 'mousedown', 'wheel'].forEach((type) => window.addEventListener(type, markInput, { passive: true }))

    function openTodosCount() {
        const data = store.get('todos', null)
        const items = data && Array.isArray(data.items) ? data.items : []
        return items.filter((i) => !i.done && !i.completed).length
    }

    function sinceMs() {
        const now = Date.now()
        if (previousActivity && now - previousActivity >= AWAY_MIN_MS) return previousActivity
        return now - FALLBACK_SINCE_MS
    }

    function current() {
        return buildMorningSummary({
            messengers: (state.activeMessengers || []).map((m) => ({ id: m.id, name: m.name })),
            unread: state.unreadCounts || {},
            notifications: getNotifications(),
            since: sinceMs(),
            openTodos: openTodosCount()
        })
    }

    function senderLine(service) {
        const names = service.senders.map((s) => (s.count > 1 ? `${s.name} (${s.count})` : s.name))
        if (service.moreSenders) names.push(t('more', { n: service.moreSenders }))
        return names.join(', ')
    }

    function asText(summary) {
        const lines = [summary.totalUnread ? t('leadUnread', { n: summary.totalUnread }) : t('leadQuiet')]
        summary.services.forEach((s) => {
            const who = senderLine(s)
            lines.push(`• ${s.name}${s.unread ? ` — ${s.unread}` : ''}${who ? `: ${who}` : ''}`)
        })
        if (summary.openTodos) lines.push(t('todos', { n: summary.openTodos }))
        return lines.join('\n')
    }

    function greeting() {
        const h = new Date().getHours()
        return h < 12 ? t('morning') : t('day')
    }

    // ── The card next to the assistant button ────────────────────────────────
    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }

    function setBadge(on) {
        document.getElementById('assistantBtn')?.classList.toggle('has-assistant-news', on)
    }

    function hideCard() {
        card?.classList.add('leaving')
        const old = card
        card = null
        setTimeout(() => old?.remove(), 220)
    }

    /** message: { title, lines: string[], actions: [{ label, primary?, run }] } */
    function showCard(message) {
        hideCard()
        card = el('div', 'ai-bubble')
        card.setAttribute('role', 'status')
        const head = el('div', 'ai-bubble-head')
        const logo = el('img', 'ai-bubble-logo')
        logo.src = 'assets/logo.png'
        logo.alt = ''
        head.appendChild(logo)
        head.appendChild(el('div', 'ai-bubble-title', message.title))
        const close = el('button', 'ai-bubble-x', '×')
        close.type = 'button'
        close.title = t('hide')
        close.addEventListener('click', (e) => { e.stopPropagation(); hideCard() })
        head.appendChild(close)
        card.appendChild(head)
        const body = el('div', 'ai-bubble-body')
        message.lines.forEach((line) => body.appendChild(el('div', line.startsWith('•') ? 'ai-bubble-line ai-bubble-item' : 'ai-bubble-line', line)))
        card.appendChild(body)
        const actions = el('div', 'ai-bubble-actions')
        message.actions.forEach((a) => {
            const b = el('button', a.primary ? 'ai-bubble-btn primary' : 'ai-bubble-btn', a.label)
            b.type = 'button'
            b.addEventListener('click', (e) => { e.stopPropagation(); hideCard(); setBadge(false); a.run() })
            actions.appendChild(b)
        })
        card.appendChild(actions)
        card.addEventListener('click', () => { hideCard(); setBadge(false); openAssistant() })
        document.body.appendChild(card)
        requestAnimationFrame(() => card?.classList.add('shown'))
    }

    document.getElementById('assistantBtn')?.addEventListener('click', () => { setBadge(false); hideCard() })

    // ── The summary itself ────────────────────────────────────────────────────
    function present(summary, { force = false } = {}) {
        if (summary.isEmpty && !force) return false
        const text = asText(summary)
        assistantUi?.addProactiveMessage?.(`${greeting()}\n${text}`)
        setBadge(true)
        const top = summary.services[0]
        const actions = []
        if (top) actions.push({ label: t('open', { name: top.name }), primary: true, run: () => switchTab(top.id) })
        if (typeof hasEffectivePro === 'function' && hasEffectivePro() && !summary.isEmpty) {
            actions.push({ label: t('discuss'), run: () => { openAssistant(); assistantUi?.ask?.(t('discussPrompt')) } })
        }
        actions.push({ label: t('later'), run: () => {} })
        showCard({ title: greeting(), lines: text.split('\n'), actions })
        return true
    }

    function workStarted(now) {
        const wh = window.__centrioWorkHours
        if (!wh) return true
        const p = wh.personal()
        if (p.enabled) return isWithinWorkHours(p.schedule, now)
        const team = wh.team()
        if (team.schedule && (state.activeMessengers || []).some((m) => m.orgAssigned)) return isWithinWorkHours(team.schedule, now, team.timeZone)
        return true
    }

    function check() {
        const now = new Date()
        const s = readState()
        const show = shouldShowMorningSummary({
            enabled: s.enabled !== false,
            lastDay: s.lastDay,
            today: localDay(now),
            hour: now.getHours(),
            workStarted: workStarted(now),
            userActive: document.hasFocus() && Date.now() - lastInputAt < ACTIVE_WINDOW_MS
        })
        if (!show) return
        writeState({ lastDay: localDay(now) })
        present(current())
    }

    setInterval(check, CHECK_MS)
    setTimeout(check, 20 * 1000)

    return {
        current,
        showNow: () => present(current(), { force: true }),
        isEnabled: () => readState().enabled !== false,
        setEnabled: (on) => writeState({ enabled: !!on })
    }
}

module.exports = { createMorningSummary }
