// "Диспетчер вкладок" (2026-10-06): how much memory and CPU every messenger tab uses, with "reload" and "sleep".
// A sleeping tab is unloaded from memory (its <webview> is removed) and wakes up with a fresh load when opened.
// The numbers come from the main process (main/ipc/tabManager.js); here we only draw them.
const copy = {
    ru: {
        title: 'Диспетчер вкладок', statusTitle: 'Память приложения: открыть диспетчер вкладок (Ctrl+Shift+M)',
        total: 'Centrio использует {mem}', tabsLine: 'Вкладок: {n}, спит: {s}', cpuLine: 'Процессор: {cpu}%', other: 'Сам Centrio, окна и службы: {mem}',
        active: 'Открыта', background: 'Работает', sleeping: 'Спит', shared: 'делит процесс',
        reload: 'Перезагрузить', sleep: 'Усыпить', wake: 'Разбудить', open: 'Открыть', sleepAll: 'Усыпить неактивные', sleepAllHint: 'Не трогаем открытую вкладку, вкладки в разделённом экране и те, где есть непрочитанные.',
        sleepNote: 'Спящая вкладка не занимает память, но не получает сообщения и уведомления. Она проснётся при открытии, вход в аккаунт сохранится.',
        cantSleep: 'Эту вкладку сейчас нельзя усыпить: она открыта или в разделённом экране.', sleptCount: 'Усыплено вкладок: {n}', nothingToSleep: 'Нечего усыплять: все вкладки открыты или с непрочитанными.',
        empty: 'Пока нет вкладок.', close: 'Закрыть', heavy: 'тяжёлая', gb: 'ГБ', mb: 'МБ'
    },
    en: {
        title: 'Tab manager', statusTitle: 'App memory: open the tab manager (Ctrl+Shift+M)',
        total: 'Centrio uses {mem}', tabsLine: 'Tabs: {n}, asleep: {s}', cpuLine: 'CPU: {cpu}%', other: 'Centrio itself, windows and services: {mem}',
        active: 'Open', background: 'Running', sleeping: 'Asleep', shared: 'shares a process',
        reload: 'Reload', sleep: 'Sleep', wake: 'Wake up', open: 'Open', sleepAll: 'Sleep inactive tabs', sleepAllHint: 'The open tab, tabs in split screen and tabs with unread messages are left alone.',
        sleepNote: 'A sleeping tab uses no memory but does not receive messages or notifications. It wakes up when opened and stays signed in.',
        cantSleep: 'This tab cannot sleep right now: it is open or in split screen.', sleptCount: 'Tabs put to sleep: {n}', nothingToSleep: 'Nothing to sleep: every tab is open or has unread messages.',
        empty: 'No tabs yet.', close: 'Close', heavy: 'heavy', gb: 'GB', mb: 'MB'
    }
}

const POLL_OPEN_MS = 2000
const POLL_STATUS_MS = 20000
const HEAVY_MB = 600

