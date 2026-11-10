'use strict'
// «Все мессенджеры» (3.8, first version): one list of the chats of every open messenger, freshest first. A click opens
// that chat in its own tab next to the list — replies, files and voice stay in the messenger's real interface.
// The lists are read from the tabs' pages (adapters.js) only while the panel is open; nothing leaves the computer.
const { adapterFor } = require('./adapters')
const { mergeInbox } = require('./merge')
const { createChatController, clickAt } = require('./chat-controller')

const POLL_MS = 4000
const READ_TIMEOUT_MS = 2500
const OPEN_KEY = 'centrio-all-inbox-open'
const FILTER_KEY = 'centrio-all-inbox-filter'
const SOURCE_KEY = 'centrio-all-inbox-source'
// «Избранное» and other chats drawn with an icon of their own
const CHAT_ICONS = {
    saved: '<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"/></svg>'
}
const TAB_SETTLE_MS = 450
const LOCATE_TIMEOUT_MS = 8000
const PATHS_KEY = 'centrio-all-inbox-paths'
const WARM_CLASS = 'inbox-warm'

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
 * @param {{ state: object, switchTab: (id: string) => void, tGet?: (key: string, fallback: string) => string,
 *   ipcRenderer: { send: Function, invoke: Function } }} deps
 */
function createAllInbox({ state, switchTab, tGet, ipcRenderer }) {
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
    let source = readStorage(SOURCE_KEY, '')
    let lastListSig = ''
    const sourcesEl = document.createElement('div')
    sourcesEl.className = 'ai-sources'
    sourcesEl.setAttribute('role', 'toolbar')
    sourcesEl.setAttribute('aria-label', t('sources', 'Мессенджеры'))
    panel.querySelector('.ai-tools')?.append(sourcesEl)
    let activeId = ''
    let paths = {}
    try { paths = JSON.parse(readStorage(PATHS_KEY, '{}')) || {} } catch { paths = {} }
    const contentArea = document.getElementById('contentArea')
    const chats = contentArea ? createChatController({ state, webviewOf: (id) => document.getElementById(`webview-${id}`), host: contentArea, ipcRenderer }) : null

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
                // MAX walks its list through only while the person is not looking at that tab
                const script = typeof adapter.listScript === 'function' ? adapter.listScript({ sweep: state.activeTabId !== m.id }) : adapter.LIST
                const chats = await withTimeout(view.executeJavaScript(script).catch(() => null), READ_TIMEOUT_MS)
                // a messenger that was never opened since start-up does not start in a page without layout
                // (Telegram waits for a frame to draw): it gets an invisible layout until its chats show up
                view.classList.toggle(WARM_CLASS, !(Array.isArray(chats) && chats.length))
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

        const ava = el('div', `ai-ava${chat.icon ? ` is-icon is-${chat.icon}` : ''}`)
        if (chat.icon && CHAT_ICONS[chat.icon]) {
            ava.innerHTML = CHAT_ICONS[chat.icon]
        } else if (chat.avatar) {
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

    // one round button per messenger tab: the list can be narrowed to it
    function renderSources(all) {
        const present = sources.map((src) => src.messenger)
        if (source && !present.some((m) => m.id === source)) source = ''
        const sig = present.map((m) => m.id + ':' + all.filter((c) => c.messengerId === m.id && c.unread > 0 && !c.muted).length).join('|') + '#' + source
        if (sourcesEl.dataset.sig === sig) return
        sourcesEl.dataset.sig = sig
        sourcesEl.replaceChildren()
        sourcesEl.hidden = present.length < 2
        for (const m of present) {
            const b = el('button', `ai-src${source === m.id ? ' is-on' : ''}${source && source !== m.id ? ' is-dim' : ''}`)
            b.type = 'button'
            b.title = m.name
            b.setAttribute('aria-pressed', String(source === m.id))
            if (m.icon) { const img = el('img'); img.src = m.icon; img.alt = ''; b.append(img) }
            b.append(el('span', 'ai-src-name', m.name))
            const unread = all.filter((c) => c.messengerId === m.id && c.unread > 0 && !c.muted).length
            if (unread) b.append(el('span', 'ai-src-dot', unread > 99 ? '99+' : String(unread)))
            b.addEventListener('click', () => {
                source = source === m.id ? '' : m.id
                writeStorage(SOURCE_KEY, source)
                lastListSig = ''
                render()
                listEl.scrollTop = 0
            })
            sourcesEl.append(b)
        }
        sourcesEl.querySelector('.ai-src.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }

    function render() {
        const query = searchEl ? searchEl.value : ''
        const all = mergeInbox(sources, Date.now())
        const list = mergeInbox(sources, Date.now(), { unreadOnly: filter === 'unread', query, messengerId: source })
        renderSources(all)
        const unreadChats = all.filter((c) => c.unread > 0 && !c.muted).length
        if (badgeEl) { badgeEl.hidden = unreadChats === 0; badgeEl.textContent = unreadChats > 99 ? '99+' : String(unreadChats) }
        if (countEl) countEl.textContent = String(all.length)
        filterButtons.forEach((b) => b.classList.toggle('is-on', b.dataset.aiFilter === filter))

        // the list is drawn again only when something in it changed: no blinking pictures, hover and scroll stay
        const sig = list.map((c) => `${c.id}|${c.unread}|${c.muted ? 1 : 0}|${c.timeLabel}|${c.preview}|${c.avatar.length}|${c.title}|${c.icon}`).join(';') + '#' + activeId
        if (sig === lastListSig) return
        lastListSig = sig
        const keepScroll = listEl.scrollTop
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
        listEl.scrollTop = keepScroll
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
        const run = (code, ms = READ_TIMEOUT_MS) => withTimeout(view.executeJavaScript(code).catch(() => null), ms)
        const knownPath = paths[chat.id]
        let opened = false
        if (typeof adapter.open === 'function') {
            // Telegram opens a chat by its id itself: nothing is clicked
            opened = (await run(adapter.open(chat.key))) === true
        } else if (knownPath && typeof adapter.navigate === 'function') {
            // MAX: a chat opened before is opened again by its address
            opened = (await run(adapter.navigate(knownPath))) === true
        }
        if (!opened) {
            // the first time: a real click on the chat in the messenger's own list (the pages ignore synthetic ones)
            const point = await run(adapter.locate(chat.key), LOCATE_TIMEOUT_MS)
            if (!point || typeof point.x !== 'number') { chats?.close(); return }
            clickAt(view, point)
        }
        // our conversation window goes over the tab, which keeps working behind it; once the right chat is confirmed
        // open, its address is remembered for next time
        chats?.open(chat, adapter.id, async () => {
            if (!adapter.PATH) return
            const path = await run(adapter.PATH)
            if (path) { paths[chat.id] = path; writeStorage(PATHS_KEY, JSON.stringify(paths)) }
        })
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
        else { chats?.close(); document.querySelectorAll(`webview.${WARM_CLASS}`).forEach((v) => v.classList.remove(WARM_CLASS)) }
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
    return { setOpen, refresh: readAll, isOpen: () => open, openChatView: (chat, adapterId) => chats?.open(chat, adapterId) }
}

module.exports = { createAllInbox }
