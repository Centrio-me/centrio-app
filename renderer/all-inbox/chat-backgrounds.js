'use strict'
// «Все мессенджеры»: backgrounds of the conversation window, like the chat wallpapers of messengers. One choice for
// all chats, kept on this computer. The pictures themselves live in styles-all-inbox.css ([data-bg="…"]).

const BG_KEY = 'centrio-all-inbox-bg'
const DEFAULT_BG = 'night'

const BACKGROUNDS = [
    { id: 'plain', name: 'Без фона' },
    { id: 'night', name: 'Ночь' },
    { id: 'aurora', name: 'Аврора' },
    { id: 'ocean', name: 'Океан' },
    { id: 'forest', name: 'Лес' },
    { id: 'sunset', name: 'Закат' },
    { id: 'graphite', name: 'Графит' },
    { id: 'paper', name: 'Бумага' }
]

/** A saved choice that is still on the list, or the default one. */
function pickBackground(saved) {
    return BACKGROUNDS.some((b) => b.id === saved) ? saved : DEFAULT_BG
}

function readBackground() {
    try { return pickBackground(localStorage.getItem(BG_KEY)) } catch { return DEFAULT_BG }
}

function saveBackground(id) {
    try { localStorage.setItem(BG_KEY, pickBackground(id)) } catch {}
}

/**
 * The small «Фон» menu of the conversation header.
 * @param {{ current: string, onChoose: (id: string) => void }} deps
 */
function createBackgroundMenu({ current, onChoose }) {
    const menu = document.createElement('div')
    menu.className = 'aib-menu'
    menu.hidden = true
    menu.setAttribute('role', 'menu')
    const title = document.createElement('div')
    title.className = 'aib-title'
    title.textContent = 'Фон чата'
    const grid = document.createElement('div')
    grid.className = 'aib-grid'
    for (const bg of BACKGROUNDS) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'aib-swatch'
        b.dataset.bg = bg.id
        b.setAttribute('role', 'menuitemradio')
        const name = document.createElement('span')
        name.className = 'aib-name'
        name.textContent = bg.name
        b.append(name)
        b.addEventListener('click', () => { mark(bg.id); onChoose(bg.id) })
        grid.append(b)
    }
    menu.append(title, grid)

    function mark(id) {
        grid.querySelectorAll('.aib-swatch').forEach((b) => {
            const on = b.dataset.bg === id
            b.classList.toggle('is-on', on)
            b.setAttribute('aria-checked', String(on))
        })
    }
    mark(current)

    return {
        el: menu,
        toggle(force) { menu.hidden = typeof force === 'boolean' ? !force : !menu.hidden; return !menu.hidden },
        isOpen: () => !menu.hidden
    }
}

module.exports = { BACKGROUNDS, DEFAULT_BG, pickBackground, readBackground, saveBackground, createBackgroundMenu }
