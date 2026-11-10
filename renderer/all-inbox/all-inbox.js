'use strict'
// «Все мессенджеры» (3.8, first version): one list of the chats of every open messenger, freshest first. A click opens
// that chat in its own tab next to the list — replies, files and voice stay in the messenger's real interface.
// The lists are read from the tabs' pages (adapters.js) only while the panel is open; nothing leaves the computer.
const { adapterFor } = require('./adapters')
const { mergeInbox } = require('./merge')

const POLL_MS = 4000
const READ_TIMEOUT_MS = 2500
const OPEN_KEY = 'centrio-all-inbox-open'
const FILTER_KEY = 'centrio-all-inbox-filter'
const TAB_SETTLE_MS = 450

function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))])
}

function readStorage(key, fallback) {
    try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function writeStorage(key, value) {
    try { localStorage.setItem(key, value) } catch {}
}

function initials(title) {
    const words = String(title || '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)
    return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase()
}

function el(tag, cls, text) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}

/**
 * @param {{ state: object, switchTab: (id: string) => void, tGet?: (key: string, fallback: string) => string }} deps
 */
function createAllInbox({ state, switchTab, tGet }) {
    const t = (key, fallback) => (typeof tGet === 'function' ? tGet(`v380.allInbox.${key}`, fallback) : fallback)
    const button = document.getElementById('allInboxBtn')
    const panel = document.getElementById('allInboxPanel')
    if (!button || !panel) return null

    const listEl = panel.querySelector('.ai-list')
    const searchEl = panel.querySelector('.ai-search')
    const countEl = panel.querySelector('.ai-count')
    const badgeEl = button.querySelector('.ai-badge')
    const filterButtons = [...panel.querySelectorAll('[data-ai-filter]')]

    let open = false
    let timer = null
    let reading = false
    let sources = []
    let filter = readStorage(FILTER_KEY, 'all')
    let activeId = ''

    function webviewOf(messengerId) {
        return document.getElementById(`webview-${messengerId}`)
    }

    async function readAll() {
        if (reading) return
        reading = true
        try {
            const jobs = (state.activeMessengers || []).map(async (m) => {
                const view = webviewOf(m.id)
                if (!view || state.sleepingTabs?.has(m.id) || typeof view.executeJavaScript !== 'function') return null
                let url = ''
                try { url = view.getURL() } catch { return null }
                const adapter = adapterFor(url)
                if (!adapter) return null
                const chats = await withTimeout(view.executeJavaScript(adapter.LIST).catch(() => null), READ_TIMEOUT_MS)
                return Array.isArray(chats) ? { messenger: m, chats } : null
            })
            sources = (await Promise.all(jobs)).filter(Boolean)
            render()
        } finally {
            reading = false
        }
    }

    function rowFor(chat) {
        const row = el('button', `ai-row${chat.unread ? ' is-unread' : ''}${chat.id === activeId ? ' is-active' : ''}`)
        row.type = 'button'
        row.dataset.id = chat.id

        const ava = el('div', 'ai-ava')
        if (chat.avatar) {
            const img = el('img')
            img.src = chat.avatar
            img.alt = ''
            img.loading = 'lazy'
            img.onerror = () => { img.remove(); ava.textContent = initials(chat.title) }
            ava.appendChild(img)
        } else {
            ava.textContent = initials(chat.title)
        }
        if (chat.messengerIcon) {
            const mark = el('img', 'ai-service')
            mark.src = chat.messengerIcon
            mark.alt = chat.messengerName
            mark.title = chat.messengerName
            ava.appendChild(mark)
        }

        const body = el('div', 'ai-body')
        const top = el('div', 'ai-top')
        top.append(el('span', 'ai-title', chat.title), el('span', 'ai-time', chat.timeLabel))
        const bottom = el('div', 'ai-bottom')
        bottom.append(el('span', 'ai-preview', chat.preview))
        if (chat.unread) bottom.append(el('span', `ai-unread${chat.muted ? ' is-muted' : ''}`, chat.unread > 999 ? '999+' : String(chat.unread)))
        const from = el('div', 'ai-from', chat.messengerName)
        body.append(top, bottom, from)

        row.append(ava, body)
        row.addEventListener('click', () => openChat(chat))
        return row
    }

    function render() {
        const query = searchEl ? searchEl.value : ''
        const all = mergeInbox(sources, Date.now())
        const list = mergeInbox(sources, Date.now(), { unreadOnly: filter === 'unread', query })
        const unreadChats = all.filter((c) => c.unread > 0 && !c.muted).length
        if (badgeEl) { badgeEl.hidden = unreadChats === 0; badgeEl.textContent = unreadChats > 99 ? '99+' : String(unreadChats) }
        if (countEl) countEl.textContent = String(all.length)
        filterButtons.forEach((b) => b.classList.toggle('is-on', b.dataset.aiFilter === filter))

        listEl.replaceChildren()
        if (!list.length) {
            listEl.append(el('div', 'ai-empty', sources.length
                ? t('empty', 'Здесь пока пусто')
                : t('noSources', 'Откройте Telegram или MAX: их чаты появятся здесь')))
            return
        }
        const frag = document.createDocumentFragment()
        list.forEach((chat) => frag.append(rowFor(chat)))
        listEl.append(frag)
    }

    async function openChat(chat) {
        activeId = chat.id
        listEl.querySelectorAll('.ai-row.is-active').forEach((r) => r.classList.remove('is-active'))
        listEl.querySelector(`.ai-row[data-id="${CSS.escape(chat.id)}"]`)?.classList.add('is-active')
        switchTab(chat.messengerId)
        await new Promise((r) => setTimeout(r, TAB_SETTLE_MS))
        const view = webviewOf(chat.messengerId)
        if (!view) return
        let adapter = null
        try { adapter = adapterFor(view.getURL()) } catch {}
        if (!adapter) return
        const point = await withTimeout(view.executeJavaScript(adapter.locate(chat.key)).catch(() => null), READ_TIMEOUT_MS)
        if (!point || typeof point.x !== 'number') return
        // the pages only react to real clicks; a tab with its own zoom takes the point in screen pixels
        let zoom = 1
        try { zoom = Number(view.getZoomFactor()) || 1 } catch {}
        const x = Math.round(point.x * zoom)
        const y = Math.round(point.y * zoom)
        for (const type of ['mouseDown', 'mouseUp']) view.sendInputEvent({ type, x, y, button: 'left', clickCount: 1 })
        setTimeout(readAll, 900)
    }

    // The sidebar can sit on either side and is moved at start-up: the list always goes between it and the page
    function place() {
        const bar = document.getElementById('activityBar')
        const content = document.getElementById('contentArea')
        if (!content) return
        if (bar && bar.nextElementSibling !== panel && (bar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING)) bar.after(panel)
        else if (!bar || !(bar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING)) content.before(panel)
    }

    function setOpen(next) {
        open = next
        if (open) place()
        document.body.classList.toggle('all-inbox-open', open)
        button.classList.toggle('active', open)
        panel.hidden = !open
        writeStorage(OPEN_KEY, open ? '1' : '')
        clearInterval(timer)
        timer = null
        if (open) {
            readAll()
            timer = setInterval(readAll, POLL_MS)
        }
    }

    button.addEventListener('click', () => setOpen(!open))
    panel.querySelector('.ai-close')?.addEventListener('click', () => setOpen(false))
    searchEl?.addEventListener('input', render)
    filterButtons.forEach((b) => b.addEventListener('click', () => {
        filter = b.dataset.aiFilter
        writeStorage(FILTER_KEY, filter)
        render()
    }))

    if (readStorage(OPEN_KEY, '') === '1') setOpen(true)
    return { setOpen, refresh: readAll, isOpen: () => open }
}

module.exports = { createAllInbox }
