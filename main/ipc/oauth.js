const { ipcMain, shell } = require('electron')
const crypto = require('crypto')
const store = require('../services/store')
const entitlement = require('../services/entitlement')
const { OAUTH } = require('../config/constants')
const { createModalWindow } = require('../factory/modalWindow')
const { t } = require('../services/i18n')
const { wrapIpc } = require('../utils/ipc')

// ── Shared pending-auth registry ──────────────────────────────────
// When we open the system browser for OAuth, we store a resolve/reject
// pair here, plus a locally-generated `nonce` unique to this attempt.
// handleProtocolUrl (protocol.js) calls resolveOAuth() when it receives
// centrio://auth?accessToken=...&state=...
//
// SECURITY: the centrio:// protocol handler is registered OS-wide once the
// app is installed — any other application, or a web page doing
// `location.href = 'centrio://auth?accessToken=...'`, can invoke it. Without
// this nonce check, an attacker who wins the race while a real login is
// pending could inject their own accessToken and get the victim silently
// logged into an attacker-controlled account (login CSRF). The nonce is
// generated here, sent to the server as `client_nonce` when opening the
// browser, and the server only echoes it back (as `state`) after verifying
// the OAuth provider's own callback against a state value it itself issued
// server-side — see landing/auth-server.js. A callback is only accepted if
// its `state` matches the nonce for THIS specific in-flight attempt.
let _pending = null

function resolveOAuth(accessToken, refreshToken, state) {
    if (!_pending) return false

    if (!state || state !== _pending.nonce) {
        console.warn('[oauth] Rejected centrio://auth callback: state/nonce mismatch ' +
            '(no matching in-flight login attempt — possible spoofed or replayed deep link)')
        return false
    }

    const { resolve, timer } = _pending
    _pending = null
    clearTimeout(timer)
    resolve({ accessToken, refreshToken })
    return true
}

function rejectOAuth(reason) {
    if (!_pending) return false
    const { reject, timer } = _pending
    _pending = null
    clearTimeout(timer)
    reject(new Error(reason || 'OAuth cancelled'))
    return true
}

module.exports.resolveOAuth = resolveOAuth
module.exports.rejectOAuth  = rejectOAuth

// ── System-browser OAuth helper ───────────────────────────────────
// Opens the given URL (with a `client_nonce` query param appended) in the
// system browser and waits for the centrio://auth?accessToken=...&state=...
// deep link to come back with a matching state.
function systemBrowserOAuth({ authUrl, timeoutMs = 5 * 60 * 1000 }) {
    return new Promise((resolve, reject) => {
        if (_pending) {
            // Cancel any previous pending auth
            const prev = _pending
            _pending = null
            clearTimeout(prev.timer)
            prev.reject(new Error('New auth started'))
        }

        const nonce = crypto.randomBytes(16).toString('hex')

        const timer = setTimeout(() => {
            _pending = null
            reject(new Error(t('oauth.timeout')))
        }, timeoutMs)

        _pending = { resolve, reject, timer, nonce }

        const sep = authUrl.includes('?') ? '&' : '?'
        const urlWithNonce = `${authUrl}${sep}client_nonce=${nonce}`

        // Open system browser — no Electron window needed
        shell.openExternal(urlWithNonce).catch((err) => {
            _pending = null
            clearTimeout(timer)
            reject(err)
        })
    })
}


// ── Telegram — the person confirms in @Centrio_bot, the app collects the session ──
const TELEGRAM_POLL_MS = 3000
const TELEGRAM_WAIT_MS = 5 * 60 * 1000
const TELEGRAM_CANCELLED = 'telegram-cancelled'
let _telegram = null

const postJson = async (url, body) => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || t('oauth.authError'))
    return data
}

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForTelegram(apiBase, attempt) {
    const deadline = Date.now() + TELEGRAM_WAIT_MS
    while (Date.now() < deadline) {
        await pause(TELEGRAM_POLL_MS)
        if (_telegram !== attempt) throw new Error(TELEGRAM_CANCELLED)
        // One lost answer must not end the sign-in: the next round asks again.
        const data = await postJson(`${apiBase}/api/auth/telegram-bot/poll`, { code: attempt.code, secret: attempt.secret }).catch(() => ({ status: 'pending' }))
        if (data.status === 'confirmed') return data
        if (data.status === 'declined') throw new Error(TELEGRAM_CANCELLED)
        if (data.status !== 'pending') throw new Error(t('oauth.timeout'))
    }
    throw new Error(t('oauth.timeout'))
}

function registerOAuthIpc({ getMainWindow }) {
    const API_BASE = 'https://api.centrio.me'

    ipcMain.handle('telegram-login-start', async () => {
        return wrapIpc(async () => {
            const data = await postJson(`${API_BASE}/api/auth/telegram-bot/start`, { client: 'desktop' })
            _telegram = { code: data.code, secret: data.secret, appUrl: data.appUrl }
            return { qr: data.qr }
        })
    })

    ipcMain.handle('telegram-login-open', async () => {
        return wrapIpc(async () => {
            if (_telegram) await shell.openExternal(_telegram.appUrl)
            return true
        })
    })

    ipcMain.handle('telegram-login-cancel', async () => {
        _telegram = null
        return { success: true }
    })

    ipcMain.handle('telegram-login-wait', async () => {
        return wrapIpc(async () => {
            const attempt = _telegram
            if (!attempt) throw new Error(TELEGRAM_CANCELLED)
            const { user, accessToken, refreshToken } = await waitForTelegram(API_BASE, attempt)
            _telegram = null
            entitlement.persistCloudUser(user)
            require('../services/api').identifyDevice(accessToken, refreshToken).catch(() => {})
            return { user, accessToken, refreshToken }
        })
    })

    // ── Google — system browser + deep link ──────────────────────
    ipcMain.handle('oauth-google', async () => {
        return wrapIpc(async () => {
            const { accessToken, refreshToken } = await systemBrowserOAuth({
                authUrl: `${API_BASE}/api/auth/google?from=desktop`
            })

            const apiSvc = require('../services/api')
            const result = await apiSvc.me(accessToken)
            const user = result?.data?.user
            if (!user) throw new Error('Failed to get user data')

            // SECURITY: persist here, in main, from the object main itself just
            // fetched over TLS from /api/auth/me — never trust a `plan` field
            // the renderer could hand back after the fact. See PROTECTED_SET_KEYS
            // in main.js.
            entitlement.persistCloudUser(user)

            // Сессию создал браузер — представляемся серверу как приложение.
            apiSvc.identifyDevice(accessToken, refreshToken).catch(() => {})

            return { user, accessToken, refreshToken }
        })
    })

    // ── Yandex — system browser + deep link ──────────────────────
    ipcMain.handle('oauth-yandex', async () => {
        return wrapIpc(async () => {
            const { accessToken, refreshToken } = await systemBrowserOAuth({
                authUrl: `${API_BASE}/api/auth/yandex?from=desktop`
            })

            const apiSvc = require('../services/api')
            const result = await apiSvc.me(accessToken)
            const user = result?.data?.user
            if (!user) throw new Error('Failed to get user data')

            entitlement.persistCloudUser(user)

            // Сессию создал браузер — представляемся серверу как приложение.
            apiSvc.identifyDevice(accessToken, refreshToken).catch(() => {})

            return { user, accessToken, refreshToken }
        })
    })

}

module.exports.registerOAuthIpc = registerOAuthIpc
