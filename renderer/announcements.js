'use strict'
// In-app windows from the owner (admin → «Окна в приложении»): a window with words, a picture and a button that comes to
// everyone, to people without an account too, or to a chosen group. Owner's rules (2026-11-17): it shows once and stays
// until the person closes it (no nagging); during a promotion the logo wears a Santa hat and a click on the logo brings
// the window back, in case it was closed by accident.
const { cleanItems, pickToShow, markSeen, hatItem, safeLink } = require('./announcements-logic')

const SEEN_KEY = 'centrio.announcements.seen'
const FIRST_CHECK_MS = 9000
const CHECK_EVERY_MS = 30 * 60 * 1000
const BUSY_RETRY_MS = 20 * 1000
const BUSY_TRIES = 12

const WORDS = {
    ru: { promo: 'Промокод', copy: 'Копировать', copied: 'Скопировано', close: 'Закрыть', logo: 'Показать акцию' },
    en: { promo: 'Promo code', copy: 'Copy', copied: 'Copied', close: 'Close', logo: 'Show the offer' },
    de: { promo: 'Promocode', copy: 'Kopieren', copied: 'Kopiert', close: 'Schließen', logo: 'Angebot zeigen' },
    es: { promo: 'Código promocional', copy: 'Copiar', copied: 'Copiado', close: 'Cerrar', logo: 'Mostrar la oferta' },
    fr: { promo: 'Code promo', copy: 'Copier', copied: 'Copié', close: 'Fermer', logo: "Afficher l'offre" },
    it: { promo: 'Codice promo', copy: 'Copia', copied: 'Copiato', close: 'Chiudi', logo: "Mostra l'offerta" },
    zh: { promo: '优惠码', copy: '复制', copied: '已复制', close: '关闭', logo: '查看优惠' }
}

const HAT_SVG = '<svg viewBox="0 0 32 24" width="20" height="15" aria-hidden="true"><path d="M3 21 C5 9 13 2 25 4 C23 8 22 13 25 21 Z" fill="#e5342f"/><path d="M2 20.5 H28 a2.5 2.5 0 0 1 0 5 H2 a2.5 2.5 0 0 1 0 -5 Z" fill="#fff" transform="translate(0 -3)"/><circle cx="26" cy="4" r="3.2" fill="#fff"/></svg>'

function createAnnouncements({ store, invokeIpc, openExternal, openPricing, canShowNow }) {
    let items = []
    let timer = null
    let overlay = null
    let busyTries = 0

    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }
    const words = () => {
        const lang = (store.get('settings', {}) || {}).language
        return WORDS[lang] || WORDS.en
    }
    const readSeen = () => {
        try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') || {} } catch { return {} }
    }
    const writeSeen = (seen) => {
        try { localStorage.setItem(SEEN_KEY, JSON.stringify(seen)) } catch { /* the window may show once more: harmless */ }
    }
    const report = (item, event) => { invokeIpc('announcements:event', item.id, event).catch(() => {}) }

    function close(item, how) {
        if (!overlay) return
        overlay.remove()
        overlay = null
        document.removeEventListener('keydown', onKey, true)
        writeSeen(markSeen(readSeen(), item, items))
        if (how) report(item, how)
    }
    function onKey(e) {
        if (e.key === 'Escape' && overlay) { e.stopPropagation(); close(overlay.__item, 'close') }
    }

    function promoRow(item) {
        const w = words()
        const row = el('div', 'ann-promo')
        row.append(el('span', 'ann-promo-label', w.promo), el('code', 'ann-promo-code', item.promoCode))
        const copy = el('button', 'ann-promo-copy', w.copy)
        copy.type = 'button'
        copy.addEventListener('click', async () => {
            try { await navigator.clipboard.writeText(item.promoCode); copy.textContent = w.copied } catch { copy.textContent = item.promoCode }
        })
        row.append(copy)
        return row
    }

    function open(item, reopened) {
        if (overlay) return
        const w = words()
        overlay = el('div', `ann-overlay ann-theme-${item.theme}`)
        overlay.__item = item
        const card = el('div', 'ann-card')
        card.setAttribute('role', 'dialog')
        card.setAttribute('aria-modal', 'true')
        card.setAttribute('aria-labelledby', 'annTitle')

        const x = el('button', 'ann-close', '×')
        x.type = 'button'
        x.setAttribute('aria-label', w.close)
        x.addEventListener('click', () => close(item, 'close'))
        card.append(x)

        if (item.imageUrl) {
            const img = el('img', 'ann-image')
            img.alt = ''
            img.src = item.imageUrl
            img.addEventListener('error', () => img.remove())
            card.append(img)
        }
        const title = el('h2', 'ann-title', item.title)
        title.id = 'annTitle'
        card.append(title)
        if (item.body) card.append(el('p', 'ann-body', item.body))
        if (item.promoCode) card.append(promoRow(item))
        if (item.button) {
            const go = el('button', 'ann-button', item.button.label)
            go.type = 'button'
            go.addEventListener('click', () => {
                report(item, 'click')
                close(item, null)
                if (item.button.action === 'pricing') openPricing()
                else if (safeLink(item.button.url)) openExternal(item.button.url)
            })
            card.append(go)
        }
        overlay.append(card)
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(item, 'close') })
        document.body.append(overlay)
        document.addEventListener('keydown', onKey, true)
        ;(card.querySelector('.ann-button') || x).focus({ preventScroll: true })
        report(item, reopened ? 'reopen' : 'shown')
    }

    // ── the hat on the logo ──────────────────────────────────────────────────
    function applyHat() {
        const logo = document.querySelector('.titlebar .app-logo')
        if (!logo) return
        const item = hatItem(items)
        let hat = document.getElementById('annHat')
        if (!item) {
            hat?.remove()
            logo.classList.remove('ann-logo-hat')
            logo.removeAttribute('title')
            return
        }
        if (!hat) {
            hat = el('span', 'ann-hat')
            hat.id = 'annHat'
            hat.innerHTML = HAT_SVG
            hat.setAttribute('aria-hidden', 'true')
            logo.parentElement.append(hat)
        }
        logo.classList.add('ann-logo-hat')
        logo.title = words().logo
    }

    function onLogoClick() {
        const item = hatItem(items)
        if (item) open(item, true)
    }

    // ── the check ─────────────────────────────────────────────────────────────
    async function check() {
        let result = null
        try { result = await invokeIpc('announcements:active') } catch { /* offline: try next time */ }
        if (result && result.success) {
            items = cleanItems(result.items)
            applyHat()
            // forget the closes of windows the owner has removed (the empty id is dropped by the same pass)
            writeSeen(markSeen(readSeen(), { id: '', version: '' }, items))
        }
        showWhenFree()
    }

    // A window never lands on top of the first launch screens, another window or a lock screen: it waits and tries again.
    function showWhenFree() {
        if (overlay) return
        const item = pickToShow(items, readSeen())
        if (!item) { busyTries = 0; return }
        if (canShowNow()) { busyTries = 0; open(item, false); return }
        if (++busyTries > BUSY_TRIES) { busyTries = 0; return }
        setTimeout(showWhenFree, BUSY_RETRY_MS)
    }

    function start() {
        document.querySelector('.titlebar .app-logo')?.addEventListener('click', onLogoClick)
        setTimeout(check, FIRST_CHECK_MS)
        timer = setInterval(check, CHECK_EVERY_MS)
    }

    function stop() { if (timer) clearInterval(timer); timer = null }

    return { start, stop, check, open }
}

module.exports = { createAnnouncements }
