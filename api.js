const https = require('https')
const http = require('http')
const { API_URL } = require('./main/config/constants')

function createHttpError(status, data) {
    const message =
        data?.error ||
        data?.message ||
        `HTTP ${status}`

    const error = new Error(message)
    error.response = {
        status,
        data
    }

    return error
}

function parseResponseBody(raw) {
    if (!raw || !raw.trim()) return null

    try {
        return JSON.parse(raw)
    } catch {
        return raw
    }
}

// Requests previously had no timeout at all — a stalled TCP connection (dead
// wifi, VPN interface torn down mid-request, server accepting but never
// responding) meant the returned promise could hang forever. Anything awaiting
// it — tracker.flush() on app quit, sync push/pull, login — would hang with
// it, which for tracker.flush() specifically could block `before-quit`
// indefinitely (see registerAppEvents.js). REQUEST_TIMEOUT_MS bounds every
// call; a single retry covers transient connection-level failures (reset,
// timeout) without retrying real HTTP error responses (4xx/5xx), so a bad
// login attempt or a genuine validation error isn't retried pointlessly.
const REQUEST_TIMEOUT_MS = 15000

function isRetryableNetworkError(err) {
    return err && (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' ||
        err.code === 'ECONNREFUSED' || err.message === 'request-timeout')
}

function requestOnce(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_URL + path)
        const isHttps = url.protocol === 'https:'
        const payload = body ? JSON.stringify(body) : null

        const options = {
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json'
            }
        }

        if (token) {
            options.headers.Authorization = `Bearer ${token}`
        }

        if (payload) {
            options.headers['Content-Length'] = Buffer.byteLength(payload)
        }

        const transport = isHttps ? https : http
        const req = transport.request(options, (res) => {
            let raw = ''

            res.on('data', (chunk) => {
                raw += chunk
            })

            res.on('end', () => {
                const data = parseResponseBody(raw)
                const response = {
                    status: res.statusCode,
                    data
                }

                if (res.statusCode >= 400) {
                    reject(createHttpError(res.statusCode, data))
                    return
                }

                resolve(response)
            })
        })

        req.on('error', reject)

        // No native connect/response timeout is configured anywhere else in
        // this file's history, so a request could wait on a dead socket
        // forever. `setTimeout` here fires if the socket is idle for the
        // whole duration (no data either way) and we abort it ourselves.
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error('request-timeout'))
        })

        if (payload) {
            req.write(payload)
        }

        req.end()
    })
}

async function request(method, path, body, token) {
    try {
        return await requestOnce(method, path, body, token)
    } catch (err) {
        if (!isRetryableNetworkError(err)) throw err
        // One retry only — enough to ride out a single dropped packet or a
        // VPN interface flapping mid-request, without hammering a genuinely
        // unreachable server.
        return requestOnce(method, path, body, token)
    }
}

