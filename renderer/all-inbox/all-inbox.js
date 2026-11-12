'use strict'
// «Все мессенджеры» (3.8, first version): one list of the chats of every open messenger, freshest first. A click opens
// that chat in its own tab next to the list — replies, files and voice stay in the messenger's real interface.
// The lists are read from the tabs' pages (adapters.js) only while the panel is open; nothing leaves the computer.
const { adapterFor } = require('./adapters')
const { mergeInbox } = require('./merge')
const { attachPanelResize } = require('./panel-resize')
const { createChatController, clickAt } = require('./chat-controller')
const { sharedDrafts } = require('./drafts')
const { kindFromSubtitle, createChannelMemory, withChannelKinds } = require('./channel-memory')
const { createFolderBar, FOLDER_PREFIX } = require('./folders-ui')
const { attachFolderRail } = require('./folder-rail')

// remembered channels (MAX does not mark them in its list): a small JSON in this computer's local storage
const channelMemory = createChannelMemory({
    get: (key) => JSON.parse(readStorage(key, 'null')),
    set: (key, value) => writeStorage(key, JSON.stringify(value))
})

// every messenger is read this often; each one shows the moment it answers, a slow one never holds the others up
const POLL_MS = 2000
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
const FILTERS = ['all', 'unread', 'personal', 'groups', 'channels']
const SKELETON_ROWS = 9
const SLIDE_MS = 260
const ICONS = {
    sent: '<svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6l3 3 6.5-7.5"/></svg>',
    read: '<svg width="17" height="11" viewBox="0 0 17 11" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 6l3 3 6.5-7.5M8 8.6l.9.9 6.5-7.5"/></svg>',
    pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 2.6a1 1 0 0 1 1.4 0l5.5 5.5a1 1 0 0 1 0 1.4l-1.2 1.2a2 2 0 0 1-2 .5l-3 3 .2 3.3a1 1 0 0 1-1.7.8l-3.2-3.2-4.6 4.6a.9.9 0 0 1-1.3-1.3l4.6-4.6-3.2-3.2a1 1 0 0 1 .8-1.7l3.3.2 3-3a2 2 0 0 1 .5-2z"/></svg>',
    muted: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H3v6h3l5 4z" fill="currentColor"/><path d="M22 9l-6 6M16 9l6 6"/></svg>'
}

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

function icon(name, cls) {
    const span = document.createElement('span')
    span.className = cls
    span.innerHTML = ICONS[name]
    return span
}

// the title with the searched part marked, built from text nodes (titles come from web pages)
function titleNode(chat) {
    const span = el('span', 'ai-title')
    const m = chat.match
    if (!m) { span.textContent = chat.title; return span }
    span.append(chat.title.slice(0, m.start), el('mark', 'ai-hit', chat.title.slice(m.start, m.start + m.length)), chat.title.slice(m.start + m.length))
    return span
}

// a steady colour per name for avatars without a picture
function toneOf(title) {
    let h = 7
    for (const ch of String(title)) h = (h * 31 + ch.codePointAt(0)) | 0
    return String(Math.abs(h) % 7)
}

function el(tag, cls, text) {
    const node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
}

/**
 * @param {{ state: object, switchTab: (id: string) => void, tGet?: (key: string, fallback: string) => string,
 *   ipcRenderer: { send: Function, invoke: Function }, canOpen?: (opts: { quiet: boolean }) => boolean }} deps
 * canOpen: the PRO and on/off check of access.js; quiet = no upgrade window (opening by itself at start-up)
 */
