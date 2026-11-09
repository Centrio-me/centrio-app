// Screen-share picker page: screens / windows with previews, the computer's sound (Windows), Share / Cancel.
'use strict'
;(async function () {
    const api = window.screenShare
    const $ = (id) => document.getElementById(id)
    if (new URLSearchParams(location.search).get('theme') === 'light') document.documentElement.dataset.theme = 'light'

    const data = (await api.init()) || { items: [], strings: {} }
    const s = data.strings || {}
    const items = Array.isArray(data.items) ? data.items : []
    let tab = items.some((i) => i.kind === 'screen') ? 'screen' : 'window'
    let picked = null

    $('title').textContent = s.title || 'Что показать?'
    $('site').textContent = data.site ? (s.site || '{site} хочет показать ваш экран').replace('{site}', data.site) : ''
    $('tabScreens').textContent = s.screens || 'Весь экран'
    $('tabWindows').textContent = s.windows || 'Окна'
    $('cancel').textContent = s.cancel || 'Отмена'
    $('share').textContent = s.share || 'Поделиться'
    $('soundText').textContent = s.sound || 'Со звуком компьютера'
    $('soundRow').hidden = !data.canShareSound
    $('spacer').hidden = !!data.canShareSound

    function render() {
        $('tabScreens').classList.toggle('on', tab === 'screen')
        $('tabWindows').classList.toggle('on', tab === 'window')
        const grid = $('grid')
        grid.textContent = ''
        const list = items.filter((i) => i.kind === tab)
        if (!list.length) {
            const empty = document.createElement('div')
            empty.className = 'empty'
            empty.textContent = s.none || 'Нечего показать'
            grid.appendChild(empty)
        }
        list.forEach((item) => {
            const b = document.createElement('button')
            b.type = 'button'
            b.className = 'item' + (picked === item.id ? ' on' : '')
            b.setAttribute('role', 'option')
            b.setAttribute('aria-selected', String(picked === item.id))
            const shot = document.createElement('img')
            shot.className = 'shot'
            shot.alt = ''
            if (item.thumbnail && item.thumbnail.startsWith('data:image/')) shot.src = item.thumbnail
            const name = document.createElement('div')
            name.className = 'name'
            if (item.icon && item.icon.startsWith('data:image/')) {
                const icon = document.createElement('img')
                icon.alt = ''
                icon.src = item.icon
                name.appendChild(icon)
            }
            const text = document.createElement('span')
            text.textContent = item.name
            text.title = item.name
            name.appendChild(text)
            b.append(shot, name)
            b.addEventListener('click', () => { picked = item.id; $('share').disabled = false; render() })
            b.addEventListener('dblclick', () => { picked = item.id; share() })
            grid.appendChild(b)
        })
    }

    function share() {
        if (!picked) return
        api.choose(picked, $('sound').checked)
    }

    $('tabScreens').addEventListener('click', () => { tab = 'screen'; render() })
    $('tabWindows').addEventListener('click', () => { tab = 'window'; render() })
    $('share').addEventListener('click', share)
    $('cancel').addEventListener('click', () => api.cancel())
    $('close').addEventListener('click', () => api.cancel())
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') api.cancel()
        if (e.key === 'Enter' && picked) share()
    })
    // one screen and nothing else: it is preselected, so Enter shares it at once
    const screens = items.filter((i) => i.kind === 'screen')
    if (screens.length === 1) { picked = screens[0].id; $('share').disabled = false }
    render()
})()
