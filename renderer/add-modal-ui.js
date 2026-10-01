// "Add service" window (REDESIGN 2026-10-02, concept agreed with the owner).
//
// Three columns: categories + free-plan meter | search + catalog | a card for
// the selected service where the tab is set up BEFORE it is added (name,
// folder, VPN). The search field doubles as a "paste any link" field: a URL
// turns into a "Свой сайт" card with the site's favicon.
//
// History kept from the previous version: one continuous native scroll (no
// wheel hijacking), tiles glow with the service's real brand colour
// (--tile-glow), the SyntaxAI promo is the first entry of the AI category and
// the popular items are shown both under "Популярные" and in their own category.
const { getCaption } = require('./add-modal-catalog')

const CATEGORY_ORDER = ['messengers', 'mail', 'productivity', 'ai', 'media', 'documents', 'calls']
const CATEGORY_LABEL_KEYS = {
    top: 'modal.popular',
    messengers: 'modal.categories.messengers',
    mail: 'modal.categories.mail',
    productivity: 'modal.categories.productivity',
    ai: 'modal.categories.ai',
    media: 'modal.categories.media',
    documents: 'modal.categories.documents',
    calls: 'modal.categories.calls'
}
const RECENT_KEY = 'centrio-add-recent'
const RECENT_MAX = 5
const STAGGER_STEP_MS = 12
const STAGGER_MAX_MS = 200
const CUSTOM_COLOR = '#7b68ee'

