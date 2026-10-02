// One-time animated introduction of the new folder look (shown after the
// update to users who already have folders). The scene loops: the classic grey
// folder turns into the coloured mosaic with a counter, then the floating card
// pops out with its tail. Below it the setting that switches the look back.
const SEEN_KEY = 'centrio-folders-promo-v1'
const SHOW_DELAY_MS = 3500

function bindFoldersPromo({ state, tGet, openAppearanceSettings }) {
    function alreadySeen() {
        try { return localStorage.getItem(SEEN_KEY) === '1' } catch { return false }
    }
    function markSeen() {
        try { localStorage.setItem(SEEN_KEY, '1') } catch {}
    }

    const t = (key, fallback) => tGet(`foldersPromo.${key}`) || fallback
    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }
    const icon = (name) => {
        const image = document.createElement('img')
        image.alt = ''
        image.src = `assets/logomessenger/${name}.png`
        return image
    }

    // Standard service icons only: Telegram, WhatsApp, VK, MAX.
    const SERVICES = [['telegram', 'Telegram'], ['whatsapp', 'WhatsApp'], ['vk', 'VK'], ['max', 'MAX']]

    function buildScene() {
        const scene = el('div', 'fpromo-scene')
        scene.appendChild(el('div', 'fpromo-sidebar'))

        const rail = el('div', 'fpromo-rail')
        const add = el('div', 'fpromo-add')
        add.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
        const classic = el('div', 'fpromo-folder fpromo-classic')
        classic.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
        const modern = el('div', 'fpromo-folder fpromo-modern')
        SERVICES.forEach(([name]) => modern.appendChild(icon(name)))
        modern.appendChild(el('span', 'fpromo-badge', '3'))
        const stack = el('div', 'fpromo-stack')
        stack.append(classic, modern)
        rail.append(add, stack, el('div', 'fpromo-ghost'), el('div', 'fpromo-ghost'))

        const card = el('div', 'fpromo-card')
        const head = el('div', 'fpromo-card-head')
        const mosaic = el('div', 'fpromo-card-mosaic')
        SERVICES.forEach(([name]) => mosaic.appendChild(icon(name)))
        const titles = el('div')
        titles.appendChild(el('strong', '', t('folderName', 'Клиенты')))
        titles.appendChild(el('small', '', t('folderMeta', 'Сервисов: 4 · новых: 3')))
        head.append(mosaic, titles)
        card.appendChild(head)
        SERVICES.forEach(([name, label]) => {
            const row = el('div', 'fpromo-row')
            row.appendChild(icon(name))
            row.appendChild(el('span', '', label))
            card.appendChild(row)
        })

        scene.append(rail, card)
        return scene
    }

    function buildSwitch() {
        const wrap = el('div', 'fpromo-switch')
        wrap.appendChild(el('span', 'fpromo-switch-path', t('path', 'Настройки → Внешний вид → Вид папок')))
        const seg = el('div', 'fpromo-seg')
        seg.appendChild(el('span', 'fpromo-seg-on', t('modern', 'Новый')))
        seg.appendChild(el('span', '', t('classic', 'Классический')))
        wrap.appendChild(seg)
        return wrap
    }

    function show() {
        const overlay = el('div', 'fpromo-overlay')
        const dialog = el('div', 'fpromo-dialog')
        dialog.setAttribute('role', 'dialog')
        dialog.setAttribute('aria-modal', 'true')
        dialog.appendChild(el('span', 'fpromo-pill', t('pill', 'Новое')))
        dialog.appendChild(el('h3', 'fpromo-title', t('title', 'Новый вид папок')))
        dialog.appendChild(buildScene())
        dialog.appendChild(el('p', 'fpromo-text', t('text', 'Иконки сервисов прямо на папке, счётчик непрочитанных, цвета и всплывающая карточка. Не понравилось — верните прежний вид.')))
        dialog.appendChild(buildSwitch())

        const actions = el('div', 'fpromo-actions')
        const settings = el('button', 'fpromo-btn fpromo-btn-primary', t('open', 'Открыть настройки'))
        settings.type = 'button'
        const ok = el('button', 'fpromo-btn', t('ok', 'Понятно'))
        ok.type = 'button'
        actions.append(settings, ok)
        dialog.appendChild(actions)
        overlay.appendChild(dialog)
        document.body.appendChild(overlay)
        requestAnimationFrame(() => overlay.classList.add('show'))

        const close = () => {
            markSeen()
            overlay.classList.remove('show')
            setTimeout(() => overlay.remove(), 220)
            document.removeEventListener('keydown', onKey)
        }
        const onKey = (event) => { if (event.key === 'Escape') close() }
        document.addEventListener('keydown', onKey)
        ok.addEventListener('click', close)
        settings.addEventListener('click', () => { close(); openAppearanceSettings() })
        overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close() })
        ok.focus()
    }

    function maybeShow() {
        if (alreadySeen()) return
        // Only people who already have folders see it; everyone else will meet
        // the new look on their own.
        if (!state.folders.some((folder) => !folder.orgManaged)) return
        if (document.querySelector('.modal.show, .fpromo-overlay')) return
        show()
    }

    setTimeout(maybeShow, SHOW_DELAY_MS)
    return { show, maybeShow }
}

module.exports = { bindFoldersPromo }
