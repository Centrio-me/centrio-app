// Password manager — the bar shown over the open tab (2026-10-06).
//  - a sign-in form is on the page and the manager has a password for this site: "Вставить";
//  - the manager is locked: ask for the master password right here;
//  - the user just submitted a login: "Сохранить пароль?" (new / update).
// Passwords never pass through this file: it only knows titles, logins and ids. Typing the password into the page
// and storing a captured one both happen in the main process.
const TEXTS = {
    ru: {
        fillFor: 'Сохранённый пароль для {host}', fillBtn: 'Вставить', filling: 'Вставляем…', filled: 'Вставлено',
        locked: 'Менеджер паролей заблокирован', masterPlaceholder: 'Мастер-пароль', unlock: 'Разблокировать', wrongMaster: 'Неверный мастер-пароль',
        saveNew: 'Сохранить пароль для {host}?', saveUpdate: 'Обновить пароль для {host}?', saveLocked: 'Сохранить пароль для {host}? Введите мастер-пароль',
        noVault: 'Чтобы сохранять пароли, задайте мастер-пароль', setup: 'Задать', save: 'Сохранить', update: 'Обновить', unlockSave: 'Разблокировать и сохранить', notNow: 'Не сейчас', never: 'Никогда для этого сайта',
        saved: 'Пароль сохранён', close: 'Закрыть',
        errNoPage: 'Откройте вкладку с сайтом, куда нужно войти.', errOrigin: 'Открытая страница не относится к этому сайту, вход остановлен ради безопасности.', errNoForm: 'Не нашли форму входа. Откройте страницу входа и попробуйте ещё раз.', errFill: 'Не удалось вставить пароль.', errSave: 'Не удалось сохранить пароль.'
    },
    en: {
        fillFor: 'Saved password for {host}', fillBtn: 'Fill in', filling: 'Filling in…', filled: 'Filled in',
        locked: 'The password manager is locked', masterPlaceholder: 'Master password', unlock: 'Unlock', wrongMaster: 'Wrong master password',
        saveNew: 'Save the password for {host}?', saveUpdate: 'Update the password for {host}?', saveLocked: 'Save the password for {host}? Enter the master password',
        noVault: 'To save passwords, set a master password', setup: 'Set up', save: 'Save', update: 'Update', unlockSave: 'Unlock and save', notNow: 'Not now', never: 'Never for this site',
        saved: 'Password saved', close: 'Close',
        errNoPage: 'Open the tab of the site you want to sign in to.', errOrigin: 'The open page does not belong to this site: sign-in stopped for your safety.', errNoForm: 'Could not find the sign-in form. Open the sign-in page and try again.', errFill: 'Could not fill in the password.', errSave: 'Could not save the password.'
    }
}

const FLASH_MS = 3500
const POLL_MS = 700

