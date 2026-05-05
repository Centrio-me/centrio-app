const CATALOG = [
    {
        id: 'cjpalhdlnbpafiamejdnhcphjbkeiagm',
        name: 'uBlock Origin',
        desc: 'Лучший блокировщик рекламы и трекеров',
        category: 'Безопасность',
        color: '#800000',
        icon: 'https://www.google.com/s2/favicons?domain=ublockorigin.com&sz=64'
    },
    {
        id: 'hdokiejnpimakedhajhdlcegeplioahd',
        name: 'LastPass',
        desc: 'Менеджер паролей — автозаполнение форм',
        category: 'Безопасность',
        color: '#CC0000',
        icon: 'https://www.google.com/s2/favicons?domain=lastpass.com&sz=64'
    },
    {
        id: 'nngceckbapebfimnlniiiahkandclblb',
        name: 'Bitwarden',
        desc: 'Бесплатный менеджер паролей с открытым кодом',
        category: 'Безопасность',
        color: '#175DDC',
        icon: 'https://www.google.com/s2/favicons?domain=bitwarden.com&sz=64'
    },
    {
        id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
        name: 'Dark Reader',
        desc: 'Тёмная тема для любого сайта',
        category: 'Внешний вид',
        color: '#1A1A2E',
        icon: 'https://www.google.com/s2/favicons?domain=darkreader.org&sz=64'
    },
    {
        id: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
        name: 'Grammarly',
        desc: 'Проверка орфографии и грамматики',
        category: 'Инструменты',
        color: '#15C39A',
        icon: 'https://www.google.com/s2/favicons?domain=grammarly.com&sz=64'
    },
    {
        id: 'aapbdbdomjkkjkaonfhkkikfgjllcleb',
        name: 'Google Переводчик',
        desc: 'Перевод страниц одним кликом',
        category: 'Инструменты',
        color: '#4285F4',
        icon: 'https://www.google.com/s2/favicons?domain=translate.google.com&sz=64'
    },
    {
        id: 'gighmmpiobklfepjocnamgkkbiglidom',
        name: 'AdBlock',
        desc: 'Блокировщик рекламы и всплывающих окон',
        category: 'Безопасность',
        color: '#F8321E',
        icon: 'https://www.google.com/s2/favicons?domain=getadblock.com&sz=64'
    },
    {
        id: 'bmnlcjabgnpnenekpadlanbbkooimhnj',
        name: 'Honey',
        desc: 'Автоматический поиск купонов при покупках',
        category: 'Покупки',
        color: '#FFA500',
        icon: 'https://www.google.com/s2/favicons?domain=joinhoney.com&sz=64'
    },
    {
        id: 'jddgbeighonaipjikdnfdpiefhoomlae',
        name: 'Юбуст',
        desc: 'SEO-анализ и продвижение: позиции, аудит, ключевые слова',
        category: 'SEO & Аналитика',
        color: '#FF6B35',
        icon: 'https://www.google.com/s2/favicons?domain=uboost.ru&sz=64'
    }
]