function createAddModalUiApi({
    state,
    popularMessengers,
    syntaxAiPromo,
    addModal,
    messengerGrid,
    addMessenger,
    tGet,
    hasEffectivePro,
    getFreeLimit,
    showUpgrade,
    requirePro,
    getLanguage
}) {
    const prefersReducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const ui = { category: 'all', query: '', selected: null, options: { name: '', folderId: '', vpn: true } }
    let recentCache = null

    const t = (key, fallback, params) => {
        let text = tGet(`addv2.${key}`) || fallback || ''
        for (const [k, v] of Object.entries(params || {})) text = text.split(`{${k}}`).join(String(v))
        return text
    }

    const node = (tag, className, text) => {
        const element = document.createElement(tag)
        if (className) element.className = className
        if (text != null) element.textContent = text
        return element
    }

    const language = () => (typeof getLanguage === 'function' ? getLanguage() : 'ru') || 'ru'
    const catalog = () => popularMessengers.filter((m) => !m.hidden)

    function hostOf(url) {
        try { return new URL(url).hostname } catch { return '' }
    }

    function faviconUrl(host) {
        return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
    }

    // Anything that looks like a link or a bare domain becomes a custom site.
    function parseCustomSite(raw) {
        const text = String(raw || '').trim()
        if (!text || /\s/.test(text)) return null
        const withScheme = /^https?:\/\//i.test(text) ? text : (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text) ? `https://${text}` : '')
        if (!withScheme) return null
        let parsed
        try { parsed = new URL(withScheme) } catch { return null }
        if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) return null
        const host = parsed.hostname.replace(/^www\./, '')
        const base = host.split('.').slice(0, -1).join('.') || host
        return {
            custom: true,
            name: base.charAt(0).toUpperCase() + base.slice(1),
            url: parsed.href,
            icon: faviconUrl(parsed.hostname),
            color: CUSTOM_COLOR,
            category: 'custom'
        }
    }

    function readRecent() {
        if (recentCache) return recentCache
        try { recentCache = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { recentCache = [] }
        if (!Array.isArray(recentCache)) recentCache = []
        return recentCache
    }

    function rememberRecent(name) {
        const list = [name, ...readRecent().filter((n) => n !== name)].slice(0, RECENT_MAX)
        recentCache = list
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)) } catch {}
    }

    function categoryLabel(key) {
        if (key === 'all') return t('catAll', 'Все')
        if (key === 'custom') return t('catCustom', 'Свой сайт')
        const labelKey = CATEGORY_LABEL_KEYS[key]
        return (labelKey && tGet(labelKey)) || key
    }

    function iconImage(messenger, className) {
        const image = node('img', className)
        image.alt = ''
        image.loading = 'lazy'
        image.src = messenger.icon
        const host = hostOf(messenger.url)
        // Inline onerror is blocked by the app CSP — attach via JS.
        image.addEventListener('error', () => {
            image.onerror = null
            if (host) image.src = faviconUrl(host)
        })
        return image
    }

    // ---- left rail --------------------------------------------------------
    function renderRail() {
        const rail = document.getElementById('addRailList')
        if (!rail) return
        rail.textContent = ''
        const items = catalog()
        const counts = new Map()
        items.forEach((m) => counts.set(m.category || 'messengers', (counts.get(m.category || 'messengers') || 0) + 1))
        const entries = [
            ['all', items.length],
            ['top', items.filter((m) => m.popular).length],
            ...CATEGORY_ORDER.filter((key) => counts.has(key)).map((key) => [key, counts.get(key)]),
            ['custom', null]
        ]
        entries.forEach(([key, count]) => {
            const row = node('button', `add2-cat${ui.category === key ? ' is-on' : ''}`)
            row.type = 'button'
            row.appendChild(node('span', '', categoryLabel(key)))
            if (count != null) row.appendChild(node('i', '', String(count)))
            else row.appendChild(node('i', '', '+'))
            row.addEventListener('click', () => {
                ui.category = key
                if (key === 'custom') focusSearch(true)
                renderAll()
            })
            rail.appendChild(row)
        })
        renderLimit()
    }

    function renderLimit() {
        const box = document.getElementById('addLimit')
        if (!box) return
        box.textContent = ''
        const used = state.activeMessengers.filter((m) => !m.orgAssigned).length
        if (hasEffectivePro()) {
            box.appendChild(node('div', 'add2-limit-pro', t('limitPro', 'Pro — без ограничений')))
            return
        }
        const max = getFreeLimit()
        box.appendChild(node('div', 'add2-limit-text', t('limit', 'Добавлено {n} из {max}', { n: Math.min(used, max), max })))
        const bar = node('div', 'add2-limit-bar')
        const fill = node('span')
        fill.style.width = `${Math.min(100, Math.round((used / max) * 100))}%`
        bar.appendChild(fill)
        box.appendChild(bar)
        const upgrade = node('button', 'add2-limit-upgrade', `${t('upgrade', 'Pro — без лимита')} →`)
        upgrade.type = 'button'
        upgrade.addEventListener('click', () => showUpgrade?.())
        box.appendChild(upgrade)
    }

    // ---- catalog cards ----------------------------------------------------
    function buildCard(messenger, index) {
        const card = node('button', 'add2-card')
        card.type = 'button'
        if (messenger.color) card.style.setProperty('--tile-glow', messenger.color)
        if (!prefersReducedMotion) card.style.animationDelay = `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`
        else card.classList.add('no-stagger')
        if (ui.selected && ui.selected.name === messenger.name && ui.selected.url === messenger.url) card.classList.add('is-selected')

        card.appendChild(iconImage(messenger, 'add2-card-icon'))
        const text = node('span', 'add2-card-text')
        text.appendChild(node('strong', '', messenger.name))
        const caption = messenger.custom
            ? (hostOf(messenger.url) || t('customCaption', 'Любой сайт'))
            : getCaption(messenger.name, language())
        if (caption) text.appendChild(node('small', '', caption))
        card.appendChild(text)

        card.addEventListener('click', () => selectMessenger(messenger))
        card.addEventListener('dblclick', () => commit(messenger, { keepOpen: false, quick: true }))
        return card
    }

    function section(title, count, cards) {
        const wrap = node('div', 'add2-section')
        const head = node('div', 'add2-section-head')
        head.appendChild(node('span', '', title))
        if (count != null) head.appendChild(node('i', '', String(count)))
        wrap.appendChild(head)
        const grid = node('div', 'add2-grid')
        cards.forEach((card) => grid.appendChild(card))
        wrap.appendChild(grid)
        return wrap
    }

    function filteredCatalog() {
        const q = ui.query.trim().toLowerCase()
        let list = catalog()
        if (ui.category === 'top') list = list.filter((m) => m.popular)
        else if (ui.category !== 'all' && ui.category !== 'custom') list = list.filter((m) => (m.category || 'messengers') === ui.category)
        if (q) list = list.filter((m) => m.name.toLowerCase().includes(q) || getCaption(m.name, language()).toLowerCase().includes(q))
        return list
    }

    function recentItems() {
        const all = catalog()
        return readRecent().map((name) => all.find((m) => m.name === name)).filter(Boolean)
    }

    function fillMessengerGrid() {
        messengerGrid.textContent = ''
        const custom = parseCustomSite(ui.query)
        let index = 0
        const nextIndex = () => index++

        if (custom) {
            messengerGrid.appendChild(section(t('customTitle', 'Свой сайт'), null, [buildCard(custom, nextIndex())]))
        }

        if (ui.category === 'custom' && !custom) {
            const hint = node('div', 'add2-empty')
            hint.appendChild(node('strong', '', t('customTitle', 'Свой сайт')))
            hint.appendChild(node('span', '', t('pasteHint', 'Вставьте ссылку на любой сайт — иконка подтянется сама')))
            messengerGrid.appendChild(hint)
            updateScrollProgress()
            return
        }

        const list = filteredCatalog()
        if (!list.length && !custom) {
            const empty = node('div', 'add2-empty')
            empty.appendChild(node('span', '', tGet('search.empty') || ''))
            messengerGrid.appendChild(empty)
            updateScrollProgress()
            return
        }

        const showSections = ui.category === 'all' && !ui.query.trim()
        if (showSections) {
            const recent = recentItems()
            if (recent.length) {
                const chips = node('div', 'add2-recent')
                chips.appendChild(node('span', 'add2-recent-label', t('recent', 'Недавно добавляли')))
                recent.forEach((m) => {
                    const chip = node('button', 'add2-chip')
                    chip.type = 'button'
                    chip.appendChild(iconImage(m, 'add2-chip-icon'))
                    chip.appendChild(node('span', '', m.name))
                    chip.addEventListener('click', () => selectMessenger(m))
                    chips.appendChild(chip)
                })
                messengerGrid.appendChild(chips)
            }
            const popular = list.filter((m) => m.popular)
            if (popular.length) {
                messengerGrid.appendChild(section(categoryLabel('top'), popular.length, popular.map((m) => buildCard(m, nextIndex()))))
            }
            CATEGORY_ORDER.forEach((key) => {
                let items = list.filter((m) => (m.category || 'messengers') === key)
                if (key === 'ai' && syntaxAiPromo) {
                    items = items.filter((m) => m.url !== syntaxAiPromo.url)
                    items = [syntaxAiPromo, ...items]
                }
                if (items.length) messengerGrid.appendChild(section(categoryLabel(key), items.length, items.map((m) => buildCard(m, nextIndex()))))
            })
        } else {
            const title = ui.query.trim() ? t('results', 'Результаты') : categoryLabel(ui.category)
            let items = list
            if (ui.category === 'ai' && !ui.query.trim() && syntaxAiPromo) {
                items = [syntaxAiPromo, ...list.filter((m) => m.url !== syntaxAiPromo.url)]
            }
            if (items.length) messengerGrid.appendChild(section(title, items.length, items.map((m) => buildCard(m, nextIndex()))))
        }
        updateScrollProgress()
    }

    // ---- side card --------------------------------------------------------
    function selectMessenger(messenger) {
        ui.selected = messenger
        ui.options = { name: messenger.name, folderId: '', vpn: true }
        renderSide()
        fillMessengerGrid()
    }

    function renderSide() {
        const side = document.getElementById('addSide')
        if (!side) return
        side.textContent = ''
        const messenger = ui.selected
        if (!messenger) {
            const empty = node('div', 'add2-side-empty')
            empty.appendChild(node('strong', '', t('pickTitle', 'Выберите сервис')))
            empty.appendChild(node('span', '', t('pickHint', 'Вкладку можно настроить ещё до добавления: название, папку и VPN.')))
            side.appendChild(empty)
            return
        }

        const head = node('div', 'add2-side-head')
        if (messenger.color) head.style.setProperty('--tile-glow', messenger.color)
        head.appendChild(iconImage(messenger, 'add2-side-icon'))
        const titles = node('div')
        titles.appendChild(node('h3', '', messenger.name))
        titles.appendChild(node('small', '', hostOf(messenger.url)))
        head.appendChild(titles)
        side.appendChild(head)

        const nameField = node('div', 'add2-field')
        nameField.appendChild(node('label', '', t('fieldName', 'Название вкладки')))
        const nameInput = node('input', 'add2-input')
        nameInput.type = 'text'
        nameInput.maxLength = 60
        nameInput.value = ui.options.name
        nameInput.addEventListener('input', () => { ui.options.name = nameInput.value })
        nameInput.addEventListener('keydown', (event) => { if (event.key === 'Enter') commit(messenger, { keepOpen: false }) })
        nameField.appendChild(nameInput)
        side.appendChild(nameField)

        if (state.folders.length > 0) {
            const folderField = node('div', 'add2-field')
            folderField.appendChild(node('label', '', t('fieldFolder', 'Папка')))
            const select = node('select', 'add2-input')
            const none = node('option', '', tGet('modal.noFolder') || 'Вне папки')
            none.value = ''
            select.appendChild(none)
            state.folders.forEach((folder) => {
                const option = node('option', '', folder.name)
                option.value = folder.id
                select.appendChild(option)
            })
            select.value = ui.options.folderId
            select.addEventListener('change', () => { ui.options.folderId = select.value })
            folderField.appendChild(select)
            side.appendChild(folderField)
        }

        const vpnRow = node('label', 'add2-option')
        const vpnText = node('span', 'add2-option-text')
        vpnText.appendChild(node('strong', '', t('vpnLabel', 'Через VPN')))
        vpnText.appendChild(node('small', '', t('vpnHint', 'Если VPN подключён, вкладка работает через него')))
        const toggle = node('span', 'toggle')
        const checkbox = node('input')
        checkbox.type = 'checkbox'
        checkbox.checked = ui.options.vpn
        checkbox.addEventListener('change', () => { ui.options.vpn = checkbox.checked })
        toggle.append(checkbox, node('span', 'toggle-slider'))
        vpnRow.append(vpnText, toggle)
        side.appendChild(vpnRow)

        if (messenger.custom && !hasEffectivePro()) {
            side.appendChild(node('div', 'add2-pro-note', t('customProHint', 'Свои сайты доступны в Pro')))
        }

        const actions = node('div', 'add2-actions')
        const primary = node('button', 'add2-btn add2-btn-primary', t('add', 'Добавить {name}', { name: ui.options.name || messenger.name }))
        primary.type = 'button'
        primary.addEventListener('click', () => commit(messenger, { keepOpen: false }))
        nameInput.addEventListener('input', () => {
            primary.textContent = t('add', 'Добавить {name}', { name: nameInput.value.trim() || messenger.name })
        })
        const more = node('button', 'add2-btn add2-btn-ghost', t('addMore', 'Добавить и выбрать ещё'))
        more.type = 'button'
        more.addEventListener('click', () => commit(messenger, { keepOpen: true }))
        actions.append(primary, more)
        side.appendChild(actions)
    }

    // ---- actions ----------------------------------------------------------
    async function commit(messenger, { keepOpen, quick = false }) {
        if (messenger.custom && requirePro && !requirePro('customMessenger')) return
        const options = quick
            ? { name: messenger.name, folderId: '', vpn: true }
            : { ...ui.options, name: (ui.options.name || '').trim() || messenger.name }
        const payload = { ...messenger }
        delete payload.custom
        delete payload.popular
        delete payload.hidden
        delete payload.category
        await addMessenger({ ...payload, name: options.name }, { folderId: options.folderId || null, vpn: options.vpn })
        if (!messenger.custom) rememberRecent(messenger.name)
        if (keepOpen) {
            ui.selected = null
            ui.query = ''
            const input = document.getElementById('modalSearchInput')
            if (input) input.value = ''
            renderAll()
            focusSearch(false)
        } else {
            closeModal()
        }
    }

    function focusSearch(select) {
        const input = document.getElementById('modalSearchInput')
        if (!input) return
        setTimeout(() => { input.focus(); if (select) input.select() }, 30)
    }

    function updateScrollProgress() {
        const wrap = document.getElementById('modalGridWrap')
        const bar = document.getElementById('modalScrollProgressBar')
        if (!wrap || !bar) return
        const scrollable = wrap.scrollHeight - wrap.clientHeight
        const ratio = scrollable > 0 ? Math.min(1, wrap.scrollTop / scrollable) : 1
        bar.style.width = `${Math.max(6, ratio * 100)}%`
    }

    function renderAll() {
        renderRail()
        fillMessengerGrid()
        renderSide()
    }

    // The search field: typing filters, Enter picks the only match / pasted link.
    function onSearchInput(value) {
        ui.query = value
        if (parseCustomSite(value) && ui.category !== 'custom') ui.category = 'all'
        renderRail()
        fillMessengerGrid()
    }

    function onSearchEnter() {
        const custom = parseCustomSite(ui.query)
        if (custom) { selectMessenger(custom); return }
        const list = filteredCatalog()
        if (list.length >= 1 && ui.query.trim()) selectMessenger(list[0])
    }

    function openModal() {
        ui.category = 'all'
        ui.query = ''
        ui.selected = null
        ui.options = { name: '', folderId: '', vpn: true }
        state.modalFiltered = [...popularMessengers]
        addModal.classList.add('show')
        const input = document.getElementById('modalSearchInput')
        if (input) input.value = ''
        renderAll()
        const wrap = document.getElementById('modalGridWrap')
        if (wrap) wrap.scrollTop = 0
        focusSearch(false)
    }

    function closeModal() {
        addModal.classList.remove('show')
    }

    return {
        fillMessengerGrid: renderAll,
        updateScrollProgress,
        openModal,
        closeModal,
        onSearchInput,
        onSearchEnter
    }
}

module.exports = {
    createAddModalUiApi
}
