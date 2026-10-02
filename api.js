const https = require('https')
const http = require('http')
const os = require('os')
const crypto = require('crypto')
const { API_URL } = require('./main/config/constants')

// Кто мы для сервера (раздел «Устройства» в личном кабинете). Раньше запросы
// приложения шли без User-Agent и без идентификатора: сервер видел «неизвестное
// устройство», не мог отличить два компьютера и не знал, какую сессию удалять
// при выходе. Идентификатор — хэш ID машины (сырой не отправляем), имя —
// название компьютера, чтобы владелец узнавал свои устройства в списке.
let deviceIdentity = null
function getDeviceIdentity() {
    if (deviceIdentity) return deviceIdentity
    let version = '0.0.0'
    try { version = require('electron').app.getVersion() } catch {
        try { version = require('./package.json').version } catch {}
    }
    let deviceId = null
    try {
        const machineId = require('node-machine-id').machineIdSync()
        deviceId = 'app-' + crypto.createHash('sha256').update('centrio-device-v1:' + machineId).digest('hex').slice(0, 40)
    } catch {}
    const platformName = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux'
    let deviceName = ''
    try { deviceName = os.hostname() } catch {}
    deviceIdentity = {
        deviceId,
        deviceName: String(deviceName || '').slice(0, 80),
        version,
        userAgent: `Centrio/${version} (${platformName}; ${process.arch})`
    }
    return deviceIdentity
}

function deviceHeaders() {
    const id = getDeviceIdentity()
    const headers = {
        'User-Agent': id.userAgent,
        'X-Centrio-Client': 'desktop',
        'X-Centrio-App-Version': id.version
    }
    if (id.deviceId) headers['X-Centrio-Device-Id'] = id.deviceId
    if (id.deviceName) headers['X-Centrio-Device-Name'] = encodeURIComponent(id.deviceName)
    return headers
}

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
                'Content-Type': 'application/json',
                ...deviceHeaders()
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

    // refreshToken нужен серверу, чтобы удалить именно эту сессию: без него
    // выход оставлял «призрак» в списке устройств и занимал слот лимита.
    logout(token, refreshToken) {
        return request('POST', '/api/auth/logout', refreshToken ? { refreshToken } : null, token)
    },

    // После входа через системный браузер сессию создал запрос браузера —
    // сообщаем серверу, что это приложение (и какое устройство).
    identifyDevice(token, refreshToken) {
        return request('POST', '/api/auth/device', { refreshToken }, token)
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

    syncPush(token, messengers, folders, settings, workspaces = []) {
        return request(
            'POST',
            '/api/sync',
            { messengers, folders, workspaces, settings },
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

    // FEATURE (2026-09-17, live request — "Даже галка нужна - может
    // добавлять свои или нет"): reused just to read this member's own
    // canAddOwnMessengers flag (see org-team.js's syncMemberPermission) —
    // GET /:orgId/members is already MEMBER-permitted server-side, no new
    // route needed.
    orgGetMembers(token, orgId) {
        return request('GET', `/api/org/${orgId}/members`, null, token)
    },

    orgPushMessengerStats(token, orgId, stats) {
        return request('POST', `/api/org/${orgId}/messenger-stats`, { stats }, token)
    },

    orgGetQuickReplies(token, orgId) {
        return request('GET', `/api/org/${encodeURIComponent(orgId)}/quick-replies`, null, token)
    },

    // Задачи сотрудникам (TEAM, 2026-10-01).
    orgGetTasks(token, orgId) {
        return request('GET', `/api/org/${encodeURIComponent(orgId)}/tasks`, null, token)
    },
    orgCreateTask(token, orgId, task) {
        return request('POST', `/api/org/${encodeURIComponent(orgId)}/tasks`, task, token)
    },
    orgUpdateTask(token, orgId, taskId, patch) {
        return request('PATCH', `/api/org/${encodeURIComponent(orgId)}/tasks/${encodeURIComponent(taskId)}`, patch, token)
    },
    orgGetMyStructure(token, orgId) {
        return request('GET', `/api/org/${encodeURIComponent(orgId)}/my-structure`, null, token)
    },
    orgGetTaskComments(token, orgId, taskId) {
        return request('GET', `/api/org/${encodeURIComponent(orgId)}/tasks/${encodeURIComponent(taskId)}/comments`, null, token)
    },
    orgAddTaskComment(token, orgId, taskId, body) {
        return request('POST', `/api/org/${encodeURIComponent(orgId)}/tasks/${encodeURIComponent(taskId)}/comments`, { body }, token)
    },
    orgMarkTasksSeen(token, orgId) {
        return request('POST', `/api/org/${encodeURIComponent(orgId)}/tasks/seen`, {}, token)
    },

    // OWNER/ADMIN only server-side — "Клиент ждёт ответа" alerts created
    // after `afterIso`, for the "В приложение Centrio" delivery channel.
    orgGetAlerts(token, orgId, afterIso) {
        return request('GET', `/api/org/${encodeURIComponent(orgId)}/alerts?after=${encodeURIComponent(afterIso)}`, null, token)
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
    },

    // FEATURE (2026-09-21, "для PRO поддержка и тикеты доступны прямо из
    // приложения. Синхронизируются с ЛК. Даже старые" — live user request):
    // the API side (src/routes/tickets.js) already existed for the website's
    // own dashboard — same auth, same Ticket/TicketMessage rows, so tickets
    // created on centrio.me show up here automatically and vice versa,
    // with no separate sync step needed. Pro-gating happens in the
    // renderer UI (same posture as every other Pro feature here), not the
    // API — the endpoints themselves are auth-only, matching the website.
    ticketsList(token) {
        return request('GET', '/api/tickets', null, token)
    },

    ticketsGet(token, id) {
        return request('GET', `/api/tickets/${id}`, null, token)
    },

    ticketsCreate(token, subject, body) {
        return request('POST', '/api/tickets', { subject, body }, token)
    },

    ticketsReply(token, id, body) {
        return request('POST', `/api/tickets/${id}/messages`, { body }, token)
    },

    // FEATURE (2026-09-21, "для PRO-пользователя, у которого уже привязана
    // карта, можно продлевать прямо в приложении в один клик" — live user
    // idea, approved for 2.9).
    paymentsAutoRenewStatus(token) {
        return request('GET', '/api/payments/auto-renew', null, token)
    },

    paymentsRenewNow(token) {
        return request('POST', '/api/payments/renew-now', null, token)
    },

    // FEATURE (2026-09-11, custom widget logo). File upload doesn't fit the
    // JSON-only request() helper above (multipart body) — uses the global
    // fetch/FormData/Blob Electron's bundled Node already provides, same as
    // every other HTTP call in this file just via a different transport.
    async chatSiteUploadLogo(token, siteId, fileBuffer, fileName, mimeType) {
        const form = new FormData()
        form.append('logo', new Blob([fileBuffer], { type: mimeType || 'application/octet-stream' }), fileName || 'logo.png')
        const res = await fetch(`${API_URL}/api/chat-sites/${siteId}/logo`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` },
            body: form
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) throw createHttpError(res.status, data)
        return { status: res.status, data }
    },

    chatSiteDeleteLogo(token, siteId) {
        return request('DELETE', `/api/chat-sites/${siteId}/logo`, null, token)
    }
}