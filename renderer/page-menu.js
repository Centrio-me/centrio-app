// The right-click menu of a messenger page: built from what is under the cursor (a link, an image, selected text,
// an input field, a misspelled word) plus the always-useful page items. The facts come from the main process
// (main/services/pageContextMenu.js), which also does every action that touches the page; this file only draws.
//
// A page that handles right-click itself (Telegram, Yandex Disk) keeps its own menu. A quick second right-click (or
// Ctrl+right-click), handled by webview-preload.js, brings this menu up over any page.

const ICONS = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    forward: '<path d="M9 18l6-6-6-6"/>',
    reload: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    window: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    cut: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12"/>',
    paste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
    text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
    selectAll: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M9 12h6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    save: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    spell: '<path d="M4 17l5-12 5 12M6 13h6"/><path d="M15 17l3 3 4-5"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M12 7v6M9 10h6"/>',
    translate: '<path d="M3 5h12M9 3v2M6 19l3.5-9 3.5 9M8 16h5M5 5c0 6 4 10 9 10M14 15l5.5-5.5"/>',
    zoom: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6M11 8v6"/>',
    zoomOut: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35M8 11h6"/>',
    zoomReset: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>'
}

const WEB_SCHEMES = new Set(['https:', 'http:'])
const MENU_MARGIN = 8
const POINTER_OFFSET = 2
const SEARCH_LABEL_MAX = 24
const ZOOM_STEP = 0.25

