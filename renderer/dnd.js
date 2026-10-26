// "Do not disturb": one switch for everything that makes noise. While it is on, no messenger shows a notification pop-up,
// plays Centrio's sound or counts unread messages (that is the existing "mute all": state.globalMuteAll), and the pages
// themselves are silenced too, because a page plays its own sound for a message regardless of Centrio (the "tuk-tuk" of
// Telegram). It lasts for a chosen number of hours or until it is switched off, and it comes back after a restart.
//
// The speaker button in the title bar opens the menu; a hotkey (Settings > Hotkeys) switches it on and off.

const HOURS = [1, 2, 3, 4]
const HOUR_MS = 60 * 60 * 1000
const TICK_MS = 5000
const MENU_GAP = 6
const MENU_MARGIN = 8

function createDndApi({ state, store, tGet, setMuteAll, isMessengerMuted, updateMuteIcon, saveData }) {
    let menu = null
    let timer = null
    let pagesSilenced = false

    const isActive = () => state.globalMuteAll === true
    const until = () => Number(store.get('dndUntil', 0)) || 0
    const formatTime = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    function label() {
        if (!isActive()) return tGet('dnd.title')
        const end = until()
        return end > 0 ? tGet('dnd.tooltipOn').replace('{time}', formatTime(end)) : tGet('dnd.tooltipForever')
    }

    // The pages' own sounds: every messenger webview is silenced while it is on and given its sound back afterwards.
    function applyPageAudio() {
        const silence = isActive()
        if (silence === pagesSilenced && !silence) return
        pagesSilenced = silence
        document.querySelectorAll('webview').forEach((view) => {
            try { if (view.isAudioMuted() !== silence) view.setAudioMuted(silence) } catch { /* not attached yet */ }
        })
    }

    function refreshButton() {
        const button = document.getElementById('tqmMute')
        if (!button) return
        const activeTab = state.activeTabId
        button.classList.toggle('muted', isActive() || (!!activeTab && isMessengerMuted(activeTab)))
        const text = label()
        button.title = text
        button.setAttribute('aria-label', text)
    }

    function start(hours) {
        const end = hours > 0 ? Date.now() + hours * HOUR_MS : 0
        store.set('dndUntil', end)
        store.set('dndLastHours', hours > 0 ? hours : 0)
        setMuteAll(true)
        applyPageAudio()
        refreshButton()
    }

    function stop() {
        store.set('dndUntil', 0)
        setMuteAll(false)
        applyPageAudio()
        refreshButton()
    }

    // The hotkey: off when on, otherwise on for the same time as the last time (1 hour at first).
    function toggle() {
        if (isActive()) stop()
        else start(Number(store.get('dndLastHours', 1)) || 0)
    }

    function tick() {
        const end = until()
        if (isActive() && end > 0 && Date.now() >= end) stop()
        else { applyPageAudio(); refreshButton() }
    }

    function hideMenu() {
        if (menu) menu.classList.remove('show')
    }

    function item(text, onClick, className = '') {
        const row = document.createElement('div')
        row.className = `context-item ${className}`.trim()
        const span = document.createElement('span')
        span.className = 'pmenu-label'
        span.textContent = text
        row.appendChild(span)
        row.addEventListener('click', () => { hideMenu(); onClick() })
        return row
    }

    function divider() {
        const line = document.createElement('div')
        line.className = 'context-divider'
        return line
    }

    function buildMenu() {
        menu.textContent = ''
        const head = document.createElement('div')
        head.className = 'dnd-head'
        const title = document.createElement('b')
        title.textContent = tGet('dnd.title')
        const sub = document.createElement('span')
        const end = until()
        sub.textContent = isActive() ? (end > 0 ? tGet('dnd.activeUntil').replace('{time}', formatTime(end)) : tGet('dnd.activeForever')) : tGet('dnd.hint')
        head.append(title, sub)
        menu.appendChild(head)
        menu.appendChild(divider())
        if (isActive()) { menu.appendChild(item(tGet('dnd.off'), stop, 'is-strong')); menu.appendChild(divider()) }
        HOURS.forEach((hours) => menu.appendChild(item(tGet(`dnd.hour${hours}`), () => start(hours))))
        menu.appendChild(item(tGet('dnd.untilOff'), () => start(0)))
        const id = state.activeTabId
        if (id) {
            menu.appendChild(divider())
            const mutedTab = state.mutedMessengers[id] === true
            menu.appendChild(item(tGet(mutedTab ? 'dnd.tabUnmute' : 'dnd.tabMute'), () => {
                state.mutedMessengers[id] = !state.mutedMessengers[id]
                saveData()
                updateMuteIcon(id)
                refreshButton()
            }))
        }
    }

    function openMenu(button) {
        if (!menu) {
            menu = document.createElement('div')
            menu.id = 'dndMenu'
            menu.className = 'context-menu dnd-menu'
            document.body.appendChild(menu)
        }
        document.querySelectorAll('.context-menu.show').forEach((m) => m.classList.remove('show'))
        buildMenu()
        menu.style.position = 'fixed'
        menu.style.visibility = 'hidden'
        menu.classList.add('show')
        const rect = button.getBoundingClientRect()
        const box = menu.getBoundingClientRect()
        const left = Math.max(MENU_MARGIN, Math.min(rect.right - box.width, window.innerWidth - box.width - MENU_MARGIN))
        menu.style.left = `${Math.round(left)}px`
        menu.style.top = `${Math.round(rect.bottom + MENU_GAP)}px`
        menu.style.visibility = 'visible'
    }

    function bind() {
        const button = document.getElementById('tqmMute')
        if (button) {
            button.addEventListener('click', (e) => {
                e.stopPropagation()
                if (menu && menu.classList.contains('show')) hideMenu()
                else openMenu(button)
            })
        }
        document.addEventListener('mousedown', (e) => { if (menu && !menu.contains(e.target) && !e.target.closest('#tqmMute')) hideMenu() })
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideMenu() })
        window.addEventListener('blur', hideMenu)
        document.addEventListener('centrio-shortcut', (e) => { if (e.detail && e.detail.action === 'dnd') toggle() })
        tick()
        timer = setInterval(tick, TICK_MS)
    }

    bind()
    return { start, stop, toggle, isActive, refreshButton, dispose: () => clearInterval(timer) }
}

module.exports = { createDndApi }
