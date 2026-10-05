// "Войти автоматически" — the employee-side bar of the team password vault (2026-10-05).
// Shown over an assigned messenger that is signed out while the owner has saved an access for it. The login is
// decrypted and typed by the main process (main/services/vault.js); this file only asks for it and shows the
// result. The password never passes through here.
function createVaultLoginBar({ state, tGet, autoLogin }) {
    const AUTO_ATTEMPT_AFTER_MS = 6000
    const SHOW_POLL_MS = 1500
    let barEl = null
    let busy = false
    let lastMessage = null // { messengerId, text, at }
    const outSince = new Map() // messengerId -> ms
    const autoTried = new Set() // one automatic attempt per messenger per session

    function t(key, fallback, params) {
        const text = tGet(`vault.${key}`, params)
        return text && text !== `vault.${key}` ? text : fallback
    }

    const ERRORS = {
        NOT_SHARED: () => t('errNotShared', 'Руководитель ещё не передал доступ для этого устройства.'),
        ORIGIN_MISMATCH: () => t('errOrigin', 'Эта страница не принадлежит назначенному сайту: вход остановлен ради безопасности.'),
        NO_FORM: () => t('errNoForm', 'Не нашли форму входа. Откройте страницу входа и попробуйте ещё раз.'),
        NO_SECURE_STORAGE: () => t('errSecure', 'Системное хранилище паролей недоступно, автовход невозможен.'),
        DECRYPT_FAILED: () => t('errDecrypt', 'Не удалось расшифровать доступ. Попросите руководителя сохранить его заново.')
    }

    function ensureBar() {
        if (barEl) return barEl
        const host = document.getElementById('contentArea')
        if (!host) return null
        barEl = document.createElement('div')
        barEl.id = 'vaultLoginBar'
        barEl.className = 'vault-login-bar'
        barEl.style.display = 'none'
        host.appendChild(barEl)
        return barEl
    }

    function activeMessenger() {
        const id = state.activeTabId
        return id ? state.activeMessengers.find((m) => m.id === id && m.orgAssigned && m.credentialAvailable) || null : null
    }

    function render() {
        const bar = ensureBar()
        if (!bar) return
        const messenger = activeMessenger()
        const signedOut = messenger && state.loginStates[messenger.id] === 'out'
        const message = lastMessage && messenger && lastMessage.messengerId === messenger.id && Date.now() - lastMessage.at < 12000 ? lastMessage.text : null
        if (!messenger || (!signedOut && !message && !busy)) { bar.style.display = 'none'; return }

        bar.innerHTML = ''
        const label = document.createElement('span')
        label.className = 'vault-login-text'
        label.textContent = busy
            ? t('working', 'Входим…')
            : (message || t('barText', 'Вы не вошли в «{name}»', { name: messenger.name }).replace('{name}', messenger.name))
        bar.appendChild(label)
        if (!busy && signedOut) {
            const button = document.createElement('button')
            button.type = 'button'
            button.className = 'vault-login-btn'
            button.textContent = t('barButton', 'Войти автоматически')
            button.addEventListener('click', () => run(messenger.id))
            bar.appendChild(button)
        }
        bar.style.display = 'flex'
    }

    async function run(messengerId) {
        if (busy) return
        busy = true
        render()
        let result = null
        try { result = await autoLogin(messengerId) } catch { result = { success: false, error: 'FAILED' } }
        busy = false
        if (!result || result.success !== true) {
            const text = (ERRORS[result && result.error] || (() => t('errFailed', 'Не удалось войти автоматически.')))()
            lastMessage = { messengerId, text, at: Date.now() }
        } else {
            lastMessage = null
        }
        render()
    }

    document.addEventListener('login-state-changed', (event) => {
        const id = event?.detail?.messengerId
        if (!id) return
        if (event.detail.state === 'out') { if (!outSince.has(id)) outSince.set(id, Date.now()) } else { outSince.delete(id) }
        render()
    })

    // Show/hide on tab switches and run the single automatic attempt.
    setInterval(() => {
        render()
        const now = Date.now()
        for (const [id, since] of outSince) {
            if (autoTried.has(id) || now - since < AUTO_ATTEMPT_AFTER_MS) continue
            const messenger = state.activeMessengers.find((m) => m.id === id && m.orgAssigned && m.credentialAvailable)
            if (!messenger) continue
            autoTried.add(id)
            run(id)
        }
    }, SHOW_POLL_MS)

    return { render, run }
}

module.exports = { createVaultLoginBar }
