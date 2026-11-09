'use strict'
// Header next to the logo (#titlebarActiveTab). One tab: its icon and name. A split (3.7.2, user request): every pane
// is on screen at once, so every pane is shown, the focused one highlighted.
const { getFocusedMessengerId, getVisibleMessengerIds } = require('./focused-messenger')

function describeTitlebar(state) {
    const focusedId = getFocusedMessengerId(state)
    return getVisibleMessengerIds(state)
        .map(id => (state.activeMessengers || []).find(m => m.id === id))
        .filter(Boolean)
        .map(m => ({ id: m.id, name: m.name || '', icon: m.icon || '', focused: m.id === focusedId }))
}

let lastKey = null

/** Redraws the header only when the set of panes or the focus changed. */
function paintTitlebar(state, doc = document) {
    const holder = doc.getElementById('titlebarActiveTab')
    if (!holder) return
    const items = describeTitlebar(state)
    const key = items.map(i => `${i.id}:${i.focused ? 1 : 0}:${i.name}:${i.icon}`).join('|')
    if (key === lastKey) return
    lastKey = key
    holder.style.display = items.length ? 'flex' : 'none'
    holder.classList.toggle('is-split', items.length > 1)
    holder.textContent = ''
    const divider = doc.createElement('span')
    divider.className = 'titlebar-active-tab-divider'
    holder.appendChild(divider)
    items.forEach((item, index) => {
        const chip = doc.createElement('span')
        chip.className = 'titlebar-tab-chip' + (item.focused && items.length > 1 ? ' is-focused' : '')
        chip.title = item.name
        if (item.icon) {
            const img = doc.createElement('img')
            img.className = 'titlebar-active-tab-icon'
            img.alt = ''
            img.onerror = () => { img.style.display = 'none' }
            img.src = item.icon
            chip.appendChild(img)
        }
        const name = doc.createElement('span')
        name.className = 'titlebar-active-tab-name'
        name.textContent = item.name
        chip.appendChild(name)
        if (index === 0) {
            // keep the ids older code and tests look for on the first chip
            name.id = 'titlebarActiveTabName'
            chip.querySelector('img')?.setAttribute('id', 'titlebarActiveTabIcon')
        }
        holder.appendChild(chip)
    })
}

module.exports = { describeTitlebar, paintTitlebar }