function createPmBar({ state, store, ipcRenderer, invokeIpc, openPanel, onVaultChanged }) {
    let barEl = null
    const forms = new Map() // messengerId -> { hasForm, url }
    const captures = new Map() // messengerId -> offer
    const suggestions = new Map() // messengerId -> { state, entries, url }
    const dismissed = new Set() // `${messengerId}|${host}` closed by the user this session
    let flash = null // { messengerId, text, at }
    let busy = false
    let lastRendered = ''

    const t = (key, params = {}) => {
        const code = (store.get('settings', {}) || {}).language || 'ru'
        const dict = TEXTS[code === 'ru' ? 'ru' : 'en']
        return String(dict[key] || TEXTS.en[key] || key).replace(/\{(\w+)\}/g, (_m, name) => (params[name] != null ? params[name] : ''))
    }
    const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

    function ensureBar() {
        if (barEl) return barEl
        const host = document.getElementById('contentArea')
        if (!host) return null
        barEl = document.createElement('div')
        barEl.id = 'pmBar'
        barEl.className = 'pm-bar'
        barEl.style.display = 'none'
        host.appendChild(barEl)
        return barEl
    }

    const activeId = () => state.activeTabId || null

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }
    function button(label, className, onClick) {
        const b = el('button', className, label)
        b.type = 'button'
        b.addEventListener('click', onClick)
        return b
    }

    function say(messengerId, text) {
        flash = { messengerId, text, at: Date.now() }
        render()
        setTimeout(render, FLASH_MS + 50)
    }

    function drop(messengerId) {
        captures.delete(messengerId)
        render()
    }

    async function refreshSuggestion(messengerId) {
        const form = forms.get(messengerId)
        if (!form || !form.hasForm) { suggestions.delete(messengerId); render(); return }
        const result = await invokeIpc('pm:matches', form.url)
        if (result && result.success) suggestions.set(messengerId, { state: result.state, entries: result.entries || [], url: form.url, hasPassword: form.hasPassword })
        render()
    }

    async function doFill(messengerId, entryId) {
        busy = true
        say(messengerId, t('filling'))
        const result = await invokeIpc('pm:autofill', entryId, messengerId)
        busy = false
        if (result && result.success) { say(messengerId, t('filled')); return }
        if (result && result.error === 'LOCKED') { await refreshSuggestion(messengerId); return }
        const map = { NO_PAGE: 'errNoPage', ORIGIN_MISMATCH: 'errOrigin', NO_FORM: 'errNoForm' }
        say(messengerId, t(map[result && result.error] || 'errFill'))
    }

    function masterInput(onSubmit) {
        const input = el('input', 'pm-bar-input')
        input.type = 'password'
        input.placeholder = t('masterPlaceholder')
        input.autocomplete = 'off'
        input.spellcheck = false
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') onSubmit(input) })
        return input
    }

    async function unlockWith(messengerId, input, then) {
        const result = await invokeIpc('pm:unlock', input.value)
        input.value = ''
        if (!result || !result.success) { say(messengerId, t('wrongMaster')); return }
        if (typeof then === 'function') await then()
        else await refreshSuggestion(messengerId)
    }

    async function saveCapture(messengerId, offer, input) {
        const result = await invokeIpc('pm:capture-save', offer.captureId, input ? input.value : '')
        if (input) input.value = ''
        if (!result || !result.success) { say(messengerId, t(result && result.error === 'WRONG_MASTER' ? 'wrongMaster' : 'errSave')); return }
        captures.delete(messengerId)
        onVaultChanged()
        say(messengerId, t('saved'))
    }

    function renderCapture(bar, messengerId, offer) {
        const host = offer.host
        if (offer.kind === 'no-vault') {
            bar.appendChild(el('span', 'pm-bar-text', t('noVault')))
            bar.appendChild(button(t('setup'), 'pm-bar-btn', () => { captures.delete(messengerId); openPanel(); render() }))
            bar.appendChild(button(t('notNow'), 'pm-bar-ghost', () => drop(messengerId)))
            return
        }
        const label = offer.kind === 'update' ? t('saveUpdate', { host }) : (offer.kind === 'locked' ? t('saveLocked', { host }) : t('saveNew', { host }))
        const text = el('span', 'pm-bar-text')
        text.appendChild(document.createTextNode(label))
        if (offer.login) text.appendChild(el('span', 'pm-bar-sub', offer.login))
        bar.appendChild(text)
        if (offer.kind === 'locked') {
            const input = masterInput((i) => saveCapture(messengerId, offer, i))
            bar.appendChild(input)
            bar.appendChild(button(t('unlockSave'), 'pm-bar-btn', () => saveCapture(messengerId, offer, input)))
        } else {
            bar.appendChild(button(offer.kind === 'update' ? t('update') : t('save'), 'pm-bar-btn', () => saveCapture(messengerId, offer, null)))
        }
        bar.appendChild(button(t('notNow'), 'pm-bar-ghost', async () => { await invokeIpc('pm:capture-dismiss', offer.captureId, false); drop(messengerId) }))
        bar.appendChild(button(t('never'), 'pm-bar-ghost', async () => { await invokeIpc('pm:capture-dismiss', offer.captureId, true); drop(messengerId) }))
    }

    function renderSuggestion(bar, messengerId, suggestion) {
        const host = hostOf(suggestion.url)
        const key = `${messengerId}|${host}`
        if (dismissed.has(key)) return false
        const close = () => { dismissed.add(key); render() }
        if (suggestion.state === 'locked') {
            if (!suggestion.hasPassword) return false // only a real password form is worth asking for the master password
            bar.appendChild(el('span', 'pm-bar-text', t('locked')))
            const input = masterInput((i) => unlockWith(messengerId, i))
            bar.appendChild(input)
            bar.appendChild(button(t('unlock'), 'pm-bar-btn', () => unlockWith(messengerId, input)))
            bar.appendChild(button('×', 'pm-bar-x', close)).title = t('close')
            return true
        }
        if (suggestion.state !== 'unlocked' || !suggestion.entries.length) return false
        bar.appendChild(el('span', 'pm-bar-text', t('fillFor', { host })))
        let select = null
        if (suggestion.entries.length > 1) {
            select = el('select', 'pm-bar-select')
            suggestion.entries.forEach((e) => select.appendChild(new Option(e.login || e.title, e.id)))
            bar.appendChild(select)
        } else if (suggestion.entries[0].login) {
            bar.appendChild(el('span', 'pm-bar-sub', suggestion.entries[0].login))
        }
        bar.appendChild(button(t('fillBtn'), 'pm-bar-btn', () => doFill(messengerId, select ? select.value : suggestion.entries[0].id)))
        bar.appendChild(button('×', 'pm-bar-x', close)).title = t('close')
        return true
    }

    function render() {
        const bar = ensureBar()
        if (!bar) return
        const messengerId = activeId()
        const message = flash && flash.messengerId === messengerId && Date.now() - flash.at < FLASH_MS ? flash.text : null
        const offer = messengerId ? captures.get(messengerId) : null
        const suggestion = messengerId ? suggestions.get(messengerId) : null
        const signature = JSON.stringify([messengerId, message, offer && offer.captureId, suggestion && [suggestion.state, suggestion.entries.map((e) => e.id), suggestion.url], busy, [...dismissed].length])
        if (signature === lastRendered && bar.style.display !== 'none') return // do not rebuild (and lose typing) when nothing changed
        lastRendered = signature
        // the bar hangs from the top panel: take its real colour (it differs between themes)
        const panel = document.querySelector('.titlebar')
        if (panel) bar.style.setProperty('--pm-bar-bg', getComputedStyle(panel).backgroundColor)
        bar.textContent = ''
        let shown = false
        if (message) { bar.appendChild(el('span', 'pm-bar-text', message)); shown = true }
        else if (offer) { renderCapture(bar, messengerId, offer); shown = true }
        else if (suggestion) shown = renderSuggestion(bar, messengerId, suggestion)
        bar.style.display = shown ? 'flex' : 'none'
    }

    ipcRenderer.on('pm:event', (payload) => {
        if (!payload || !payload.messengerId) {
            if (payload && payload.type === 'locked') { suggestions.forEach((_v, id) => refreshSuggestion(id)); onVaultChanged(false) }
            return
        }
        const id = payload.messengerId
        if (payload.type === 'form') {
            forms.set(id, { hasForm: payload.hasForm === true, hasPassword: payload.hasPassword === true, url: payload.url || '' })
            refreshSuggestion(id)
        } else if (payload.type === 'capture') {
            captures.set(id, { captureId: payload.captureId, kind: payload.kind, host: payload.host, login: payload.login })
            render()
        }
    })

    let lastActive = null
    let ticks = 0
    setInterval(() => {
        const id = activeId()
        ticks += 1
        // the vault can be unlocked/locked from the panel or another tab: keep the open tab's offer current
        if (ticks % 3 === 0 && id && forms.get(id) && forms.get(id).hasForm && !busy && !captures.get(id)) {
            const typing = barEl && barEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT'
            if (!typing) refreshSuggestion(id)
        }
        if (id !== lastActive) { lastActive = id; lastRendered = ''; render() }
        else if (flash && Date.now() - flash.at >= FLASH_MS) { flash = null; render() }
    }, POLL_MS)

    return { refresh: () => { forms.forEach((_v, id) => refreshSuggestion(id)) } }
}

module.exports = { createPmBar }
