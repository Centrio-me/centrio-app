function createSearchUiApi({
    state,
    quickSearch,
    quickSearchInput,
    quickSearchResults,
    findBar,
    findInput,
    findCount,
    findAllBtn,
    findAllResults,
    tGet,
    switchTab,
    isMessengerMuted,
    updateMuteAllBtn
}) {
    function openFindBar() {
        findBar.classList.add('show')
        findInput.value = ''
        findCount.textContent = ''
        if (findAllResults) {
            findAllResults.style.display = 'none'
            findAllResults.innerHTML = ''
        }
        setTimeout(() => findInput.focus(), 50)
    }

    function closeFindBar() {
        findBar.classList.remove('show')
        stopFind()
        if (findAllResults) {
            findAllResults.style.display = 'none'
            findAllResults.innerHTML = ''
        }
    }

    function doFind(forward = true) {
        if (!state.activeTabId) return
        const webview = document.getElementById(`webview-${state.activeTabId}`)
        if (!webview || !findInput.value) return
        webview.findInPage(findInput.value, { forward, findNext: true })
    }

    function stopFind() {
        if (!state.activeTabId) return
        const webview = document.getElementById(`webview-${state.activeTabId}`)
        if (webview) webview.stopFindInPage('clearSelection')
        findCount.textContent = ''
    }

    // ── Поиск по странице сразу во ВСЕХ открытых вкладках, а не только в активной ──
    // Ctrl+F ищет только в текущем webview (findInPage работает исключительно с фокусной
    // страницей внутри одного <webview>). Кнопка findAllBtn прогоняет тот же запрос по
    // каждому мессенджеру из state.activeMessengers параллельно и показывает список
    // совпадений — клик по пункту переключает вкладку и повторяет поиск уже там, чтобы
    // подсветка реально появилась на экране.
    function searchOneTab(messenger, query) {
        return new Promise((resolve) => {
            const webview = document.getElementById(`webview-${messenger.id}`)
            if (!webview || typeof webview.findInPage !== 'function') {
                resolve({ messenger, matches: 0 })
                return
            }

            let settled = false
            const finish = (matches) => {
                if (settled) return
                settled = true
                webview.removeEventListener('found-in-page', onFound)
                try { webview.stopFindInPage('clearSelection') } catch {}
                resolve({ messenger, matches })
            }

            const onFound = (e) => finish(e.result?.matches || 0)
            webview.addEventListener('found-in-page', onFound)

            try {
                webview.findInPage(query)
            } catch {
                finish(0)
                return
            }

            // Мессенджер мог ещё не догрузиться / findInPage может никогда не ответить —
            // не даём одному зависшему webview блокировать остальные результаты.
            setTimeout(() => finish(0), 3000)
        })
    }

    async function searchAllTabs(query) {
        if (!findAllResults) return
        const messengers = state.activeMessengers || []

        if (!query || !messengers.length) {
            findAllResults.style.display = 'none'
            findAllResults.innerHTML = ''
            return
        }

        findAllResults.style.display = 'block'
        findAllResults.innerHTML = `<div class="find-all-searching">${tGet('search.findAllSearching')}</div>`

        const results = await Promise.all(messengers.map(m => searchOneTab(m, query)))
        renderAllTabsResults(results.filter(r => r.matches > 0), query)
    }

    function renderAllTabsResults(results, query) {
        if (!findAllResults) return

        // Запрос мог измениться/поле очиститься, пока шёл асинхронный поиск — не рисуем
        // устаревший результат поверх уже другого состояния поля ввода.
        if (findInput.value !== query) return

        findAllResults.innerHTML = ''

        if (!results.length) {
            findAllResults.innerHTML = `<div class="find-all-empty">${tGet('search.findAllEmpty')}</div>`
            return
        }

        results
            .sort((a, b) => b.matches - a.matches)
            .forEach((r) => {
                const item = document.createElement('div')
                item.className = 'find-all-result-item'
                item.innerHTML = `
                    <span class="find-all-result-name"></span>
                    <span class="find-all-result-count">${r.matches}</span>
                `
                item.querySelector('.find-all-result-name').textContent = r.messenger.name
                item.addEventListener('click', () => {
                    switchTab(r.messenger.id)
                    setTimeout(() => {
                        const webview = document.getElementById(`webview-${r.messenger.id}`)
                        webview?.findInPage(query)
                    }, 80)
                })
                findAllResults.appendChild(item)
            })
    }

    function openQuickSearch() {
        quickSearch.classList.add('show')
        quickSearchInput.value = ''
        renderQuickSearchResults('')
        setTimeout(() => quickSearchInput.focus(), 50)
    }

    function closeQuickSearch() {
        quickSearch.classList.remove('show')
    }

    function renderQuickSearchResults(query) {
        const q = query.toLowerCase().trim()

        // Command execution mode
        if (q.startsWith('/')) {
            renderCommands(q)
            return
        }

        // 1. Filter messengers
        const filteredMsgs = q
            ? state.activeMessengers.filter(m => m.name.toLowerCase().includes(q) || (m.url && m.url.toLowerCase().includes(q)))
            : state.activeMessengers.slice(0, 5) // Show top 5 when empty

        quickSearchResults.innerHTML = ''
        if (filteredMsgs.length === 0) {
            quickSearchResults.innerHTML = `<div class="quick-search-empty">${tGet('search.empty')}</div>`
            return
        }

        // Render Messengers
        filteredMsgs.forEach((m, idx) => {
            const hostname = (() => {
                try { return new URL(m.url).hostname } catch { return '' }
            })()

            const item = document.createElement('div')
            item.className = 'quick-search-item' + (idx === 0 ? ' selected' : '')
            const nameHtml = q ? m.name.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>') : m.name
            const unread = state.unreadCounts[m.id] || 0
            const muted = isMessengerMuted(m.id)

            item.innerHTML = `
                <img src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32"
                     onerror="this.style.display='none'" width="24" height="24" style="border-radius:6px;">
                <span class="quick-search-item-name">${nameHtml}</span>
                ${muted ? `<span class="quick-search-item-muted" title="${tGet('notifications.muteIcon')}">🔕</span>` : ''}
                ${unread > 0 ? `<span class="quick-search-item-badge">${unread}</span>` : ''}
            `

            item.addEventListener('click', () => {
                switchTab(m.id)
                closeQuickSearch()
            })

            quickSearchResults.appendChild(item)
        })
    }

    function renderCommands(q) {
        const commands = [
            { cmd: '/reload', desc: tGet('search.commandReload'), action: () => document.getElementById('ctxSidebarReloadAll')?.click() },
            { cmd: '/settings', desc: tGet('search.commandSettings'), action: () => document.getElementById('settingsBtn')?.click() },
            { cmd: '/mute', desc: tGet('search.commandMute'), action: () => { state.globalMuteAll = true; if (typeof updateMuteAllBtn === 'function') updateMuteAllBtn(); } },
            { cmd: '/unmute', desc: tGet('search.commandUnmute'), action: () => { state.globalMuteAll = false; if (typeof updateMuteAllBtn === 'function') updateMuteAllBtn(); } },
        ]

        const filtered = commands.filter(c => c.cmd.includes(q))
        quickSearchResults.innerHTML = ''

        const header = document.createElement('div')
        header.style.cssText = 'padding:10px 12px 4px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;'
        header.textContent = tGet('search.commandsTitle')
        quickSearchResults.appendChild(header)

        filtered.forEach((c, idx) => {
            const item = document.createElement('div')
            item.className = 'quick-search-item' + (idx === 0 ? ' selected' : '')
            item.innerHTML = `
                <div style="width:24px;height:24px;background:var(--accent-dim);color:var(--accent);display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:14px;font-weight:700;">></div>
                <div style="display:flex;flex-direction:column;flex:1;">
                    <span class="quick-search-item-name" style="font-weight:700;">${c.cmd}</span>
                    <span style="font-size:11px;color:var(--text-muted);">${c.desc}</span>
                </div>
            `
            item.addEventListener('click', () => {
                c.action()
                closeQuickSearch()
            })
            quickSearchResults.appendChild(item)
        })
    }

    function bind() {
        findInput.addEventListener('input', () => {
            if (!findInput.value) {
                stopFind()
                return
            }

            if (!state.activeTabId) return
            document.getElementById(`webview-${state.activeTabId}`)?.findInPage(findInput.value)
        })

        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') e.shiftKey ? doFind(false) : doFind(true)
            if (e.key === 'Escape') closeFindBar()
        })

        document.getElementById('findNext').addEventListener('click', () => doFind(true))
        document.getElementById('findPrev').addEventListener('click', () => doFind(false))
        document.getElementById('findClose').addEventListener('click', () => closeFindBar())

        if (findAllBtn) {
            findAllBtn.addEventListener('click', () => searchAllTabs(findInput.value.trim()))
        }

        quickSearchInput.addEventListener('input', (e) => renderQuickSearchResults(e.target.value))
        quickSearchInput.addEventListener('keydown', (e) => {
            const items = quickSearchResults.querySelectorAll('.quick-search-item')
            const selected = quickSearchResults.querySelector('.quick-search-item.selected')
            const idx = Array.from(items).indexOf(selected)

            if (e.key === 'ArrowDown') {
                e.preventDefault()
                if (idx < items.length - 1) {
                    selected?.classList.remove('selected')
                    items[idx + 1].classList.add('selected')
                    items[idx + 1].scrollIntoView({ block: 'nearest' })
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                if (idx > 0) {
                    selected?.classList.remove('selected')
                    items[idx - 1].classList.add('selected')
                    items[idx - 1].scrollIntoView({ block: 'nearest' })
                }
            } else if (e.key === 'Enter') {
                e.preventDefault()
                selected?.click()
            } else if (e.key === 'Escape') {
                closeQuickSearch()
            }
        })

        quickSearch.addEventListener('click', (e) => {
            if (e.target === quickSearch) closeQuickSearch()
        })
    }

    return {
        openFindBar,
        closeFindBar,
        doFind,
        stopFind,
        searchAllTabs,
        openQuickSearch,
        closeQuickSearch,
        renderQuickSearchResults,
        bind
    }
}

module.exports = {
    createSearchUiApi
}
