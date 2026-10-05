// Password manager — the right-sidebar panel (2026-10-05, reworked 2026-10-06 around a master password).
// Everything user-provided is rendered with textContent, never innerHTML. A password is only held here while the
// user has pressed "show" (and for a few seconds); the main process does the copying and the typing into pages.
const { passwordsTexts } = require('./passwords-texts')
const { generatePassword } = require('./passwords-gen')
const { createImportView } = require('./passwords-import-ui')

const REVEAL_MS = 15000
const FEEDBACK_MS = 2400
const REMOVE_CONFIRM_MS = 3000
const MIN_MASTER = 8

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' } }
const sameSite = (a, b) => {
    const x = hostOf(a)
    const y = hostOf(b)
    return !!x && !!y && (x === y || x.endsWith(`.${y}`) || y.endsWith(`.${x}`))
}

const ICONS = {
    copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    lock: '<rect x="4" y="10.5" width="16" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
}

function bindPasswordsUi({ store, state, invokeIpc, openRightPanel, closeRightPanel, getActivePanelKey, isPro, pmSync, onIconClick }) {
    const btn = document.getElementById('passwordsBtn')
    const panel = document.getElementById('passwordsPanel')
    const listEl = document.getElementById('passwordsList')
    const searchInput = document.getElementById('passwordsSearch')
    const searchWrap = searchInput ? searchInput.closest('.app-notif-search') : null
    const addBtn = document.getElementById('passwordsAddBtn')
    const editor = document.getElementById('passwordsEditor')
    const noteEl = document.getElementById('passwordsNote')
    const actionsEl = panel ? panel.querySelector('.app-notif-header-actions') : null
    if (!btn || !panel || !listEl || !editor) return { applyVisibility() {}, vaultChanged() {}, applyRemote() {}, refresh() {} }

    const t = (key, params = {}) => {
        const code = (store.get('settings', {}) || {}).language || 'ru'
        const dict = passwordsTexts[code === 'ru' ? 'ru' : 'en']
        return String(dict[key] || passwordsTexts.en[key] || key).replace(/\{(\w+)\}/g, (_m, name) => (params[name] != null ? params[name] : ''))
    }

    let status = { state: 'none', count: 0, autoLockMin: 15, autoLockChoices: [5, 15, 30, 60, 0], mismatch: false }
    let entries = []
    let query = ''
    let view = 'main' // 'main' | 'settings' | 'import'
    const importWrap = document.createElement('div')
    let importMounted = false
    let openId = null
    let flash = null // { text, kind, at }
    const revealed = new Map() // id -> { password, timer }
    const removing = new Map() // id -> timer

    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }
    const svg = (paths, size = 14) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
    function iconBtn(title, icon, onClick, className) {
        const b = el('button', `pm-icon-btn ${className || ''}`.trim())
        b.type = 'button'
        b.title = title
        b.setAttribute('aria-label', title)
        b.innerHTML = svg(icon)
        b.addEventListener('click', (event) => { event.stopPropagation(); onClick() })
        return b
    }
    function textBtn(label, className, onClick) {
        const b = el('button', className, label)
        b.type = 'button'
        b.addEventListener('click', (event) => { event.stopPropagation(); onClick() })
        return b
    }
    function field(labelText, type, value, placeholder) {
        const wrap = el('label', 'pm-field')
        wrap.appendChild(el('span', 'pm-field-label', labelText))
        const input = el('input', 'pm-input')
        input.type = type
        input.value = value || ''
        input.autocomplete = type === 'password' ? 'new-password' : 'off'
        input.spellcheck = false
        if (placeholder) input.placeholder = placeholder
        wrap.appendChild(input)
        return { wrap, input }
    }

    function setFlash(text, kind = 'ok') {
        flash = { text, kind, at: Date.now() }
        renderNote()
        setTimeout(() => { if (flash && Date.now() - flash.at >= FEEDBACK_MS - 50) { flash = null; renderNote() } }, FEEDBACK_MS)
    }

    function renderNote() {
        if (!noteEl) return
        noteEl.textContent = flash ? flash.text : (status.state === 'unlocked' ? t('footnote') : '')
        noteEl.className = `pm-note${flash && flash.kind === 'err' ? ' pm-note-err' : ''}`
    }

    const activeMessenger = () => (state.activeTabId ? state.activeMessengers.find((m) => m.id === state.activeTabId) || null : null)

    // ── data ─────────────────────────────────────────────────────────────────────────────────────────────
    async function refresh() {
        const result = await invokeIpc('pm:status')
        if (result && result.success) status = { ...status, ...result }
        pmSync.blocked = !!status.mismatch
        entries = []
        if (status.state === 'unlocked') {
            const listed = await invokeIpc('pm:list')
            if (listed && listed.success) entries = listed.entries || []
            else if (listed && listed.error === 'LOCKED') status = { ...status, state: 'locked' }
        }
        render()
    }

    async function vaultChanged(sync = true) {
        if (sync) {
            const exported = await invokeIpc('pm:export')
            if (exported && exported.success && exported.vault) store.set('pmVault', exported.vault)
        }
        await refresh()
    }

    // After an import only the cloud copy has to follow; the wizard itself must not be redrawn underneath the user.
    async function syncVaultQuietly() {
        const exported = await invokeIpc('pm:export')
        if (exported && exported.success && exported.vault) store.set('pmVault', exported.vault)
    }

    const importView = createImportView({
        lang: () => (store.get('settings', {}) || {}).language || 'ru',
        invokeIpc,
        onClose: () => { importView.reset(); importMounted = false; view = 'main'; refresh() },
        onImported: () => { syncVaultQuietly() }
    })

    function openImport() {
        importMounted = false
        view = 'import'
        render()
    }

    async function applyRemote(blob) {
        if (!isPro() || !blob) return
        const result = await invokeIpc('pm:merge-remote', blob)
        if (result && result.success && result.changed) {
            const exported = await invokeIpc('pm:export')
            if (exported && exported.success && exported.vault) store.set('pmVault', exported.vault)
        }
        await refresh()
    }

    // ── gate: set up / unlock ────────────────────────────────────────────────────────────────────────────
    function gateIcon(box) {
        const icon = el('div', 'pm-gate-icon')
        icon.innerHTML = svg(ICONS.lock, 26)
        box.appendChild(icon)
    }

    function renderSetup() {
        const box = el('div', 'pm-gate')
        gateIcon(box)
        box.appendChild(el('div', 'pm-gate-title', t('setupTitle')))
        box.appendChild(el('div', 'pm-gate-text', t('setupText')))
        const first = field(t('masterNew'), 'password', '', t('masterHint', { n: MIN_MASTER }))
        const second = field(t('masterRepeat'), 'password', '')
        const error = el('div', 'pm-editor-error')
        const submit = async () => {
            error.textContent = ''
            if (first.input.value.length < MIN_MASTER) { error.textContent = t('errMasterShort', { n: MIN_MASTER }); return }
            if (first.input.value !== second.input.value) { error.textContent = t('errMasterMismatch'); return }
            const result = await invokeIpc('pm:setup', first.input.value)
            first.input.value = ''
            second.input.value = ''
            if (result && result.success) await vaultChanged(true)
            else error.textContent = t('errSetup')
        }
        second.input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit() })
        box.append(first.wrap, second.wrap, error, textBtn(t('setupBtn'), 'qr-btn-primary pm-gate-btn', submit), el('div', 'pm-gate-warn', t('setupWarn')))
        return box
    }

    function renderUnlock() {
        const box = el('div', 'pm-gate')
        gateIcon(box)
        box.appendChild(el('div', 'pm-gate-title', t('lockedTitle')))
        const input = field(t('masterLabel'), 'password', '')
        const error = el('div', 'pm-editor-error')
        const submit = async () => {
            error.textContent = ''
            const result = await invokeIpc('pm:unlock', input.input.value)
            input.input.value = ''
            if (result && result.success) await refresh()
            else error.textContent = t('wrongMaster')
        }
        input.input.addEventListener('keydown', (event) => { if (event.key === 'Enter') submit() })
        box.append(input.wrap, error, textBtn(t('unlock'), 'qr-btn-primary pm-gate-btn', submit))
        setTimeout(() => input.input.focus(), 30)
        return box
    }

    // ── settings view ────────────────────────────────────────────────────────────────────────────────────
    function renderSettings() {
        const box = el('div', 'pm-settings')
        box.appendChild(textBtn(`← ${t('back')}`, 'pm-link-btn pm-back', () => { view = 'main'; render() }))
        box.appendChild(textBtn(t('importBtn'), 'qr-btn-ghost pm-import-row', openImport))

        const lockRow = el('label', 'pm-field')
        lockRow.appendChild(el('span', 'pm-field-label', t('autoLock')))
        const select = el('select', 'pm-input')
        ;(status.autoLockChoices || [5, 15, 30, 60, 0]).forEach((m) => select.appendChild(new Option(m === 0 ? t('autoLockNever') : t('autoLockMin', { n: m }), String(m))))
        select.value = String(status.autoLockMin)
        select.addEventListener('change', async () => { await invokeIpc('pm:set-autolock', Number(select.value)); await refresh() })
        lockRow.appendChild(select)
        box.appendChild(lockRow)

        const sync = el('div', 'pm-sync')
        sync.appendChild(el('div', 'pm-sync-title', t('syncTitle')))
        sync.appendChild(el('div', 'pm-sync-text', isPro() ? t('syncOn') : t('syncPro')))
        box.appendChild(sync)

        box.appendChild(el('div', 'pm-editor-title', t('changeMaster')))
        const oldM = field(t('masterOld'), 'password', '')
        const newM = field(t('masterNew'), 'password', '', t('masterHint', { n: MIN_MASTER }))
        const newM2 = field(t('masterRepeat'), 'password', '')
        const error = el('div', 'pm-editor-error')
        box.append(oldM.wrap, newM.wrap, newM2.wrap, error, textBtn(t('changeBtn'), 'qr-btn-primary', async () => {
            error.textContent = ''
            if (newM.input.value.length < MIN_MASTER) { error.textContent = t('errMasterShort', { n: MIN_MASTER }); return }
            if (newM.input.value !== newM2.input.value) { error.textContent = t('errMasterMismatch'); return }
            const result = await invokeIpc('pm:change-master', oldM.input.value, newM.input.value)
            oldM.input.value = ''; newM.input.value = ''; newM2.input.value = ''
            if (result && result.success) { view = 'main'; await vaultChanged(true); setFlash(t('masterChanged')) }
            else error.textContent = t(result && result.error === 'WRONG_MASTER' ? 'wrongMaster' : 'errSave')
        }))

        const danger = el('div', 'pm-danger-zone')
        danger.appendChild(el('div', 'pm-sync-text', t('resetText')))
        let armed = false
        const resetBtn = textBtn(t('resetBtn'), 'pm-danger-btn', async () => {
            if (!armed) { armed = true; resetBtn.textContent = t('resetConfirm'); setTimeout(() => { armed = false; resetBtn.textContent = t('resetBtn') }, REMOVE_CONFIRM_MS); return }
            await invokeIpc('pm:reset')
            store.set('pmVault', null)
            view = 'main'
            await refresh()
        })
        danger.appendChild(resetBtn)
        box.appendChild(danger)
        return box
    }

    // ── cloud vault with another key ─────────────────────────────────────────────────────────────────────
    function renderMismatch() {
        const box = el('div', 'pm-banner')
        box.appendChild(el('div', 'pm-banner-text', t('mismatch')))
        const input = field(t('masterCloud'), 'password', '')
        const error = el('div', 'pm-editor-error')
        const row = el('div', 'pm-editor-buttons')
        row.appendChild(textBtn(t('mismatchLater'), 'qr-btn-ghost', async () => { await invokeIpc('pm:discard-remote'); await refresh() }))
        row.appendChild(textBtn(t('mismatchJoin'), 'qr-btn-primary', async () => {
            const result = await invokeIpc('pm:adopt-remote', input.input.value)
            input.input.value = ''
            if (result && result.success) await vaultChanged(true)
            else error.textContent = t('wrongMaster')
        }))
        box.append(input.wrap, error, row)
        return box
    }

    // ── list ─────────────────────────────────────────────────────────────────────────────────────────────
    function avatarFor(entry) {
        const wrap = el('span', 'pm-avatar')
        const letter = el('span', 'pm-avatar-letter', (entry.title || entry.host || '?').trim().charAt(0).toUpperCase() || '?')
        let hash = 0
        for (const ch of entry.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
        wrap.style.setProperty('--pm-hue', String(hash % 360))
        wrap.appendChild(letter)
        if (entry.host) {
            const img = document.createElement('img')
            img.className = 'pm-avatar-img'
            img.alt = ''
            img.referrerPolicy = 'no-referrer'
            img.addEventListener('load', () => { if (img.naturalWidth > 16) { wrap.classList.add('has-icon'); letter.style.display = 'none' } else img.remove() })
            img.addEventListener('error', () => img.remove())
            img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(entry.host)}&sz=64`
            wrap.appendChild(img)
        }
        return wrap
    }

    async function copy(entry, what) {
        const result = await invokeIpc('pm:copy', entry.id, what)
        if (result && result.success) setFlash(what === 'login' ? t('copied') : t('copiedPassword'))
        else setFlash(t('errFill'), 'err')
    }

    async function toggleReveal(entry) {
        const existing = revealed.get(entry.id)
        if (existing) { clearTimeout(existing.timer); revealed.delete(entry.id); render(); return }
        const result = await invokeIpc('pm:reveal', entry.id)
        if (!result || !result.success) { setFlash(t('errFill'), 'err'); return }
        const timer = setTimeout(() => { revealed.delete(entry.id); render() }, REVEAL_MS)
        revealed.set(entry.id, { password: result.password, timer })
        render()
    }

    function askRemove(entry) {
        if (removing.has(entry.id)) {
            clearTimeout(removing.get(entry.id)); removing.delete(entry.id)
            openId = null
            invokeIpc('pm:delete', entry.id).then(() => vaultChanged(true))
            return
        }
        removing.set(entry.id, setTimeout(() => { removing.delete(entry.id); render() }, REMOVE_CONFIRM_MS))
        render()
    }

    async function fill(entry) {
        const messenger = activeMessenger()
        if (!messenger) { setFlash(t('errNoPage'), 'err'); return }
        setFlash(t('filling'))
        const result = await invokeIpc('pm:autofill', entry.id, messenger.id)
        if (result && result.success) { setFlash(t('filled')); return }
        const map = { NO_PAGE: 'errNoPage', ORIGIN_MISMATCH: 'errOrigin', NO_FORM: 'errNoForm' }
        setFlash(t(map[result && result.error] || 'errFill'), 'err')
    }

    function detailRow(label, valueNode, actions) {
        const row = el('div', 'pm-detail-row')
        row.appendChild(el('span', 'pm-detail-label', label))
        const body = el('div', 'pm-detail-body')
        body.appendChild(valueNode)
        if (actions) actions.forEach((a) => body.appendChild(a))
        row.appendChild(body)
        return row
    }

    function renderEntry(entry, canFill) {
        const item = el('div', `pm-item${openId === entry.id ? ' open' : ''}`)
        const head = el('div', 'pm-item-head')
        head.tabIndex = 0
        head.setAttribute('role', 'button')
        head.appendChild(avatarFor(entry))
        const info = el('div', 'pm-info')
        info.appendChild(el('div', 'pm-name', entry.title))
        info.appendChild(el('div', 'pm-sub', entry.login || entry.host))
        head.appendChild(info)
        if (canFill) head.appendChild(textBtn(t('fill'), 'pm-fill-btn', () => fill(entry)))
        const toggle = () => { openId = openId === entry.id ? null : entry.id; render() }
        head.addEventListener('click', toggle)
        head.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle() } })
        item.appendChild(head)
        if (openId !== entry.id) return item

        const detail = el('div', 'pm-detail')
        detail.appendChild(detailRow(t('fieldLogin'), el('span', 'pm-value', entry.login || '—'), entry.login ? [iconBtn(t('copyLogin'), ICONS.copy, () => copy(entry, 'login'))] : null))
        const reveal = revealed.get(entry.id)
        detail.appendChild(detailRow(t('fieldPassword'), el('span', `pm-value pm-secret${reveal ? ' shown' : ''}`, reveal ? reveal.password : '••••••••••'), [
            iconBtn(reveal ? t('hide') : t('show'), reveal ? ICONS.eyeOff : ICONS.eye, () => toggleReveal(entry)),
            iconBtn(t('copyPassword'), ICONS.copy, () => copy(entry, 'password'))
        ]))
        detail.appendChild(detailRow(t('fieldUrl'), el('span', 'pm-value', entry.host || entry.url)))
        const actions = el('div', 'pm-detail-actions')
        actions.appendChild(textBtn(t('edit'), 'qr-btn-ghost', () => openEditor(entry)))
        actions.appendChild(textBtn(removing.has(entry.id) ? t('removeConfirm') : t('remove'), 'pm-danger-btn', () => askRemove(entry)))
        detail.appendChild(actions)
        item.appendChild(detail)
        return item
    }

    function renderList() {
        listEl.textContent = ''
        if (status.mismatch) listEl.appendChild(renderMismatch())
        if (!entries.length && !status.mismatch) {
            const empty = el('div', 'pm-empty')
            empty.appendChild(el('div', 'pm-empty-title', t('emptyTitle')))
            empty.appendChild(el('div', 'pm-empty-hint', t('emptyHint')))
            empty.appendChild(textBtn(t('importBtn'), 'qr-btn-primary pm-empty-btn', openImport))
            empty.appendChild(el('div', 'pm-empty-hint', t('importHint')))
            listEl.appendChild(empty)
            return
        }
        const q = query.trim().toLowerCase()
        const visible = entries
            .filter((e) => !q || e.title.toLowerCase().includes(q) || (e.login || '').toLowerCase().includes(q) || e.host.includes(q))
            .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
        const messenger = activeMessenger()
        const suggested = messenger ? visible.filter((e) => sameSite(e.url, messenger.url)) : []
        const rest = visible.filter((e) => !suggested.includes(e))
        if (suggested.length) {
            listEl.appendChild(el('div', 'pm-group', t('forThisSite')))
            suggested.forEach((e) => listEl.appendChild(renderEntry(e, true)))
            if (rest.length) listEl.appendChild(el('div', 'pm-group', t('all')))
        }
        rest.forEach((e) => listEl.appendChild(renderEntry(e, false)))
    }

    // ── editor ───────────────────────────────────────────────────────────────────────────────────────────
    function buildEditor(entry) {
        editor.textContent = ''
        editor.appendChild(el('div', 'pm-editor-title', entry ? t('editTitle') : t('newTitle')))
        const messenger = activeMessenger()
        const title = field(t('fieldTitle'), 'text', entry ? entry.title : (messenger ? messenger.name : ''))
        const url = field(t('fieldUrl'), 'text', entry ? entry.url : (messenger ? messenger.url : ''))
        const login = field(t('fieldLogin'), 'text', entry ? entry.login : '')
        const password = field(t('fieldPassword'), 'password', '', entry ? t('passwordKeep') : '')
        editor.append(title.wrap, url.wrap, login.wrap, password.wrap)

        const row = el('div', 'pm-editor-row')
        const toggle = textBtn(t('show'), 'pm-link-btn', () => {
            const hidden = password.input.type === 'password'
            password.input.type = hidden ? 'text' : 'password'
            toggle.textContent = hidden ? t('hide') : t('show')
        })
        const generate = textBtn(t('generate'), 'pm-link-btn', () => { password.input.value = generatePassword(); password.input.type = 'text'; toggle.textContent = t('hide') })
        row.append(toggle, generate)
        editor.appendChild(row)

        const error = el('div', 'pm-editor-error')
        editor.appendChild(error)
        const buttons = el('div', 'pm-editor-buttons')
        buttons.appendChild(textBtn(t('cancel'), 'qr-btn-ghost', closeEditor))
        buttons.appendChild(textBtn(t('save'), 'qr-btn-primary', async () => {
            error.textContent = ''
            const result = await invokeIpc('pm:save', { id: entry ? entry.id : undefined, title: title.input.value, url: url.input.value, login: login.input.value, password: password.input.value })
            if (result && result.success) { password.input.value = ''; openId = result.id; closeEditor(); await vaultChanged(true); return }
            const map = { TITLE_REQUIRED: 'errTitle', URL_INVALID: 'errUrl', PASSWORD_REQUIRED: 'errPassword', LIMIT: 'errLimit' }
            error.textContent = t(map[result && result.error] || 'errSave')
        }))
        editor.appendChild(buttons)
        setTimeout(() => title.input.focus(), 30)
    }

    function openEditor(entry) {
        if (status.state !== 'unlocked') return
        buildEditor(entry)
        editor.style.display = 'block'
        listEl.style.display = 'none'
        if (searchWrap) searchWrap.style.display = 'none'
    }

    function closeEditor() {
        editor.textContent = ''
        editor.style.display = 'none'
        listEl.style.display = ''
        render()
    }

    // ── header + top-level render ────────────────────────────────────────────────────────────────────────
    function renderHeader() {
        const titleEl = document.getElementById('passwordsTitle')
        if (titleEl) titleEl.textContent = t('title')
        btn.title = t('title')
        const label = btn.querySelector('.activity-btn-label')
        if (label) label.textContent = t('title')
        if (!actionsEl) return
        actionsEl.textContent = ''
        if (status.state !== 'unlocked') return
        actionsEl.appendChild(iconBtn(t('lockNow'), ICONS.lock, async () => { await invokeIpc('pm:lock'); revealed.forEach((r) => clearTimeout(r.timer)); revealed.clear(); openId = null; view = 'main'; await refresh() }, 'pm-header-btn'))
        actionsEl.appendChild(iconBtn(t('settings'), ICONS.gear, () => { view = view === 'settings' ? 'main' : 'settings'; render() }, 'pm-header-btn'))
        actionsEl.appendChild(iconBtn(t('add'), ICONS.plus, () => openEditor(null), 'pm-header-btn'))
    }

    function render() {
        renderHeader()
        renderNote()
        if (searchInput) searchInput.placeholder = t('search')
        const unlocked = status.state === 'unlocked'
        const editing = editor.style.display === 'block'
        if (searchWrap) searchWrap.style.display = unlocked && view === 'main' && !editing ? '' : 'none'
        if (addBtn) addBtn.style.display = 'none' // replaced by the dynamic header buttons
        if (editing && unlocked) return
        editor.style.display = 'none'
        listEl.style.display = ''
        listEl.textContent = ''
        if (status.state === 'none') { listEl.appendChild(renderSetup()); return }
        if (status.state === 'locked') { listEl.appendChild(renderUnlock()); return }
        if (view === 'import') {
            listEl.appendChild(importWrap)
            if (!importMounted) { importMounted = true; importView.mount(importWrap) }
            return
        }
        if (view === 'settings') { listEl.appendChild(renderSettings()); return }
        renderList()
    }

    // ── wiring ───────────────────────────────────────────────────────────────────────────────────────────
    btn.addEventListener('click', () => (onIconClick ? onIconClick() : openRightPanel()))
    searchInput?.addEventListener('input', () => { query = searchInput.value; render() })

    const enabled = () => (store.get('settings', {}) || {}).passwordManager !== false
    function applyVisibility() {
        if (!enabled() && getActivePanelKey && getActivePanelKey() === 'passwords') closeRightPanel()
    }

    const observer = new MutationObserver(() => {
        if (panel.classList.contains('active')) { editor.style.display = 'none'; view = 'main'; refresh() }
    })
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] })
    document.addEventListener('click', (event) => {
        if (event.target.closest('.tab, .messenger-item') && status.state === 'unlocked') setTimeout(render, 80)
    })

    refresh()
    return { applyVisibility, vaultChanged, applyRemote, refresh }
}

module.exports = { bindPasswordsUi, generatePassword }
