// Empty-state screen shown while there is no messenger yet: pick one to add.
// It lives inside #contentArea (not over the whole window), so the sidebar, the account button and the
// window controls stay usable. Clicks are delegated from the screen itself, so the tiles work from the very
// first frame — before the messenger list has loaded.
const WELCOME_SERVICES = ['Telegram', 'WhatsApp', 'VK', 'MAX', 'Viber', 'Gmail', 'Discord', 'Slack']

function bindWelcomeScreen({ state, cloudStore, popularMessengers, addMessenger, openModal, onSearchInput, onSearchEnter, tGet }) {
    const screen = document.getElementById('welcomeScreen')
    const grid = document.getElementById('welcomeGrid')
    if (!screen || !grid) return

    const catalog = WELCOME_SERVICES
        .map(name => popularMessengers.find(m => m.name === name))
        .filter(Boolean)

    grid.innerHTML = ''
    catalog.forEach(m => {
        const tile = document.createElement('button')
        tile.type = 'button'
        tile.className = 'wl-tile'
        tile.dataset.name = m.name
        const img = document.createElement('img')
        img.src = m.icon
        img.alt = ''
        const label = document.createElement('span')
        label.textContent = m.name
        const hint = document.createElement('em')
        hint.setAttribute('data-i18n', 'welcome.tileAdd')
        hint.textContent = tGet('welcome.tileAdd')
        tile.append(img, label, hint)
        grid.appendChild(tile)
    })

    const isLocked = () => state.orgCanAddOwnMessengers === false

    function refresh() {
        const user = cloudStore.getUser()
        const kicker = document.getElementById('welcomeKicker')
        if (kicker) {
            const name = user && (user.name || '').trim()
            kicker.textContent = name
                ? tGet('welcome.kickerUser').replace('{name}', name.split(/\s+/)[0])
                : tGet('welcome.kicker')
        }
        const locked = isLocked()
        screen.classList.toggle('wl-locked', locked)
    }

    grid.addEventListener('click', (e) => {
        const tile = e.target.closest('.wl-tile')
        if (!tile || isLocked()) return
        const m = catalog.find(x => x.name === tile.dataset.name)
        if (m) addMessenger(m)
    })

    const input = document.getElementById('welcomeLinkInput')
    function submitLink() {
        if (isLocked()) return
        openModal()
        const search = document.getElementById('modalSearchInput')
        const value = (input?.value || '').trim()
        if (search && value) {
            search.value = value
            onSearchInput?.(value)
            onSearchEnter?.()
        }
    }
    document.getElementById('welcomeLinkBtn')?.addEventListener('click', submitLink)
    input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitLink() } })

    new MutationObserver(refresh).observe(screen, { attributes: true, attributeFilter: ['style'] })
    refresh()
}

module.exports = { bindWelcomeScreen }