function icon(name, size = 13) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`
}

function schemeOf(raw) {
    try { return new URL(String(raw)).protocol } catch { return '' }
}

function shortLabel(text) {
    const flat = String(text).replace(/\s+/g, ' ').trim()
    return flat.length > SEARCH_LABEL_MAX ? `${flat.slice(0, SEARCH_LABEL_MAX - 1)}…` : flat
}

function createPageMenu({
    menuEl, state, store, ipcRenderer, invokeIpc, tGet, hideMenu,
    applyTabZoom, openFindBar
}) {
    // Every webview that can show the menu, with the messenger it belongs to (main sends only the webContents id).
    const guests = new Set()

    function register(webview, messenger) {
        guests.add({ webview, messenger })
    }

    function guestById(wcId) {
        for (const guest of guests) {
            try { if (guest.webview.getWebContentsId() === wcId) return guest } catch { /* not attached yet */ }
        }
        return null
    }

    const t = (key) => tGet(`pagemenu.${key}`)

    function element(className, html) {
        const el = document.createElement('div')
        el.className = className
        if (html) el.innerHTML = html
        return el
    }

    function buildItem({ iconName, label, hint, disabled, strong, onClick }) {
        const el = element('context-item' + (disabled ? ' is-disabled' : '') + (strong ? ' is-strong' : ''))
        el.innerHTML = `${icon(iconName || 'text')}<span class="pmenu-label"></span>${hint ? `<span class="pmenu-hint">${hint}</span>` : ''}`
        el.querySelector('.pmenu-label').textContent = label
        if (!disabled) el.addEventListener('click', () => { hideMenu(); onClick() })
        return el
    }

    function buildDivider() {
        return element('context-divider')
    }

    function buildNavRow(ctx, act) {
        const row = element('pmenu-nav')
        const make = (iconName, label, enabled, onClick) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.title = label
            button.setAttribute('aria-label', label)
            button.disabled = !enabled
            button.innerHTML = icon(iconName, 15)
            button.addEventListener('click', () => { hideMenu(); onClick() })
            row.appendChild(button)
        }
        make('back', t('back'), ctx.canGoBack, () => act('back'))
        make('forward', t('forward'), ctx.canGoForward, () => act('forward'))
        make('reload', t('reload'), true, () => act('reload'))
        return row
    }

    function buildZoom() {
        const el = element('context-item context-has-sub')
        el.innerHTML = `${icon('zoom')}<span class="pmenu-label">${tGet('ctx.zoom')}</span><span class="pmenu-chevron">${icon('chevron', 10)}</span>`
        const sub = element('context-submenu')
        const entry = (iconName, label, onClick) => {
            const item = element('context-item', `${icon(iconName)}<span class="pmenu-label"></span>`)
            item.querySelector('.pmenu-label').textContent = label
            item.addEventListener('click', (e) => { e.stopPropagation(); hideMenu(); onClick() })
            sub.appendChild(item)
        }
        entry('zoom', tGet('ctx.zoomIn'), () => applyTabZoom(state.tabZoomLevel + ZOOM_STEP))
        entry('zoomOut', tGet('ctx.zoomOut'), () => applyTabZoom(state.tabZoomLevel - ZOOM_STEP))
        entry('zoomReset', tGet('ctx.zoomReset'), () => applyTabZoom(1))
        el.appendChild(sub)
        return el
    }

    // The groups, top to bottom. Each is a list of ready elements; empty groups are dropped and the rest get dividers.
    function buildGroups(ctx, guest, act) {
        const { webview, messenger } = guest
        const groups = []
        const link = WEB_SCHEMES.has(schemeOf(ctx.linkURL)) || /^(mailto|tel):/i.test(ctx.linkURL || '')
        const webLink = WEB_SCHEMES.has(schemeOf(ctx.linkURL))
        const isImage = ctx.mediaType === 'image' && !!ctx.srcURL
        const plainPage = !link && !isImage && !ctx.isEditable && !ctx.selectionText
        const item = (options) => buildItem(options)

        if (plainPage) groups.push([buildNavRow(ctx, act)])

        if (ctx.isEditable && ctx.misspelledWord) {
            const spelling = ctx.suggestions.map((word) => item({ iconName: 'spell', label: word, strong: true, onClick: () => act('replaceMisspelling', word) }))
            spelling.push(item({ iconName: 'book', label: t('addToDictionary'), onClick: () => act('addToDictionary', ctx.misspelledWord) }))
            groups.push(spelling)
        }

        if (link) {
            const items = []
            if (webLink) {
                items.push(item({ iconName: 'window', label: t('openLinkWindow'), onClick: () => invokeIpc('detached:open-link', {
                    id: messenger.id, name: messenger.name, icon: messenger.icon, url: messenger.url, zoomLevel: messenger.zoomLevel, forceDarkMode: messenger.forceDarkMode
                }, ctx.linkURL).catch(() => {}) }))
            }
            items.push(item({ iconName: 'external', label: t('openLinkBrowser'), onClick: () => act('openExternal', ctx.linkURL) }))
            items.push(item({ iconName: 'link', label: t(webLink ? 'copyLink' : 'copyContact'), onClick: () => act('copyText', ctx.linkURL.replace(/^(mailto|tel):/i, '')) }))
            groups.push(items)
        }

        if (isImage) {
            groups.push([
                item({ iconName: 'copy', label: t('copyImage'), onClick: () => act('copyImage', { x: ctx.x, y: ctx.y }) }),
                item({ iconName: 'save', label: tGet('ctx.saveImage'), onClick: () => saveImage(webview, ctx) }),
                item({ iconName: 'link', label: t('copyImageUrl'), onClick: () => act('copyText', ctx.srcURL) })
            ])
        }

        if (ctx.isEditable) {
            const f = ctx.flags
            groups.push([
                item({ iconName: 'cut', label: t('cut'), hint: 'Ctrl+X', disabled: !f.canCut, onClick: () => act('cut') }),
                item({ iconName: 'copy', label: tGet('ctx.copy'), hint: 'Ctrl+C', disabled: !f.canCopy, onClick: () => act('copy') }),
                item({ iconName: 'paste', label: t('paste'), hint: 'Ctrl+V', disabled: !f.canPaste, onClick: () => act('paste') }),
                item({ iconName: 'text', label: t('pasteText'), hint: 'Ctrl+Shift+V', disabled: !f.canPaste, onClick: () => act('pasteText') }),
                item({ iconName: 'selectAll', label: t('selectAll'), hint: 'Ctrl+A', disabled: !f.canSelectAll, onClick: () => act('selectAll') })
            ])
        } else if (ctx.selectionText) {
            const items = [
                item({ iconName: 'copy', label: tGet('ctx.copy'), hint: 'Ctrl+C', onClick: () => act('copy') }),
                item({ iconName: 'search', label: t('searchWeb').replace('{text}', shortLabel(ctx.selectionText)), onClick: () => act('searchWeb', ctx.selectionText) })
            ]
            if ((store.get('extensionsState', {}) || {}).translate === true) {
                items.push(item({ iconName: 'translate', label: tGet('ctx.translate'), onClick: () => ipcRenderer.send('open-translate-window', ctx.selectionText) }))
            }
            groups.push(items)
        } else if (plainPage) {
            groups.push([item({ iconName: 'selectAll', label: t('selectAll'), hint: 'Ctrl+A', onClick: () => act('selectAll') })])
        }

        groups.push([
            item({ iconName: 'search', label: tGet('search.findInPage'), hint: 'Ctrl+F', onClick: () => openFindBar() }),
            buildZoom(),
            item({ iconName: 'save', label: tGet('ctx.savePage'), onClick: () => ipcRenderer.send('save-page') }),
            item({ iconName: 'print', label: tGet('ctx.print'), hint: 'Ctrl+P', onClick: () => { try { webview.print() } catch { /* page gone */ } } })
        ])

        if (WEB_SCHEMES.has(schemeOf(ctx.pageURL))) {
            groups.push([
                item({ iconName: 'link', label: t('copyPageUrl'), onClick: () => act('copyText', ctx.pageURL) }),
                item({ iconName: 'external', label: t('openPageBrowser'), onClick: () => act('openExternal', ctx.pageURL) })
            ])
        }
        return groups
    }

    // Saving goes through the page itself (it can read blob: images the main process cannot), see webview-preload.js.
    async function saveImage(webview, ctx) {
        const result = await invokeIpc('get-save-image-path', ctx.srcURL).catch(() => null)
        if (!result || !result.success || !result.data) return
        state.wvContextParams = { ...ctx, _filePath: result.data }
        webview.send('download-image', ctx.srcURL)
    }

    function place(ctx, guest) {
        // A point from the main process is already in window coordinates; one forwarded by the page is inside the page.
        let left, top
        if (ctx.inWindow) {
            left = (Number(ctx.x) || 0) + POINTER_OFFSET
            top = (Number(ctx.y) || 0) + POINTER_OFFSET
        } else {
            const rect = guest.webview.getBoundingClientRect()
            const zoom = Number(state.tabZoomLevel || 1)
            left = rect.left + (Number(ctx.x) || 0) * zoom + POINTER_OFFSET
            top = rect.top + (Number(ctx.y) || 0) * zoom + POINTER_OFFSET
        }
        menuEl.style.position = 'fixed'
        menuEl.style.left = '0px'
        menuEl.style.top = '0px'
        menuEl.style.visibility = 'hidden'
        menuEl.classList.add('show')
        requestAnimationFrame(() => {
            const box = menuEl.getBoundingClientRect()
            if (top + box.height > window.innerHeight - MENU_MARGIN) top = top - box.height - POINTER_OFFSET * 2
            if (left + box.width > window.innerWidth - MENU_MARGIN) left = left - box.width - POINTER_OFFSET * 2
            left = Math.max(MENU_MARGIN, Math.min(left, window.innerWidth - box.width - MENU_MARGIN))
            top = Math.max(MENU_MARGIN, Math.min(top, window.innerHeight - box.height - MENU_MARGIN))
            menuEl.style.left = `${Math.round(left)}px`
            menuEl.style.top = `${Math.round(top)}px`
            menuEl.style.visibility = 'visible'
        })
    }

    // ctx: what the main process saw (see snapshot() in pageContextMenu.js); missing fields mean "nothing there".
    function show(guest, rawCtx) {
        const ctx = {
            x: 0, y: 0, inWindow: false, linkURL: '', srcURL: '', mediaType: 'none', selectionText: '', isEditable: false, misspelledWord: '',
            suggestions: [], pageURL: '', canGoBack: false, canGoForward: false,
            flags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false },
            ...rawCtx
        }
        let wcId = null
        try { wcId = guest.webview.getWebContentsId() } catch { return }
        const act = (action, payload) => invokeIpc('pagemenu:action', wcId, action, payload).catch(() => {})
        state.wvContextParams = ctx

        document.querySelectorAll('.context-menu').forEach((m) => { m.classList.remove('show'); m.style.visibility = '' })
        menuEl.textContent = ''
        const groups = buildGroups(ctx, guest, act).filter((g) => g.length)
        groups.forEach((group, i) => {
            if (i > 0) menuEl.appendChild(buildDivider())
            group.forEach((el) => menuEl.appendChild(el))
        })
        place(ctx, guest)
    }

    // Main process: a right-click the page did not handle itself.
    function showFromMain(payload) {
        const guest = payload && guestById(payload.wcId)
        if (!guest) return
        show(guest, payload)
    }

    // The page itself forwarded a right-click (second quick right-click / Ctrl+right-click): only what the page knows.
    function showFromPage(webview, messenger, params) {
        let history = { back: false, forward: false }
        try { history = { back: webview.canGoBack(), forward: webview.canGoForward() } } catch { /* not ready */ }
        let pageURL = ''
        try { pageURL = webview.getURL() } catch { /* not ready */ }
        show({ webview, messenger }, {
            x: params.clientX ?? params.x ?? 0,
            y: params.clientY ?? params.y ?? 0,
            linkURL: params.linkURL || '',
            srcURL: params.srcURL || '',
            mediaType: params.mediaType || 'none',
            selectionText: params.selectionText || '',
            pageURL,
            canGoBack: history.back,
            canGoForward: history.forward
        })
    }

    ipcRenderer.on('pagemenu:show', showFromMain)

    return { register, showFromPage }
}

module.exports = { createPageMenu }
