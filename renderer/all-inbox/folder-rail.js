// The folder column of «Все мессенджеры» (3.8.3, owner 2026-11-12: «папки сбоку, а не сверху — их может быть много»):
// the filters and own folders stand in a column on the left of the list, full height, like Telegram's desktop folders —
// an icon, the name and the count of unread chats each. The filters by kind (Личные, Группы, Каналы) can be switched
// off in the mode's settings (store allInbox.autoFilters), for people who sort chats into folders themselves.

const ICONS = {
    all: '<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M20 9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3"/>',
    unread: '<path d="M21 12a9 9 0 1 1-4.2-7.6"/><circle cx="19" cy="5" r="3" fill="currentColor" stroke="none"/>',
    personal: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    groups: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2.2.6 3.5 2.8 3.5 6"/>',
    channels: '<path d="M3 11v3a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a4 4 0 0 1 0 6"/><path d="M18 6a8 8 0 0 1 0 12"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    // a tray: what has no folder yet
    unsorted: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'
}
const KIND_FILTERS = ['personal', 'groups', 'channels']

function icon(name) {
    const span = document.createElement('span')
    span.className = 'ai-rail-ic'
    span.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.folder}</svg>`
    return span
}

/** gives a filter or folder button its icon, a label that keeps the button's i18n, and a place for the count */
function dressButton(button, iconName) {
    if (button.querySelector('.ai-rail-label')) return button
    const label = document.createElement('span')
    label.className = 'ai-rail-label'
    label.textContent = button.textContent
    if (button.dataset.i18n) { label.dataset.i18n = button.dataset.i18n; button.removeAttribute('data-i18n') }
    button.textContent = ''
    const count = document.createElement('span')
    count.className = 'ai-rail-n'
    count.hidden = true
    button.append(icon(iconName), label, count)
    button.title = label.textContent
    return button
}

function setCount(button, n) {
    const count = button && button.querySelector('.ai-rail-n')
    if (!count) return
    count.hidden = !n
    count.textContent = n > 99 ? '99+' : String(n)
}

/** The panel gets the column: [rail | head, tools, list]. Returns what the list needs. */
function attachFolderRail({ panel, store }) {
    const strip = panel.querySelector('.ai-filters')
    if (!strip || panel.querySelector('.ai-rail')) return null
    const col = document.createElement('div')
    col.className = 'ai-col'
    const rail = document.createElement('nav')
    rail.className = 'ai-rail'
    rail.setAttribute('aria-label', 'Папки')
    // syllable breaks for long names («Непрочи-танные») need the page language
    rail.lang = document.documentElement.lang || 'ru'
    rail.append(strip)
    strip.setAttribute('aria-orientation', 'vertical')
    for (const child of [...panel.children]) col.append(child)
    panel.append(rail, col)
    panel.classList.add('has-rail')
    for (const b of strip.querySelectorAll('[data-ai-filter]')) dressButton(b, b.dataset.aiFilter)

    const autoFiltersOn = () => {
        const saved = store && store.get('allInbox', null)
        return !(saved && typeof saved === 'object' && saved.autoFilters === false)
    }
    function applyAutoFilters() {
        const on = autoFiltersOn()
        for (const k of KIND_FILTERS) {
            const b = strip.querySelector(`[data-ai-filter="${k}"]`)
            if (b) b.hidden = !on
        }
        return on
    }
    applyAutoFilters()

    return {
        dressButton,
        setCount,
        applyAutoFilters,
        autoFiltersOn,
        isKindFilter: (f) => KIND_FILTERS.includes(f)
    }
}

module.exports = { attachFolderRail, dressButton, setCount, KIND_FILTERS }
