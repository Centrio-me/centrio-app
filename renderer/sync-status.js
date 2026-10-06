// Sync status (2026-10-06): what the cloud and team sync did last, a "Sync now" button, and a record of every failure.
// Before this, every sync step swallowed its errors, so a failed step simply meant an empty or stale app with no trace.
// Failures are shown here and sent to the admin panel (the server keeps the reason, never any content).
const copy = {
    ru: {
        title: 'Синхронизация', statusTitle: 'Синхронизация с облаком и командой', syncNow: 'Синхронизировать сейчас', syncing: 'Синхронизируем…',
        ok: 'Всё в порядке', problem: 'Есть проблема', never: 'Ещё не выполнялась', at: 'в {time}', notLoggedIn: 'Вы не вошли в аккаунт: синхронизировать нечего.',
        team: 'Мессенджеры и папки команды', teamOk: 'Мессенджеров: {n}', push: 'Отправка настроек в облако', pull: 'Загрузка из облака при запуске', session: 'Вход в аккаунт', account: 'Данные аккаунта',
        reasonTokenLost: 'Сохранённый вход не удалось прочитать, нужно войти заново', reasonUnauthorized: 'Нужно войти заново', reasonSession: 'Сессия истекла, пришлось выйти из аккаунта', reasonTimeout: 'Облако не ответило вовремя, работаем с локальными данными',
        reasonNetwork: 'Нет связи с сервером', reasonServer: 'Ошибка на сервере', reasonLimit: 'Слишком много запросов, попробуйте позже', reasonBadResponse: 'Сервер вернул неожиданный ответ',
        sent: 'Подробности о проблеме отправлены разработчикам.', done: 'Готово', close: 'Закрыть', hint: 'Если здесь красным написана проблема, нажмите «Синхронизировать сейчас». Если не помогает, пришлите нам скриншот.'
    },
    en: {
        title: 'Sync', statusTitle: 'Sync with the cloud and your team', syncNow: 'Sync now', syncing: 'Syncing…',
        ok: 'All good', problem: 'There is a problem', never: 'Not run yet', at: 'at {time}', notLoggedIn: 'You are not signed in: nothing to sync.',
        team: 'Team messengers and folders', teamOk: 'Messengers: {n}', push: 'Sending settings to the cloud', pull: 'Loading from the cloud at startup', session: 'Account sign-in', account: 'Account data',
        reasonTokenLost: 'The saved sign-in could not be read, please sign in again', reasonUnauthorized: 'Please sign in again', reasonSession: 'The session expired and you were signed out', reasonTimeout: 'The cloud did not answer in time, using local data',
        reasonNetwork: 'No connection to the server', reasonServer: 'Server error', reasonLimit: 'Too many requests, try again later', reasonBadResponse: 'The server returned an unexpected answer',
        sent: 'The details of the problem were sent to the developers.', done: 'Done', close: 'Close', hint: 'If a problem is shown in red, press “Sync now”. If it does not help, send us a screenshot.'
    }
}

const STEPS = ['team', 'account', 'push', 'pull']
const REPORT_COOLDOWN_MS = 10 * 60 * 1000
const OUTBOX_KEY = 'centrio.syncOutbox'
const OUTBOX_MAX = 20