module.exports = {
    register(email, password, name) {
        return request('POST', '/api/auth/register', { email, password, name })
    },

    login(email, password) {
        return request('POST', '/api/auth/login', { email, password })
    },

    me(token) {
        return request('GET', '/api/auth/me', null, token)
    },

    refresh(refreshToken) {
        return request('POST', '/api/auth/refresh', { refreshToken })
    },

    logout(token) {
        return request('POST', '/api/auth/logout', null, token)
    },

    googleDesktop(idToken, token) {
        return request('POST', '/api/auth/google/desktop', { idToken }, token)
    },

    yandexDesktop(accessToken) {
        return request('POST', '/api/auth/yandex/desktop', { accessToken })
    },

    vkDesktop(accessToken, userId) {
        return request('POST', '/api/auth/vk/desktop', { accessToken, userId })
    },

    syncPush(token, messengers, folders, settings) {
        return request(
            'POST',
            '/api/sync',
            { messengers, folders, settings },
            token
        )
    },

    syncPull(token) {
        return request('GET', '/api/sync', null, token)
    },

    notesList(token, { archived = false } = {}) {
        return request('GET', `/api/notes${archived ? '?archived=true' : ''}`, null, token)
    },

    notesCreate(token, note) {
        return request('POST', '/api/notes', note, token)
    },

    notesUpdate(token, id, patch) {
        return request('PATCH', `/api/notes/${id}`, patch, token)
    },

    notesDelete(token, id) {
        return request('DELETE', `/api/notes/${id}`, null, token)
    },

    notesReorder(token, order) {
        return request('POST', '/api/notes/reorder', { order }, token)
    },

    updateProfile(token, data) {
        return request('PUT', '/api/user/profile', data, token)
    },

    trackStats(token, data) {
        return request('POST', '/api/stats/track', data, token)
    },

    getStats(token) {
        return request('GET', '/api/stats/summary', null, token)
    },

    getDevices(token) {
        return request('GET', '/api/user/devices', null, token)
    },

    getAssistantUsage(token) {
        return request('GET', '/api/assistant/usage', null, token)
    },

    revokeDevice(token, deviceId) {
        return request('DELETE', `/api/user/devices/${deviceId}`, null, token)
    },

    getNotifications(token) {
        return request('GET', '/api/notifications', null, token)
    },

    readAllNotifications(token) {
        return request('POST', '/api/notifications/read-all', {}, token)
    },

    // SECURITY (trial-farming fix): hardwareId is included so the server can
    // link day-based ("trial-style") promo codes to the same DeviceTrial
    // uniqueness constraint used by deviceTrialRedeem() below — otherwise
    // "skip onboarding" (device trial) and "create account → redeem PRO14"
    // are two completely independent free-14-days grants, and the second one
    // can be farmed forever with disposable email accounts on one machine.
    // See main/ipc/api.js's api-redeem-promo handler for where hardwareId
    // actually comes from (computed in main, never trusted from renderer).
    redeemPromo(token, code, hardwareId) {
        return request('POST', '/api/payments/promo/redeem', { code, hardwareId }, token)
    },

    // Unauthenticated — grants the same 14-day Pro trial as PRO14, but keyed
    // by a hashed hardware id instead of a userId, for onboarding users who
    // skipped account creation. No token, hence no Authorization header.
    deviceTrialRedeem(hardwareId) {
        return request('POST', '/api/payments/device-trial-redeem', { hardwareId })
    },

    // FEATURE (2026-09-10, TEAM owner-control epic). The desktop app only
    // ever READS these — the owner sets logo/VPN/settings/assignments from
    // the website's team dashboard (landing/team-server.tsx), same division
    // of labor as seat billing already has. The one write from the desktop
    // side is orgPushMessengerStats (read-status counts, never content).
    orgGetVpn(token, orgId) {
        return request('GET', `/api/org/${orgId}/vpn`, null, token)
    },

    orgGetSettings(token, orgId) {
        return request('GET', `/api/org/${orgId}/settings`, null, token)
    },

    orgGetMessengerAssignments(token, orgId) {
        return request('GET', `/api/org/${orgId}/messenger-assignments`, null, token)
    },

    orgPushMessengerStats(token, orgId, stats) {
        return request('POST', `/api/org/${orgId}/messenger-stats`, { stats }, token)
    },

    // FEATURE (2026-09-11, встроенный чат-виджет — Pro). Desktop-side
    // (authenticated) API for managing the site + reading/replying to
    // conversations. The public, unauthenticated widget-facing side never
    // goes through the desktop app at all — see landing/widget-routes.js.
    chatSiteGet(token) {
        return request('GET', '/api/chat-sites', null, token)
    },

    chatSiteCreate(token, { domain, name }) {
        return request('POST', '/api/chat-sites', { domain, name }, token)
    },

    chatSiteUpdate(token, siteId, { domain, name }) {
        return request('PATCH', `/api/chat-sites/${siteId}`, { domain, name }, token)
    },

    chatSiteConversations(token, siteId) {
        return request('GET', `/api/chat-sites/${siteId}/conversations`, null, token)
    },

    chatSiteMessages(token, siteId, conversationId, since) {
        const q = since ? `?since=${encodeURIComponent(since)}` : ''
        return request('GET', `/api/chat-sites/${siteId}/conversations/${conversationId}/messages${q}`, null, token)
    },

    chatSiteReply(token, siteId, conversationId, body) {
        return request('POST', `/api/chat-sites/${siteId}/conversations/${conversationId}/messages`, { body }, token)
    },

    chatSiteSetStatus(token, siteId, conversationId, status) {
        return request('PATCH', `/api/chat-sites/${siteId}/conversations/${conversationId}`, { status }, token)
    }
}