function createTabManager({ state, store, invokeIpc, switchTab, sleepTab, wakeTab }) {
    let overlay = null
    let timer = null
    let toast = ''
    let last = null

    const t = (key, params = {}) => {
        const code = (store.get('settings', {}) || {}).language || 'ru'
        const dict = copy[code === 'ru' ? 'ru' : 'en']
        return String(dict[key] || copy.en[key] || key).replace(/\{(\w+)\}/g, (_m, name) => (params[name] != null ? params[name] : ''))
    }
    const mem = (mb) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} ${t('gb')}` : `${Math.round(mb)} ${t('mb')}`)
    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }
    const button = (label, className, onClick) => {
        const b = el('button', className, label)
        b.type = 'button'
        b.addEventListener('click', (event) => { event.stopPropagation(); onClick() })
        return b
    }

    async function measure() {
        const views = []
        state.activeMessengers.forEach((m) => {
            const view = document.getElementById(`webview-${m.id}`)
            if (!view || typeof view.getWebContentsId !== 'function') return
            try { views.push({ id: m.id, wcId: view.getWebContentsId() }) } catch { /* not attached yet */ }
        })
        const result = await invokeIpc('tabs:metrics', views)
        last = result && result.success ? result : null
        return last
    }

    const inSplit = (id) => state.splitMode && (state.splitTabId === id || (Array.isArray(state.splitZoneIds) && state.splitZoneIds.includes(id)))

    function statusOf(id) {
        if (state.sleepingTabs.has(id)) return 'sleeping'
        return state.activeTabId === id ? 'active' : 'background'
    }

    function rows() {
        const byId = new Map(((last && last.tabs) || []).map((x) => [x.id, x]))
        return state.activeMessengers
            .map((m) => {
                const metric = byId.get(m.id) || { memoryMb: 0, cpu: 0, shared: false }
                return { messenger: m, status: statusOf(m.id), memoryMb: metric.memoryMb, cpu: metric.cpu, shared: metric.shared }
            })
            .sort((a, b) => b.memoryMb - a.memoryMb || a.messenger.name.localeCompare(b.messenger.name))
    }

    function sleepInactive() {
        let count = 0
        for (const m of state.activeMessengers) {
            if (state.activeTabId === m.id || inSplit(m.id) || (state.unreadCounts[m.id] || 0) > 0) continue
            if (sleepTab(m.id)) count += 1
        }
        toast = count ? t('sleptCount', { n: count }) : t('nothingToSleep')
        refresh()
    }

    function render() {
        if (!overlay) return
        const panel = overlay.querySelector('.tm-panel')
        panel.textContent = ''
        const list = rows()
        const sleepingCount = list.filter((r) => r.status === 'sleeping').length

        const head = el('div', 'tm-head')
        const title = el('div', 'tm-title-wrap')
        title.appendChild(el('div', 'tm-title', t('title')))
        head.appendChild(title)
        head.appendChild(button('×', 'tm-x', close)).title = t('close')
        panel.appendChild(head)

        const summary = el('div', 'tm-summary')
        summary.appendChild(el('div', 'tm-total', last ? t('total', { mem: mem(last.totalMb) }) : '…'))
        const sub = el('div', 'tm-sub', `${t('tabsLine', { n: list.length, s: sleepingCount })}${last ? ' · ' + t('cpuLine', { cpu: last.cpu }) : ''}`)
        summary.appendChild(sub)
        if (last) summary.appendChild(el('div', 'tm-sub', t('other', { mem: mem(last.otherMb) })))
        panel.appendChild(summary)

        const maxMb = Math.max(1, ...list.map((r) => r.memoryMb))
        const table = el('div', 'tm-list')
        if (!list.length) table.appendChild(el('div', 'tm-empty', t('empty')))
        list.forEach((r) => {
            const row = el('div', `tm-row tm-${r.status}`)
            const icon = document.createElement('img')
            icon.className = 'tm-icon'
            icon.alt = ''
            icon.src = r.messenger.icon || 'assets/logo.png'
            icon.addEventListener('error', () => { icon.src = 'assets/logo.png' })
            row.appendChild(icon)

            const info = el('div', 'tm-info')
            const nameLine = el('div', 'tm-name-line')
            nameLine.appendChild(el('span', 'tm-name', r.messenger.name))
            nameLine.appendChild(el('span', `tm-chip tm-chip-${r.status}`, t(r.status)))
            if (r.memoryMb >= HEAVY_MB) nameLine.appendChild(el('span', 'tm-chip tm-chip-heavy', t('heavy')))
            info.appendChild(nameLine)
            const bar = el('div', 'tm-bar')
            const fill = el('span', 'tm-fill')
            fill.style.width = `${Math.max(2, Math.round((r.memoryMb / maxMb) * 100))}%`
            if (r.memoryMb >= HEAVY_MB) fill.classList.add('heavy')
            bar.appendChild(fill)
            info.appendChild(bar)
            row.appendChild(info)

            const numbers = el('div', 'tm-numbers')
            numbers.appendChild(el('div', 'tm-mem', r.status === 'sleeping' ? '—' : (r.shared ? t('shared') : mem(r.memoryMb))))
            numbers.appendChild(el('div', 'tm-cpu', r.status === 'sleeping' || r.shared ? '' : `${r.cpu}%`))
            row.appendChild(numbers)

            const actions = el('div', 'tm-actions')
            if (r.status === 'sleeping') {
                actions.appendChild(button(t('wake'), 'tm-btn', () => { wakeTab(r.messenger.id); refresh() }))
            } else {
                actions.appendChild(button(t('reload'), 'tm-btn', () => { document.getElementById(`webview-${r.messenger.id}`)?.reload?.(); toast = ''; refresh() }))
                const sleepButton = button(t('sleep'), 'tm-btn', () => {
                    if (!sleepTab(r.messenger.id)) { toast = t('cantSleep'); render(); return }
                    toast = ''
                    refresh()
                })
                if (r.status === 'active') sleepButton.disabled = true
                actions.appendChild(sleepButton)
            }
            row.appendChild(actions)
            row.addEventListener('click', () => { close(); switchTab(r.messenger.id) })
            table.appendChild(row)
        })
        panel.appendChild(table)

        const foot = el('div', 'tm-foot')
        if (toast) foot.appendChild(el('div', 'tm-toast', toast))
        foot.appendChild(el('div', 'tm-note', t('sleepNote')))
        const bottom = el('div', 'tm-bottom')
        bottom.appendChild(el('div', 'tm-hint', t('sleepAllHint')))
        bottom.appendChild(button(t('sleepAll'), 'qr-btn-primary tm-sleep-all', sleepInactive))
        foot.appendChild(bottom)
        panel.appendChild(foot)
    }

    async function refresh() {
        await measure()
        render()
        updateStatus()
    }

    function open() {
        if (overlay) return
        overlay = el('div', 'tm-overlay')
        overlay.appendChild(el('div', 'tm-panel'))
        overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close() })
        document.body.appendChild(overlay)
        toast = ''
        render()
        refresh()
        timer = setInterval(refresh, POLL_OPEN_MS)
    }

    function close() {
        clearInterval(timer)
        timer = null
        overlay?.remove()
        overlay = null
    }

    function updateStatus() {
        const text = document.getElementById('statusMemoryText')
        if (text && last) text.textContent = mem(last.totalMb)
        const btn = document.getElementById('statusMemory')
        if (btn) btn.title = t('statusTitle')
    }

    document.getElementById('statusMemory')?.addEventListener('click', () => (overlay ? close() : open()))
    document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && !event.altKey && (event.key === 'M' || event.key === 'm')) { event.preventDefault(); overlay ? close() : open() }
        if (event.key === 'Escape' && overlay) close()
    })
    setInterval(() => { if (!overlay && document.visibilityState === 'visible') measure().then(updateStatus) }, POLL_STATUS_MS)
    setTimeout(() => measure().then(updateStatus), 6000)

    return { open, close, refresh }
}

module.exports = { createTabManager }
