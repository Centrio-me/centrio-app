// The settings window in the look of the account window (3.7.1): a rail with the title and a search box, the section
// title in a header above the content, cards and rows like in the account window (styles-settings-v2.css).
// The sections themselves are untouched; this only frames them and adds the search.
function bindSettingsShell({ tGet }) {
    const modal = document.getElementById('settingsModal')
    const layout = modal?.querySelector('.settings-layout')
    const sidebar = modal?.querySelector('.settings-sidebar')
    const content = modal?.querySelector('.settings-content')
    if (!modal || !layout || !sidebar || !content || modal.dataset.shell === 'v2') return
    modal.dataset.shell = 'v2'
    modal.querySelector('.modal-content')?.classList.add('sx')

    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }

    // Rail: title and search above the section list
    const head = el('div', 'sx-rail-head')
    const title = el('div', 'sx-rail-title', tGet('settings.title'))
    const searchWrap = el('label', 'sx-search')
    searchWrap.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>'
    const search = el('input', 'sx-search-input')
    search.type = 'search'
    search.placeholder = tGet('v371.sx.search')
    search.setAttribute('aria-label', tGet('v371.sx.search'))
    searchWrap.appendChild(search)
    head.append(title, searchWrap)
    sidebar.prepend(head)

    // Main column: a header with the section name, then the existing content
    const main = el('div', 'sx-main')
    const header = el('div', 'sx-head')
    const headTitle = el('h2', 'sx-title')
    const headSub = el('div', 'sx-sub')
    const headText = el('div', 'sx-head-text')
    headText.append(headTitle, headSub)
    header.appendChild(headText)
    layout.insertBefore(main, content)
    main.append(header, content)
    const footer = modal.querySelector('.settings-footer')
    if (footer) main.appendChild(footer)

    const empty = el('div', 'sx-empty', tGet('v371.sx.nothing'))
    empty.hidden = true
    content.appendChild(empty)

    function activeSection() {
        return sidebar.querySelector('.settings-nav-item.active')?.dataset.section || 'general'
    }

    function refreshHeader() {
        if (search.value.trim()) {
            headTitle.textContent = tGet('v371.sx.results')
            headSub.textContent = search.value.trim()
            return
        }
        const section = activeSection()
        headTitle.textContent = tGet(`settings.sections.${section}`)
        const sub = tGet(`v371.sx.sub_${section}`)
        headSub.textContent = sub.startsWith('v371.') ? '' : sub
    }

    // Search: every section is shown, only the rows that match stay; groups without a match are hidden.
    function applySearch() {
        const q = search.value.trim().toLowerCase()
        modal.classList.toggle('sx-searching', !!q)
        const sections = content.querySelectorAll('.settings-section')
        let any = false
        sections.forEach((section) => {
            let sectionHit = false
            section.querySelectorAll('.settings-group').forEach((group) => {
                const titleHit = q && (group.querySelector('.settings-group-title')?.textContent || '').toLowerCase().includes(q)
                let groupHit = false
                group.querySelectorAll('.settings-row').forEach((row) => {
                    const hit = !q || titleHit || row.textContent.toLowerCase().includes(q)
                    row.classList.toggle('sx-hidden', !hit)
                    if (hit) groupHit = true
                })
                if (!group.querySelector('.settings-row')) groupHit = !q || titleHit || group.textContent.toLowerCase().includes(q)
                group.classList.toggle('sx-hidden', !!q && !groupHit)
                if (groupHit) sectionHit = true
            })
            section.classList.toggle('sx-hit', !!q && sectionHit)
            if (q && sectionHit) any = true
        })
        sidebar.querySelectorAll('.settings-nav-item').forEach((nav) => {
            const section = content.querySelector(`#section-${nav.dataset.section}`)
            nav.classList.toggle('sx-dim', !!q && !section?.classList.contains('sx-hit'))
        })
        empty.hidden = !q || any
        refreshHeader()
        content.scrollTop = 0
    }

    search.addEventListener('input', applySearch)
    search.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; applySearch() }
    })
    sidebar.addEventListener('click', (e) => {
        const nav = e.target.closest('.settings-nav-item')
        if (!nav) return
        if (search.value) { search.value = ''; applySearch() }
        setTimeout(() => { refreshHeader(); content.scrollTop = 0 }, 0)
    })
    new MutationObserver(() => {
        if (modal.classList.contains('show')) { title.textContent = tGet('settings.title'); refreshHeader() } else if (search.value) { search.value = ''; applySearch() }
    }).observe(modal, { attributes: true, attributeFilter: ['class'] })
    refreshHeader()
}

module.exports = { bindSettingsShell }
