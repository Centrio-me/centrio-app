// Settings → "Рабочее пространство": the user decides which icons of the right
// activity bar (assistant, tasks, notes, quick replies, mini player) are shown
// and in which order. PRO feature: for everyone else the full default set is
// always shown, whatever is stored (so a lapsed PRO account gets its icons
// back automatically — see apply()).
//
// Stored as store key 'rightbarLayout' = { hidden: string[], order: string[] }
// and synced between devices through the settings `extra` payload.
const ITEMS = [
    { id: 'assistant', buttonId: 'assistantBtn', labelKey: 'rightbar.assistant', labelFallback: 'AI-ассистент', panelKey: 'assistant' },
    { id: 'todos', buttonId: 'todosBtn', labelKey: 'rightbar.todos', labelFallback: 'Задачи', panelKey: 'todos' },
    { id: 'notes', buttonId: 'notesBtn', labelKey: 'rightbar.notes', labelFallback: 'Заметки', panelKey: 'notes' },
    { id: 'quickReplies', buttonId: 'quickRepliesBtn', labelKey: 'rightbar.quickReplies', labelFallback: 'Быстрые ответы', panelKey: 'quickReplies' },
    { id: 'mediaPlayer', buttonId: 'mediaPlayerBtn', labelKey: 'rightbar.mediaPlayer', labelFallback: 'Медиаплеер', panelKey: null }
]
const KNOWN_IDS = new Set(ITEMS.map((item) => item.id))

function normalizeLayout(raw) {
    const hidden = Array.isArray(raw?.hidden) ? raw.hidden.filter((id) => KNOWN_IDS.has(id)) : []
    const order = []
    const seen = new Set()
    const stored = Array.isArray(raw?.order) ? raw.order : []
    for (const id of [...stored, ...ITEMS.map((item) => item.id)]) {
        if (KNOWN_IDS.has(id) && !seen.has(id)) { seen.add(id); order.push(id) }
    }
    return { hidden: [...new Set(hidden)], order }
}

function bindRightbarCustom({ store, tGet, hasEffectivePro, requirePro, closeRightPanel, getActivePanelKey, cloudSyncPush }) {
    const listEl = document.getElementById('rightbarCustomList')
    const noteEl = document.getElementById('rightbarCustomProNote')
    const resetBtn = document.getElementById('rightbarCustomReset')

    const label = (item) => tGet(item.labelKey) || item.labelFallback

    function getLayout() {
        return normalizeLayout(store.get('rightbarLayout', null))
    }

    function saveLayout(layout) {
        store.set('rightbarLayout', layout)
        apply()
        render()
        if (typeof cloudSyncPush === 'function') cloudSyncPush()
    }

    // Applies the stored layout to the real buttons. Called on startup, on
    // every entitlement revalidation and after each change.
    function apply() {
        const pro = hasEffectivePro()
        const layout = getLayout()
        layout.order.forEach((id, index) => {
            const item = ITEMS.find((candidate) => candidate.id === id)
            const button = document.getElementById(item.buttonId)
            if (!button) return
            const hide = pro && layout.hidden.includes(id)
            button.classList.toggle('rb-user-hidden', hide)
            button.style.order = pro ? String(index) : ''
            if (hide && item.panelKey && getActivePanelKey() === item.panelKey) closeRightPanel()
        })
    }

    function guardPro() {
        return requirePro('rightbarCustom')
    }

    function toggleItem(id, visible) {
        if (!guardPro()) { render(); return }
        const layout = getLayout()
        const hidden = visible ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id]
        saveLayout({ ...layout, hidden })
    }

    function moveItem(id, delta) {
        if (!guardPro()) return
        const layout = getLayout()
        const from = layout.order.indexOf(id)
        const to = from + delta
        if (from < 0 || to < 0 || to >= layout.order.length) return
        const order = [...layout.order]
        order.splice(to, 0, order.splice(from, 1)[0])
        saveLayout({ ...layout, order })
    }

    function arrowButton(direction, title, disabled, onClick) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'rb-move-btn'
        button.title = title
        button.setAttribute('aria-label', title)
        button.disabled = disabled
        button.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="${direction === 'up' ? '6 15 12 9 18 15' : '6 9 12 15 18 9'}"/></svg>`
        button.addEventListener('click', onClick)
        return button
    }

    function render() {
        if (!listEl) return
        const pro = hasEffectivePro()
        const layout = getLayout()
        if (noteEl) noteEl.style.display = pro ? 'none' : ''
        listEl.textContent = ''
        layout.order.forEach((id, index) => {
            const item = ITEMS.find((candidate) => candidate.id === id)
            const row = document.createElement('div')
            row.className = 'rb-row'

            const icon = document.getElementById(item.buttonId)?.querySelector('svg')
            const iconWrap = document.createElement('span')
            iconWrap.className = 'rb-row-icon'
            if (icon) iconWrap.appendChild(icon.cloneNode(true))
            row.appendChild(iconWrap)

            const name = document.createElement('span')
            name.className = 'rb-row-name'
            name.textContent = label(item)
            row.appendChild(name)

            const moves = document.createElement('span')
            moves.className = 'rb-row-moves'
            moves.appendChild(arrowButton('up', tGet('rightbarCustom.moveUp') || 'Выше', index === 0, () => moveItem(id, -1)))
            moves.appendChild(arrowButton('down', tGet('rightbarCustom.moveDown') || 'Ниже', index === layout.order.length - 1, () => moveItem(id, 1)))
            row.appendChild(moves)

            const toggle = document.createElement('label')
            toggle.className = 'toggle'
            const input = document.createElement('input')
            input.type = 'checkbox'
            input.checked = !(pro && layout.hidden.includes(id))
            input.setAttribute('aria-label', label(item))
            input.addEventListener('change', () => toggleItem(id, input.checked))
            const slider = document.createElement('span')
            slider.className = 'toggle-slider'
            toggle.append(input, slider)
            row.appendChild(toggle)

            listEl.appendChild(row)
        })
    }

    resetBtn?.addEventListener('click', () => {
        if (!guardPro()) return
        saveLayout(normalizeLayout(null))
    })

    document.querySelector('.settings-nav-item[data-section="workspace"]')?.addEventListener('click', render)

    apply()
    render()
    return { apply, render }
}

module.exports = { bindRightbarCustom, normalizeLayout }
