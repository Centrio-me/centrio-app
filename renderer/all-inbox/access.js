'use strict'
// «Все мессенджеры» (11.2026): a PRO mode in alpha testing. This file keeps its button in step with the plan and the
// on/off setting, draws that setting (Settings → Все мессенджеры) and the «α» note in the list's header, whose link opens
// a new support topic in the account window.
const { accessOf, isEnabledIn } = require('./access-rules')

const STORE_KEY = 'allInbox'
// the plan can change under a running app (end of a trial, a payment): checked again this often
const RECHECK_MS = 60 * 1000

/**
 * @param {{ store: { get: Function, set: Function }, tGet: (key: string, fallback?: string) => string,
 *   hasEffectivePro: () => boolean, showUpgradeModal: (title: string, text: string) => void }} deps
 */
function createAllInboxAccess({ store, tGet, hasEffectivePro, showUpgradeModal }) {
    const t = (key, fallback) => tGet(`v380.allInbox.${key}`, fallback) || fallback || ''
    const button = document.getElementById('allInboxBtn')
    let inbox = null

    const enabled = () => isEnabledIn(store.get(STORE_KEY, null))
    const pro = () => { try { return !!hasEffectivePro() } catch { return false } }
    const state = () => accessOf({ enabled: enabled(), pro: pro() })

    /** The gate of the list's setOpen: quiet = opening by itself at start-up, so no upgrade window. */
    function canOpen({ quiet = false } = {}) {
        const now = state()
        if (now === 'open') return true
        if (now === 'locked' && !quiet) showUpgradeModal(t('proTitle', 'Все мессенджеры — в ПРО'), t('proDesc', ''))
        return false
    }

    function apply() {
        const now = state()
        if (button) {
            button.hidden = now === 'hidden'
            button.classList.toggle('is-locked', now === 'locked')
        }
        if (now !== 'open' && inbox?.isOpen()) inbox.setOpen(false)
    }

    function setEnabled(on) {
        const saved = store.get(STORE_KEY, null)
        store.set(STORE_KEY, { ...(saved && typeof saved === 'object' ? saved : {}), enabled: !!on })
        apply()
    }

    // ── Settings → Все мессенджеры ──────────────────────────────────────────────────
    function renderSettings() {
        const group = document.getElementById('allInboxSettingsGroup')
        if (!group) return
        group.textContent = ''
        const title = el('div', 'settings-group-title')
        title.append(t('title', 'Все мессенджеры'), el('span', 'ai-pro-chip', 'ПРО'), alphaChip())
        group.append(title)
        const row = el('div', 'settings-row')
        const label = el('div', 'settings-label')
        label.append(el('span', '', t('settingsLabel', 'Показывать «Все мессенджеры»')), el('span', 'settings-hint', t('settingsHint', '')))
        const toggle = el('label', 'toggle')
        const input = el('input')
        input.type = 'checkbox'
        input.checked = enabled()
        input.addEventListener('change', () => setEnabled(input.checked))
        toggle.append(input, el('span', 'toggle-slider'))
        row.append(label, toggle)
        group.append(row)
        if (!pro()) group.append(el('div', 'settings-hint ai-settings-pro', t('settingsPro', '')))

        // filters by kind (3.8.3): some people sort chats into their own folders and do not need them
        const afRow = el('div', 'settings-row')
        const afLabel = el('div', 'settings-label')
        afLabel.append(el('span', '', t('autoFilters', 'Автофильтры')), el('span', 'settings-hint', t('autoFiltersHint', 'Личные, Группы и Каналы в колонке папок. Выключите, если раскладываете чаты по своим папкам.')))
        const afToggle = el('label', 'toggle')
        const afInput = el('input')
        afInput.type = 'checkbox'
        const savedRoot = store.get(STORE_KEY, null)
        afInput.checked = !(savedRoot && typeof savedRoot === 'object' && savedRoot.autoFilters === false)
        afInput.addEventListener('change', () => {
            const saved = store.get(STORE_KEY, null)
            store.set(STORE_KEY, { ...(saved && typeof saved === 'object' ? saved : {}), autoFilters: afInput.checked })
            document.dispatchEvent(new CustomEvent('all-inbox-autofilters'))
        })
        afToggle.append(afInput, el('span', 'toggle-slider'))
        afRow.append(afLabel, afToggle)
        group.append(afRow)

        // feedback: the same new support topic as the «α» note of the list
        const fbRow = el('div', 'settings-row')
        const fbLabel = el('div', 'settings-label')
        fbLabel.append(el('span', '', t('feedbackLabel', 'Отзыв о режиме')), el('span', 'settings-hint', t('feedbackHint', '')))
        const fbBtn = el('button', 'ai-alpha-feedback ai-settings-feedback', t('feedback', 'Оставить отзыв'))
        fbBtn.type = 'button'
        fbBtn.addEventListener('click', () => {
            document.getElementById('settingsModal')?.classList.remove('show')
            askFeedback()
        })
        fbRow.append(fbLabel, fbBtn)
        group.append(fbRow)
    }

    // ── «α» in the list's header: what alpha means and a link to write to us ──────
    function bindAlphaNote() {
        const link = document.querySelector('#allInboxPanel .ai-alpha-feedback')
        link?.addEventListener('click', (e) => { e.preventDefault(); askFeedback() })
    }

    function askFeedback() {
        document.dispatchEvent(new CustomEvent('open-support-new', {
            detail: { topic: 'idea', subject: t('feedbackSubject', 'Отзыв о «Все мессенджеры»') }
        }))
    }

    // the same drawn α as in index.html (a letter sits on the text baseline and is never centred)
    function alphaChip() {
        const chip = el('span', 'ai-alpha-chip')
        chip.innerHTML = '<svg class="ai-alpha-glyph" viewBox="0 0 20 20" aria-hidden="true"><path d="M14.6 5.5C14 10 12.1 14.5 8.7 14.5 6.4 14.5 5 12.6 5 10s1.4-4.5 3.7-4.5c3.4 0 5.3 4.5 6.3 9" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        return chip
    }

    function el(tag, cls, text) {
        const node = document.createElement(tag)
        if (cls) node.className = cls
        if (text != null) node.textContent = text
        return node
    }

    bindAlphaNote()
    apply()
    setInterval(apply, RECHECK_MS)
    // drawn like the 3.7.1 groups: when the settings window opens and when its own «Все мессенджеры» item is chosen
    document.querySelector('.settings-nav-item[data-section="allInbox"]')?.addEventListener('click', renderSettings)
    const settingsModal = document.getElementById('settingsModal')
    if (settingsModal) {
        new MutationObserver(() => { if (settingsModal.classList.contains('show')) renderSettings() })
            .observe(settingsModal, { attributes: true, attributeFilter: ['class'] })
    }
    renderSettings()

    return {
        canOpen,
        apply,
        renderSettings,
        attach(list) { inbox = list; apply() }
    }
}

module.exports = { createAllInboxAccess }
