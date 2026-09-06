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


function registerOAuthIpc({ getMainWindow }) {
    const API_BASE = 'https://api.centrio.me'

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

            return { user, accessToken, refreshToken }
        })
    })

}

module.exports.registerOAuthIpc = registerOAuthIpc
