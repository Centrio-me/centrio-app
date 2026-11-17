'use strict'
// «История изменений»: the window with the versions on the left and the chosen version on the right (concept approved by
// the owner 2026-11-17). Everything is built from the lists already written in index.html (.changelog-source); the icons
// are one colour (the accent), no emoji. The rules are in changelog-parse.js.
const { buildEntry, formatDate, versionTag } = require('./changelog-parse')

const ICONS = {
    megaphone: '<path d="M4 10v4h3l7 4V6L7 10H4Z"/><path d="M17.5 9a4 4 0 0 1 0 6"/>',
    messages: '<path d="M4 5h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M20 9a2 2 0 0 1 2 2v8l-3-2h-5"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/>',
    note: '<path d="M5 4h14v12l-4 4H5V4Z"/><path d="M9 9h6M9 13h4"/>',
    shield: '<path d="M12 3 5 6v6c0 4.2 2.9 7.3 7 9 4.1-1.7 7-4.8 7-9V6l-7-3Z"/>',
    zap: '<path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0M16 5.2a3.2 3.2 0 0 1 0 5.6M18 14.5a6 6 0 0 1 3 5.5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.500 18.400 12 21c-2.500-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3Z"/>',
    folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    sparkles: '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.200-1.400L12 3Z"/><path d="M18.500 14.500l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8.8-2Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    wrench: '<path d="M14.700 6.300a4 4 0 0 0-5.400 5.100L3.500 17.200a1.800 1.800 0 0 0 2.600 2.600l5.800-5.800a4 4 0 0 0 5.100-5.400l-2.600 2.600-2.400-.6-.6-2.400 2.600-2.600Z"/>',
    arrows: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.500-3.500L4 9M4 4v5h5M4 13a8 8 0 0 0 14.500 3.500L20 15M20 20v-5h-5"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>'
}
const GROUPS = { new: { label: 'Новое', icon: 'plus' }, fix: { label: 'Исправлено', icon: 'wrench' }, change: { label: 'Улучшено', icon: 'arrows' } }

function icon(name, size = 16) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', String(size))
    svg.setAttribute('height', String(size))
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.8')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    // only our own constants are ever put here
    svg.innerHTML = ICONS[name] || ICONS.sparkles
    return svg
}

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
}

/** The versions written in index.html, newest first (the order of the file). */
function readSource(root) {
    return [...root.querySelectorAll('.changelog-source .changelog-entry')].map((entry) => buildEntry({
        version: entry.querySelector('.changelog-version')?.textContent.trim() || '',
        date: entry.dataset.date || '',
        hl: entry.dataset.hl || '',
        items: [...entry.querySelectorAll('.changelog-list li')].map((li) => li.textContent.trim())
    })).filter((e) => e.version)
}

function createChangelogWindow({ root = document, getAppVersion = () => '' } = {}) {
    const rail = root.getElementById('clRail')
    const main = root.getElementById('clMain')
    if (!rail || !main) return null
    let entries = []
    let selected = ''
    let filter = 'all'
    let appVersion = ''

    const plain = (v) => String(v || '').replace(/^v/i, '').replace(/-beta\.\d+$/, '')

    function drawRail() {
        rail.replaceChildren(el('h4', 'cl-rail-title', 'Версии'))
        const current = plain(appVersion)
        for (const e of entries) {
            const item = el('button', `cl-ver${e.version === selected ? ' is-on' : ''}`)
            item.type = 'button'
            item.setAttribute('aria-current', e.version === selected ? 'true' : 'false')
            item.append(el('span', 'cl-ver-dot'), el('span', 'cl-ver-name', e.version))
            const note = e.version === current ? 'сейчас' : formatDate(e.date, { short: true })
            if (note) item.append(el('small', 'cl-ver-note', note))
            item.addEventListener('click', () => { selected = e.version; filter = 'all'; draw() })
            rail.append(item)
        }
    }

    function drawMain() {
        const e = entries.find((x) => x.version === selected) || entries[0]
        main.replaceChildren()
        main.scrollTop = 0
        if (!e) { main.append(el('p', 'cl-empty', 'Записей пока нет')); return }

        const top = el('div', 'cl-head')
        const left = el('div', 'cl-head-main')
        left.append(el('div', 'cl-big', e.version))
        const meta = el('div', 'cl-meta')
        const tag = versionTag(e.version, appVersion)
        if (tag) meta.append(el('span', 'cl-tag', tag))
        const when = formatDate(e.date)
        if (when) meta.append(el('span', 'cl-date', when))
        if (meta.childNodes.length) left.append(meta)
        top.append(left)
        main.append(top)

        if (e.highlights.length) {
            main.append(el('div', 'cl-section', 'Главное в версии'))
            const cards = el('div', 'cl-cards')
            for (const h of e.highlights) {
                const card = el('div', 'cl-card')
                card.append(icon(h.icon, 20), el('b', '', h.title))
                if (h.text) card.append(el('span', '', h.text))
                cards.append(card)
            }
            main.append(cards)
        }

        // the chips: only the groups this version has, with how many
        const kinds = e.groups.map((g) => g.kind)
        if (kinds.length > 1) {
            const chips = el('div', 'cl-filter')
            const chip = (key, label, n) => {
                const b = el('button', `cl-chip${filter === key ? ' is-on' : ''}`, `${label} ${n}`)
                b.type = 'button'
                b.setAttribute('aria-pressed', filter === key ? 'true' : 'false')
                b.addEventListener('click', () => { filter = key; drawMain() })
                return b
            }
            chips.append(chip('all', 'Всё', e.counts.all))
            for (const k of kinds) chips.append(chip(k, GROUPS[k].label, e.counts[k]))
            main.append(chips)
        } else filter = 'all'

        for (const g of e.groups) {
            if (filter !== 'all' && filter !== g.kind) continue
            const title = el('div', 'cl-group')
            title.append(icon(GROUPS[g.kind].icon, 14), el('span', '', GROUPS[g.kind].label))
            main.append(title)
            const list = el('ul', 'cl-list')
            for (const text of g.items) {
                const li = el('li', 'cl-item')
                li.append(icon(GROUPS[g.kind].icon, 14), el('span', '', text))
                list.append(li)
            }
            main.append(list)
        }
        if (!e.groups.length) main.append(el('p', 'cl-empty', 'Для этой версии нет подробностей'))
    }

    function draw() { drawRail(); drawMain() }

    return {
        /** Builds the window from the source lists; the newest version is open. Called each time it is shown. */
        async refresh() {
            try { appVersion = String((await getAppVersion()) || '') } catch { appVersion = '' }
            entries = readSource(root)
            const wanted = plain(appVersion)
            selected = entries.some((x) => x.version === wanted) ? wanted : (entries[0] && entries[0].version) || ''
            filter = 'all'
            draw()
        },
        icon
    }
}

module.exports = { createChangelogWindow, readSource }