function createExtensionsUiApi({ invokeIpc, tGet, requirePro }) {
    let installedIds   = new Set()
    let disabledIds    = new Set()
    let busyIds        = new Set()
    let extMetaMap     = new Map()

    async function refreshInstalled() {
        const res = await invokeIpc('ext:list')
        if (!res?.success) return
        installedIds = new Set(res.data.map(e => e.id))
        disabledIds  = new Set(res.data.filter(e => !e.enabled).map(e => e.id))
        extMetaMap   = new Map(res.data.map(e => [e.id, e]))
    }

    function renderCard(ext, container) {
        const installed = installedIds.has(ext.id)
        const enabled   = installed && !disabledIds.has(ext.id)
        const busy      = busyIds.has(ext.id)

        const card = document.createElement('div')
        card.className = 'ext-card' + (installed ? ' ext-installed' : '')
        card.dataset.id = ext.id
        card.innerHTML = `
            <div class="ext-card-icon" style="background:${ext.color}20; border-color:${ext.color}40">
                <img src="${ext.icon}" width="32" height="32" onerror="this.style.display='none'">
            </div>
            <div class="ext-card-info">
                <div class="ext-card-name">${ext.name}</div>
                <div class="ext-card-desc">${ext.desc}</div>
                <div class="ext-card-cat">${ext.category}</div>
            </div>
            <div class="ext-card-actions">
                ${installed ? `
                    <label class="ext-toggle">
                        <input type="checkbox" class="ext-toggle-check" ${enabled ? 'checked' : ''}>
                        <span class="ext-toggle-slider"></span>
                    </label>
                    <button class="ext-uninstall-btn" title="Удалить">✕</button>
                ` : `
                    <button class="ext-install-btn ${busy ? 'loading' : ''}" ${busy ? 'disabled' : ''}>
                        ${busy ? '⏳' : '+ Установить'}
                    </button>
                `}
            </div>
        `

        if (installed) {
            const toggle = card.querySelector('.ext-toggle-check')
            toggle?.addEventListener('change', async (e) => {
                await invokeIpc('ext:toggle', ext.id, e.target.checked)
                if (e.target.checked) disabledIds.delete(ext.id)
                else disabledIds.add(ext.id)
            })

            const uninstallBtn = card.querySelector('.ext-uninstall-btn')
            uninstallBtn?.addEventListener('click', async () => {
                let confirmed = false
                if (typeof window.showConfirmModal === 'function') {
                    confirmed = await window.showConfirmModal({
                        title: tGet('extensions.uninstallTitle') || `Удалить ${ext.name}?`,
                        message: tGet('extensions.uninstallMsg') || 'Расширение будет удалено. Это действие необратимо.',
                        confirmText: tGet('extensions.uninstallBtn') || 'Удалить',
                        cancelText: tGet('dialogs.cancel') || 'Отмена',
                        danger: true
                    })
                } else {
                    confirmed = confirm(`Удалить ${ext.name}?`)
                }
                if (!confirmed) return
                busyIds.add(ext.id)
                await invokeIpc('ext:uninstall', ext.id)
                installedIds.delete(ext.id)
                busyIds.delete(ext.id)
                renderAll(container)
            })

            card.addEventListener('contextmenu', (e) => {
                e.preventDefault()
                e.stopPropagation()
                showExtContextMenu(e.clientX, e.clientY, ext.id)
            })
        } else {
            const installBtn = card.querySelector('.ext-install-btn')
            installBtn?.addEventListener('click', async () => {
                if (!requirePro('extensions')) return
                busyIds.add(ext.id)
                renderAll(container)
                const res = await invokeIpc('ext:install', ext.id)
                busyIds.delete(ext.id)
                if (res?.success) {
                    installedIds.add(ext.id)
                } else {
                    alert(`Ошибка установки: ${res?.error || 'неизвестно'}`)
                }
                renderAll(container)
            })
        }

        return card
    }

    function renderAll(container) {
        if (!container) return
        container.innerHTML = ''

        const categories = [...new Set(CATALOG.map(e => e.category))]
        for (const cat of categories) {
            const items = CATALOG.filter(e => e.category === cat)
            const section = document.createElement('div')
            section.className = 'ext-category'
            section.innerHTML = `<div class="ext-category-title">${cat}</div>`
            const grid = document.createElement('div')
            grid.className = 'ext-grid'
            items.forEach(ext => grid.appendChild(renderCard(ext, container)))
            section.appendChild(grid)
            container.appendChild(section)
        }
    }

    async function openExtensionsSection() {
        await refreshInstalled()
        const container = document.getElementById('extensionsCatalog')
        renderAll(container)
    }

    function getOrCreateContextMenu() {
        let menu = document.getElementById('extContextMenu')
        if (!menu) {
            menu = document.createElement('div')
            menu.id = 'extContextMenu'
            menu.className = 'ext-ctx-menu'
            document.body.appendChild(menu)
            document.addEventListener('click', () => menu.classList.remove('show'), true)
        }
        return menu
    }

    function showExtContextMenu(x, y, extId) {
        const meta = extMetaMap.get(extId)
        if (!meta) return
        const menu = getOrCreateContextMenu()

        const items = []
        if (meta.popupPage) {
            items.push({ label: tGet('extensions.openPopup') || 'Открыть попап', url: meta.popupPage })
        }
        if (meta.optionsPage) {
            items.push({ label: tGet('extensions.openSettings') || 'Настройки расширения', url: meta.optionsPage })
        }
        if (!items.length) {
            items.push({ label: tGet('extensions.noPages') || 'Нет страниц расширения', disabled: true })
        }

        menu.innerHTML = items.map(item =>
            item.disabled
                ? `<div class="ext-ctx-item ext-ctx-disabled">${item.label}</div>`
                : `<div class="ext-ctx-item" data-url="${item.url}">${item.label}</div>`
        ).join('')

        menu.querySelectorAll('.ext-ctx-item[data-url]').forEach(el => {
            el.addEventListener('click', () => {
                invokeIpc('open-popup-window', el.dataset.url, { width: 420, height: 600 }).catch(() => {})
                menu.classList.remove('show')
            })
        })

        const vw = window.innerWidth, vh = window.innerHeight
        const mw = 220, mh = items.length * 36 + 8
        menu.style.left = (x + mw > vw ? x - mw : x) + 'px'
        menu.style.top  = (y + mh > vh ? y - mh : y) + 'px'
        menu.classList.add('show')
    }

    return { openExtensionsSection }
}

module.exports = { createExtensionsUiApi, EXTENSION_CATALOG: CATALOG }