function createAllInbox({ state, switchTab, tGet, ipcRenderer, canOpen, store = null }) {
    const t = (key, fallback) => (typeof tGet === 'function' ? tGet(`v380.allInbox.${key}`, fallback) : fallback)
    const button = document.getElementById('allInboxBtn')
    const panel = document.getElementById('allInboxPanel')
    if (!button || !panel) return null

    const listEl = panel.querySelector('.ai-list')
    const searchEl = panel.querySelector('.ai-search')
    const countEl = panel.querySelector('.ai-count')
    const badgeEl = button.querySelector('.ai-badge')
    const filterButtons = [...panel.querySelectorAll('[data-ai-filter]')]
    // filters and folders in a column on the left (3.8.3, folder-rail.js)
    const rail = attachFolderRail({ panel, store })

    let open = false
    let timer = null
    let reading = false
    let sources = []
    const lastChats = new Map()
    const services = new Map()
    const savedFilter = readStorage(FILTER_KEY, 'all')
    let filter = FILTERS.includes(savedFilter) || String(savedFilter).startsWith(FOLDER_PREFIX) ? savedFilter : 'all'
    let loadedOnce = false
    let folderBar = null
    // a list the person changed (filter, search, messenger) is drawn at once, without sliding
    let quietOnce = false
    const clearEl = panel.querySelector('.ai-search-clear')
    let source = readStorage(SOURCE_KEY, '')
    let lastListSig = ''
    let rowCache = new Map()
    const sourcesEl = document.createElement('div')
    sourcesEl.className = 'ai-sources'
    sourcesEl.setAttribute('role', 'toolbar')
    sourcesEl.setAttribute('aria-label', t('sources', 'Мессенджеры'))
    // the messengers that do not fit are reached by arrows at the ends of the row (Oleg, 2026-11-12: only four were seen,
    // nothing told the row scrolls); a fade marks the side where more are hidden
    const sourcesWrap = document.createElement('div')
    sourcesWrap.className = 'ai-sources-wrap'
    const sourceArrows = ['prev', 'next'].map((side) => {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = `ai-sources-arrow is-${side}`
        b.tabIndex = -1
        b.setAttribute('aria-label', side === 'prev' ? t('sourcesPrev', 'Назад') : t('sourcesNext', 'Ещё мессенджеры'))
        b.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="${side === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg>`
        b.addEventListener('click', () => sourcesEl.scrollBy({ left: (side === 'prev' ? -1 : 1) * sourcesEl.clientWidth * 0.8, behavior: 'smooth' }))
        return b
    })
    sourcesWrap.append(sourceArrows[0], sourcesEl, sourceArrows[1])
    panel.querySelector('.ai-tools')?.append(sourcesWrap)
    function updateSourceEnds() {
        const more = sourcesEl.scrollWidth - sourcesEl.clientWidth > 2
        const atStart = sourcesEl.scrollLeft <= 2
        const atEnd = sourcesEl.scrollLeft >= sourcesEl.scrollWidth - sourcesEl.clientWidth - 2
        sourcesWrap.classList.toggle('has-prev', more && !atStart)
        sourcesWrap.classList.toggle('has-next', more && !atEnd)
    }
    sourcesEl.addEventListener('scroll', updateSourceEnds, { passive: true })
    if (typeof ResizeObserver === 'function') new ResizeObserver(updateSourceEnds).observe(sourcesEl)
    // the rows of filters and messengers scroll sideways with the ordinary mouse wheel
    for (const strip of [sourcesEl, panel.querySelector('.ai-filters')]) {
        strip?.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || strip.scrollWidth <= strip.clientWidth) return
            e.preventDefault()
            strip.scrollLeft += e.deltaY
        }, { passive: false })
    }
    let activeId = ''
    let paths = {}
    try { paths = JSON.parse(readStorage(PATHS_KEY, '{}')) || {} } catch { paths = {} }
    const contentArea = document.getElementById('contentArea')
    // a chat whose open window says «… подписчиков» / «… участников» is a channel / group from now on (channel-memory.js)
    const onSubtitle = (chat, subtitle) => {
        const kind = kindFromSubtitle(subtitle)
        if (!chat || !kind || channelMemory.kindOf(chat.messengerId, chat.title) === kind) return
        channelMemory.remember(chat.messengerId, chat.title, kind)
        lastListSig = ''
        render()
    }
    const chats = contentArea ? createChatController({ state, webviewOf: (id) => document.getElementById(`webview-${id}`), host: contentArea, ipcRenderer, onSubtitle }) : null

    function webviewOf(messengerId) {
        return document.getElementById(`webview-${messengerId}`)
    }

    async function readAll() {
        if (reading) return
        reading = true
        try {
            // a tab that is asleep or slow this time keeps the chats it gave last time: the list never blinks
            const kept = (m) => (lastChats.has(m.id) ? { messenger: { ...m, service: services.get(m.id) || '' }, chats: lastChats.get(m.id) } : null)
            const jobs = (state.activeMessengers || []).map(async (m) => {
                const view = webviewOf(m.id)
                if (!view || typeof view.executeJavaScript !== 'function') return null
                if (state.sleepingTabs?.has(m.id)) return kept(m)
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
                if (!Array.isArray(chats) || (!chats.length && lastChats.get(m.id)?.length)) return kept(m)
                lastChats.set(m.id, chats)
                services.set(m.id, adapter.id)
                return { messenger: { ...m, service: adapter.id }, chats }
            })
            // each answer is drawn as soon as it comes (one frame for answers that come together)
            const order = (state.activeMessengers || []).map((m) => m.id)
            const got = new Map()
            const pendingIds = new Set(order)
            let frame = 0
            const draw = () => {
                frame = 0
                sources = order.map((id) => got.get(id)).filter(Boolean).concat(sources.filter((x) => pendingIds.has(x.messenger.id)))
                sources.sort((a, b) => order.indexOf(a.messenger.id) - order.indexOf(b.messenger.id))
                render()
            }
            await Promise.all(jobs.map((job, i) => job.then((r) => {
                const id = order[i]
                pendingIds.delete(id)
                if (r) got.set(id, r)
                if (!frame) frame = requestAnimationFrame(draw)
            })))
            if (frame) cancelAnimationFrame(frame)
            sources = order.map((id) => got.get(id)).filter(Boolean)
            loadedOnce = true
            render()
        } finally {
            reading = false
        }
    }

    function rowFor(chat) {
        const row = el('button', `ai-row${chat.unread ? ' is-unread' : ''}${chat.id === activeId ? ' is-active' : ''}${chat.muted ? ' is-muted' : ''}`)
        row.type = 'button'
        row.dataset.id = chat.id
        row.setAttribute('role', 'listitem')

        const ava = el('div', `ai-ava${chat.icon ? ` is-icon is-${chat.icon}` : ''}`)
        if (chat.icon && CHAT_ICONS[chat.icon]) {
            ava.innerHTML = CHAT_ICONS[chat.icon]
        } else if (chat.avatar) {
            const img = el('img')
            img.src = chat.avatar
            img.alt = ''
            img.loading = 'lazy'
            img.onerror = () => { img.remove(); ava.prepend(initials(chat.title)); ava.dataset.tone = toneOf(chat.title) }
            ava.appendChild(img)
        } else {
            ava.textContent = initials(chat.title)
            ava.dataset.tone = toneOf(chat.title)
        }
        if (chat.messengerIcon) {
            const mark = el('img', 'ai-service')
            mark.src = chat.messengerIcon
            mark.alt = chat.messengerName
            mark.title = chat.messengerName
            if (chat.accountTone >= 0) mark.dataset.acc = String(chat.accountTone)
            ava.appendChild(mark)
        }
        if (chat.online) ava.append(el('span', 'ai-online'))

        const body = el('div', 'ai-body')
        const top = el('div', 'ai-top')
        top.append(titleNode(chat))
        if (chat.muted) { const m = icon('muted', 'ai-muted'); m.title = t('muted', 'Без звука'); top.append(m) }
        const meta = el('span', 'ai-meta')
        if (chat.outState) meta.append(icon(chat.outState, `ai-ticks is-${chat.outState}`))
        meta.append(el('span', 'ai-time', chat.timeLabel))
        top.append(meta)

        const bottom = el('div', 'ai-bottom')
        // what you typed and did not send (here or in the messenger) is shown in place of the last message
        const draft = chat.id === activeId ? '' : (sharedDrafts.take(chat.id).replace(/\s+/g, ' ').trim() || chat.draft)
        const preview = el('span', 'ai-preview')
        if (chat.typing) { preview.classList.add('is-typing'); preview.append(chat.typing, el('span', 'ai-dots')) }
        else if (draft && !chat.unread) preview.append(el('span', 'ai-draft', t('draft', 'Черновик') + ': '), draft)
        else preview.textContent = chat.preview
        bottom.append(preview)
        if (chat.mentions) { const at = el('span', 'ai-mention', '@'); at.title = t('mentions', 'Вас упомянули'); bottom.append(at) }
        if (chat.unread) bottom.append(el('span', `ai-unread${chat.muted ? ' is-muted' : ''}`, chat.unread > 999 ? '999+' : String(chat.unread)))
        else if (chat.pinned) { const p = icon('pin', 'ai-pin'); p.title = t('pinned', 'Закреплён'); bottom.append(p) }
        body.append(top, bottom)

        row.title = chat.accountLabel ? `${chat.title} — ${chat.messengerName}` : chat.title
        row.append(ava, body)
        row.addEventListener('click', () => openChat(chat))
        return row
    }

    // everything a row shows: the same string means the same row
    function rowSig(c) {
        return [c.id, c.unread, c.muted ? 1 : 0, c.timeLabel, c.preview, c.avatar.length, c.title, c.icon, c.online ? 1 : 0, c.outState,
            c.pinned ? 1 : 0, c.accountLabel, c.accountTone, c.draft, c.mentions, c.typing, sharedDrafts.take(c.id), c.match ? `${c.match.start}:${c.match.length}` : '',
            c.id === activeId ? 1 : 0].join('|')
    }

    function skeleton() {
        const frag = document.createDocumentFragment()
        for (let i = 0; i < SKELETON_ROWS; i++) {
            const row = el('div', 'ai-row is-skeleton')
            row.style.setProperty('--w1', `${45 + (i * 17) % 35}%`)
            row.style.setProperty('--w2', `${60 + (i * 23) % 30}%`)
            row.append(el('div', 'ai-ava'), el('div', 'ai-body'))
            frag.append(row)
        }
        return frag
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
            if (m.icon) {
                const img = el('img'); img.src = m.icon; img.alt = ''
                const tone = all.find((c) => c.messengerId === m.id)?.accountTone
                if (tone >= 0) img.dataset.acc = String(tone)
                b.append(img)
            }
            b.append(el('span', 'ai-src-name', m.name))
            const unread = all.filter((c) => c.messengerId === m.id && c.unread > 0 && !c.muted).length
            if (unread) b.append(el('span', 'ai-src-dot', unread > 99 ? '99+' : String(unread)))
            b.addEventListener('click', () => {
                source = source === m.id ? '' : m.id
                writeStorage(SOURCE_KEY, source)
                lastListSig = ''
                quietOnce = true
                render()
                listEl.scrollTop = 0
            })
            sourcesEl.append(b)
        }
        sourcesEl.querySelector('.ai-src.is-on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        sourcesWrap.hidden = sourcesEl.hidden
        updateSourceEnds()
    }

    // how many rows are drawn: grows by a page as the list is scrolled to its end, starts again on a new filter or search
    const DRAW_PAGE = 120
    let drawLimit = DRAW_PAGE
    let drawnFor = ''
    listEl.addEventListener('scroll', () => {
        if (listEl.scrollTop + listEl.clientHeight < listEl.scrollHeight - 600) return
        const before = drawLimit
        drawLimit += DRAW_PAGE
        if (before !== drawLimit) { quietOnce = true; render() }
    }, { passive: true })

    function render() {
        const query = searchEl ? searchEl.value : ''
        const viewKey = [filter, query, source].join('|')
        if (viewKey !== drawnFor) { drawnFor = viewKey; drawLimit = DRAW_PAGE }
        const known = withChannelKinds(sources, channelMemory)
        const all = mergeInbox(known, Date.now())
        const chatIds = folderBar ? folderBar.chatsOf(filter) : null
        const list = mergeInbox(known, Date.now(), { unreadOnly: filter === 'unread', kind: chatIds ? '' : filter, chatIds, query, messengerId: source })
        if (clearEl) clearEl.hidden = !query
        renderSources(all)
        const unreadChats = all.filter((c) => c.unread > 0 && !c.muted).length
        if (badgeEl) { badgeEl.hidden = unreadChats === 0; badgeEl.textContent = unreadChats > 99 ? '99+' : String(unreadChats) }
        if (countEl) countEl.textContent = String(all.length)
        filterButtons.forEach((b) => b.classList.toggle('is-on', b.dataset.aiFilter === filter))
        // unread chats of every filter and folder, in the column — counted in one pass over the list (3.8.3: with every
        // chat listed, counting each filter separately stalled typing)
        if (rail) {
            const byKind = { personal: 0, groups: 0, channels: 0 }
            const unreadIds = new Set()
            for (const c of all) {
                if (!(c.unread > 0) || c.muted) continue
                unreadIds.add(c.id)
                if (c.kind === 'user' || c.kind === 'bot' || c.kind === 'saved') byKind.personal++
                else if (c.kind === 'group') byKind.groups++
                else if (c.kind === 'channel') byKind.channels++
            }
            for (const b of filterButtons) {
                const f = b.dataset.aiFilter
                rail.setCount(b, f === 'all' || f === 'unread' ? unreadChats : (byKind[f] || 0))
            }
            if (folderBar) folderBar.setCounts((ids) => { let n = 0; for (const id of ids) if (unreadIds.has(id)) n++; return n })
        }
        panel.querySelectorAll('.ai-folder').forEach((b) => b.classList.toggle('is-on', FOLDER_PREFIX + b.dataset.aiFolder === filter))

        // only the first rows are drawn; more come as the list is scrolled down (3.8.3: with every chat of every
        // messenger listed, drawing them all on each update stalled typing)
        const shown = list.slice(0, drawLimit)
        // the list is drawn again only when something in it changed: no blinking pictures, hover and scroll stay
        const sigs = shown.map(rowSig)
        const sig = sigs.join(';') + '#' + loadedOnce + '#' + (list.length > shown.length ? list.length : '')
        if (sig === lastListSig) return
        lastListSig = sig
        const keepScroll = listEl.scrollTop
        // where each chat stood before: a chat lifted by a new message slides to its place instead of jumping
        const before = new Map()
        if (!quietOnce) for (const r of listEl.querySelectorAll('.ai-row[data-id]')) before.set(r.dataset.id, r.getBoundingClientRect().top)
        quietOnce = false
        listEl.replaceChildren()
        if (!list.length) rowCache = new Map()
        if (!list.length && !loadedOnce) { listEl.append(skeleton()); return }
        if (!list.length) {
            listEl.append(el('div', 'ai-empty', sources.length
                ? t('empty', 'Здесь пока пусто')
                : t('noSources', 'Откройте Telegram или MAX: их чаты появятся здесь')))
            return
        }
        // a chat that did not change keeps its row (and its decoded picture); only changed ones are built again
        const next = new Map()
        const frag = document.createDocumentFragment()
        shown.forEach((chat, i) => {
            const kept = rowCache.get(chat.id)
            const row = kept && kept.sig === sigs[i] ? kept.row : rowFor(chat)
            next.set(chat.id, { sig: sigs[i], row })
            frag.append(row)
        })
        rowCache = next
        listEl.append(frag)
        listEl.scrollTop = keepScroll
        slide(before)
    }

    const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    function slide(before) {
        if (!before.size || calm()) return
        const view = listEl.getBoundingClientRect()
        for (const row of listEl.querySelectorAll('.ai-row[data-id]')) {
            const top = row.getBoundingClientRect().top
            if (top > view.bottom || top + row.offsetHeight < view.top) continue
            const was = before.get(row.dataset.id)
            if (was === undefined) { row.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: SLIDE_MS, easing: 'ease-out' }); continue }
            const dy = was - top
            if (Math.abs(dy) < 1) continue
            row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: SLIDE_MS, easing: 'cubic-bezier(.2, .8, .2, 1)' })
        }
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

    // the list is as wide as the person made it (its edge next to the page is dragged)
    const resize = attachPanelResize({ panel, contentOf: () => document.getElementById('contentArea') })

    function setOpen(next, { quiet = false } = {}) {
        if (next && canOpen && !canOpen({ quiet })) return
        open = next
        if (open) { place(); resize.placeEdge() }
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
    searchEl?.addEventListener('input', () => { quietOnce = true; render() })
    clearEl?.addEventListener('click', (e) => { e.preventDefault(); searchEl.value = ''; render(); searchEl.focus() })
    // ↑/↓ walk the list (from the search field too), Enter opens, Esc clears the search
    function moveFocus(step) {
        const rows = [...listEl.querySelectorAll('.ai-row:not(.is-skeleton)')]
        if (!rows.length) return
        const at = rows.indexOf(document.activeElement)
        const next = rows[Math.max(0, Math.min(rows.length - 1, at < 0 ? 0 : at + step))]
        next.focus()
        next.scrollIntoView({ block: 'nearest' })
    }
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(e.key === 'ArrowDown' ? 1 : -1); return }
        if (e.key === 'Enter' && e.target === searchEl) { e.preventDefault(); listEl.querySelector('.ai-row:not(.is-skeleton)')?.click(); return }
        if (e.key === 'Escape' && searchEl && searchEl.value) { e.preventDefault(); searchEl.value = ''; render(); searchEl.focus() }
    })
    // Ctrl+F (or «/») goes to the search; inside an open conversation Ctrl+F is left to it
    document.addEventListener('keydown', (e) => {
        if (!open || !searchEl) return
        const active = document.activeElement
        const typing = /^(INPUT|TEXTAREA)$/.test(active?.tagName || '') || active?.isContentEditable
        const inChat = active?.closest?.('.aic')
        if (((e.ctrlKey || e.metaKey) && e.code === 'KeyF' && !inChat) || (e.key === '/' && !typing && !inChat)) {
            e.preventDefault()
            searchEl.focus()
            searchEl.select()
        }
    })
    function selectFilter(next) {
        filter = next
        writeStorage(FILTER_KEY, filter)
        lastListSig = ''
        quietOnce = true
        render()
        listEl.scrollTop = 0
    }
    filterButtons.forEach((b) => b.addEventListener('click', () => selectFilter(b.dataset.aiFilter)))

    // own folders (3.8.3): chips after the filters, a right click on a chat puts it into one (folders-ui.js)
    folderBar = store ? createFolderBar({ panel, store, isOn: (f) => f === filter, onSelect: selectFilter, onChange: () => { lastListSig = ''; render() } }) : null
    if (!FILTERS.includes(filter) && !(folderBar && folderBar.exists(filter))) filter = 'all'
    if (rail && !rail.autoFiltersOn() && rail.isKindFilter(filter)) filter = 'all'
    // the filters by kind switched on or off in the mode's settings (access.js)
    document.addEventListener('all-inbox-autofilters', () => {
        if (!rail) return
        const on = rail.applyAutoFilters()
        if (!on && rail.isKindFilter(filter)) selectFilter('all')
    })
    listEl.addEventListener('contextmenu', (e) => {
        const row = e.target.closest('.ai-row[data-id]')
        if (row && folderBar) folderBar.chatMenu(e, row.dataset.id)
    })

    if (readStorage(OPEN_KEY, '') === '1') setOpen(true, { quiet: true })
    return { setOpen, refresh: readAll, isOpen: () => open, openChatView: (chat, adapterId) => chats?.open(chat, adapterId) }
}

module.exports = { createAllInbox }