function createSyncStatus({ state, store, authorizedInvoke, isLoggedIn, runSyncNow }) {
    const results = new Map() // step -> { ok, at, detail, code }
    const lastSent = new Map() // `${step}|${code}` -> ms
    let overlay = null
    let busy = false
    let note = ''

    const t = (key, params = {}) => {
        const code = (store.get('settings', {}) || {}).language || 'ru'
        const dict = copy[code === 'ru' ? 'ru' : 'en']
        return String(dict[key] || copy.en[key] || key).replace(/\{(\w+)\}/g, (_m, name) => (params[name] != null ? params[name] : ''))
    }
    const timeText = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

    function reasonOf(code) {
        const c = String(code || '').toLowerCase()
        if (c === 'session_expired') return t('reasonSession')
        if (c === 'unauthorized' || c === '401') return t('reasonUnauthorized')
        if (c === 'timeout') return t('reasonTimeout')
        if (c === 'token_lost') return t('reasonTokenLost')
        if (c === '429') return t('reasonLimit')
        if (c === 'bad_response') return t('reasonBadResponse')
        if (/^5\d\d$/.test(c)) return t('reasonServer')
        if (c === 'network' || c === 'econnrefused' || c === 'enotfound' || c === 'etimedout') return t('reasonNetwork')
        return ''
    }

    function readOutbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]') || [] } catch { return [] } }
    function writeOutbox(list) { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(list.slice(-OUTBOX_MAX))) } catch { /* storage unavailable */ } }

    async function flushOutbox() {
        if (!isLoggedIn()) return
        const list = readOutbox()
        if (!list.length) return
        writeOutbox([])
        for (const item of list) {
            try {
                const result = await authorizedInvoke('api-sync-report', item)
                if (!result || !result.success) { writeOutbox([...readOutbox(), item]); break }
            } catch { writeOutbox([...readOutbox(), item]); break }
        }
    }

    async function send(step, code, message) {
        const key = `${step}|${code}`
        const now = Date.now()
        if (now - (lastSent.get(key) || 0) < REPORT_COOLDOWN_MS) return
        lastSent.set(key, now)
        const payload = {
            step, code: String(code || 'error').slice(0, 40), message: String(message || '').slice(0, 200), at: new Date(now).toISOString(),
            platform: String(navigator.platform || '').slice(0, 20), appVersion: String(document.getElementById('statusVersion')?.textContent || '').replace(/^v/i, '').slice(0, 20)
        }
        writeOutbox([...readOutbox(), payload])
        await flushOutbox()
    }

    /** Called from every sync step. Never throws. */
    function report(step, ok, info = {}) {
        try {
            const code = info.code != null ? String(info.code) : ''
            results.set(step, { ok, at: Date.now(), detail: info.detail || '', code, message: info.message || '' })
            if (!ok) send(step, code || 'error', info.message || '').catch(() => {})
            updateBadge()
            if (overlay) render()
        } catch { /* statistics about sync must never break sync */ }
    }

    function anyProblem() {
        for (const r of results.values()) if (!r.ok) return true
        return false
    }

    function updateBadge() {
        const dot = document.getElementById('statusSyncDot')
        const text = document.getElementById('statusSyncText')
        const btn = document.getElementById('statusSync')
        if (!btn) return
        const loggedIn = isLoggedIn()
        btn.style.display = loggedIn ? '' : 'none'
        btn.title = t('statusTitle')
        const problem = anyProblem()
        if (dot) dot.className = `status-dot ${busy ? 'status-sync-busy' : problem ? 'status-sync-bad' : 'status-online'}`
        if (text) text.textContent = busy ? t('syncing') : problem ? t('problem') : t('title')
    }

    function stepText(step, r) {
        if (!r) return { label: t('never'), cls: 'idle' }
        if (r.ok) {
            const extra = step === 'team' && r.detail ? ` · ${t('teamOk', { n: r.detail })}` : ''
            return { label: `${t('ok')}, ${t('at', { time: timeText(r.at) })}${extra}`, cls: 'ok' }
        }
        const why = reasonOf(r.code) || r.message || r.code || ''
        return { label: `${why || t('problem')} (${t('at', { time: timeText(r.at) })})`, cls: 'bad' }
    }

    function render() {
        if (!overlay) return
        const panel = overlay.querySelector('.tm-panel')
        panel.textContent = ''
        const head = document.createElement('div')
        head.className = 'tm-head'
        const title = document.createElement('div')
        title.className = 'tm-title'
        title.textContent = t('title')
        const x = document.createElement('button')
        x.type = 'button'
        x.className = 'tm-x'
        x.textContent = '×'
        x.addEventListener('click', close)
        head.append(title, x)
        panel.appendChild(head)

        const list = document.createElement('div')
        list.className = 'sync-list'
        if (!isLoggedIn()) {
            const none = document.createElement('div')
            none.className = 'tm-empty'
            none.textContent = t('notLoggedIn')
            list.appendChild(none)
        } else {
            STEPS.forEach((step) => {
                const r = results.get(step)
                const info = stepText(step, r)
                const row = document.createElement('div')
                row.className = `sync-row sync-${info.cls}`
                const name = document.createElement('div')
                name.className = 'sync-name'
                name.textContent = t(step)
                const status = document.createElement('div')
                status.className = 'sync-status'
                status.textContent = info.label
                row.append(name, status)
                list.appendChild(row)
            })
        }
        panel.appendChild(list)

        const foot = document.createElement('div')
        foot.className = 'tm-foot'
        if (note) { const n = document.createElement('div'); n.className = 'tm-toast'; n.textContent = note; foot.appendChild(n) }
        if (anyProblem()) { const s = document.createElement('div'); s.className = 'tm-note'; s.textContent = `${t('sent')} ${t('hint')}`; foot.appendChild(s) }
        const bottom = document.createElement('div')
        bottom.className = 'tm-bottom'
        const action = document.createElement('button')
        action.type = 'button'
        action.className = 'qr-btn-primary tm-sleep-all'
        action.textContent = busy ? t('syncing') : t('syncNow')
        action.disabled = busy || !isLoggedIn()
        action.addEventListener('click', syncNow)
        bottom.appendChild(action)
        foot.appendChild(bottom)
        panel.appendChild(foot)
    }

    async function syncNow() {
        if (busy || !isLoggedIn()) return
        busy = true
        note = ''
        updateBadge()
        render()
        try { await runSyncNow() } catch (error) { report('account', false, { code: 'error', message: String(error && error.message || error) }) }
        busy = false
        note = anyProblem() ? '' : t('done')
        updateBadge()
        render()
        flushOutbox().catch(() => {})
    }

    function open() {
        if (overlay) return
        overlay = document.createElement('div')
        overlay.className = 'tm-overlay'
        const panel = document.createElement('div')
        panel.className = 'tm-panel sync-panel'
        overlay.appendChild(panel)
        overlay.addEventListener('mousedown', (event) => { if (event.target === overlay) close() })
        document.body.appendChild(overlay)
        note = ''
        render()
    }

    function close() {
        overlay?.remove()
        overlay = null
    }

    document.getElementById('statusSync')?.addEventListener('click', () => (overlay ? close() : open()))
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay) close() })
    setInterval(updateBadge, 15000)
    setTimeout(() => {
        if (window.__centrioAuthLost) report('account', false, { code: 'token_lost', message: 'saved sign-in could not be read at startup' })
        updateBadge()
        flushOutbox().catch(() => {})
    }, 4000)

    window.__centrioSync = { report }
    return { report, open, close, syncNow }
}

module.exports = { createSyncStatus }
