// FEATURE (2026-09-10, TEAM owner-control epic). Wires the desktop app up
// to the server-side org endpoints added the same day (see
// landing/org-routes.js: GET .../vpn, .../settings, .../messenger-assignments,
// POST .../messenger-stats). The desktop app only ever READS the first
// three — the owner manages them from the website's team dashboard — and
// only ever WRITEs read-status stats (counts/timestamps, never message
// content, per "Только статус — прочитано или нет. Статистику понимать.").
//
// v1 scope note: forced settings currently only applies `theme` (the
// highest-value, lowest-risk field to push live) — forcedSettingsJson on
// the server already accepts arbitrary keys, so extending coverage later is
// additive, not a schema change.
function createOrgTeamApi({
    authorizedInvoke,
    invokeIpc,
    cloudStore,
    state,
    store,
    applyTheme,
    addOrgAssignedMessenger,
    removeOrgAssignedMessenger,
    refreshAllVpnBadges = () => {}, // (active) => void — keeps the sidebar VPN badges/state.vpnActive in sync, see renderer.js
    setCanAddOwnMessengers = () => {}, // (allowed: boolean) => void — gates the "+" add-messenger button, see renderer.js/add-modal-bind.js
    setTeamQuickReplies = () => {}, // (replies) => void — renderer/quick-replies-bind.js
    applyOrgStructure = () => {}, // ({ workspaces, folders }) => void — owner-managed workspaces/folders, see renderer.js
    refreshTeamTasks = () => {}, // () => Promise — renderer/team-tasks.js, polled every TASKS_POLL_MS
    notifyOwnerAlert = () => {}, // ({ title, body }) => void — OS notification + bell entry for the owner/admin
    tGet = () => ''
}) {
    const POLL_INTERVAL_MS = 2 * 60 * 1000
    // "Клиент ждёт ответа" (2026-09-30): the server stamps how long an
    // assigned messenger has had unread messages, so it needs fresh data —
    // pushed shortly after every unread change, plus a heartbeat so the owner
    // can tell a closed app from "all quiet".
    const STATS_PUSH_DEBOUNCE_MS = 15 * 1000
    const STATS_HEARTBEAT_MS = 2 * 60 * 1000
    const ALERTS_POLL_MS = 60 * 1000
    const TASKS_POLL_MS = 45 * 1000
    const ALERTS_SEEN_KEY = 'centrio-org-alerts-seen-at'
    let pollTimer = null
    let statsHeartbeatTimer = null
    let alertsTimer = null
    let loginRemindTimer = null
    let tasksTimer = null
    let statsPushTimer = null
    const reportedMessengerIds = new Set()
    let lastForcedTheme = null

    function getOrgId() {
        return cloudStore.getUser()?.orgSummary?.orgId || null
    }

    // BUGFIX (2026-09-11, same root cause as renderer/chat-widget-pane.js's
    // "data-token=undefined" bug — see the detailed comment there):
    // main/ipc/api.js's wrapApi() wraps the raw HTTP body as
    // `{success, data: <body>}`; landing/org-routes.js's own responses are
    // ALSO `{success, data}`, so a successful call through authorizedInvoke
    // resolves to `{success:true, data:{success:true, data:<real payload>}}`
    // — one level deeper than every read below originally assumed. These
    // reads silently no-op'd since the first release of this feature.
    function unwrap(result) {
        return result?.success && result.data?.success ? result.data.data : undefined
    }

    async function syncForcedSettings(orgId) {
        try {
            const result = await authorizedInvoke('api-org-get-settings', orgId)
            const forced = unwrap(result)
            const theme = forced && typeof forced.theme === 'string' ? forced.theme : null
            if (theme === lastForcedTheme) return
            lastForcedTheme = theme

            // BUGFIX (2026-09-30, "тема не меняет если с главного акка меняю"):
            // state.orgForcedTheme is the actual enforcement mechanism now —
            // settings-ui.js's applyTheme() checks it and overrides ANY theme
            // it's asked to apply while it's set (see that file's big comment).
            // Set it BEFORE calling applyTheme() below so this call and every
            // other applyTheme()/applySettings() call anywhere in the app
            // (initSettings, cloud-sync boot data, Pro-lock reapplication)
            // consistently respects it from this point on, not just this one
            // call. When the owner turns the forced theme off (theme is now
            // null), fall back to the member's own personal theme instead of
            // some hardcoded default.
            state.orgForcedTheme = theme
            const fallback = (store && store.get('settings', {})?.theme) || 'embedded'
            applyTheme(theme || fallback)
        } catch {}
    }

    // Workspaces and folders the owner built for THIS employee. Managers see
    // every assignment but arrange them themselves, so they skip this.
    async function syncStructure(orgId) {
        if (isOrgManager()) return
        try {
            const raw = await authorizedInvoke('api-org-get-my-structure', orgId)
            const structure = unwrap(raw)
            if (structure && Array.isArray(structure.folders) && Array.isArray(structure.workspaces)) applyOrgStructure(structure)
            else window.__centrioSync?.report('team', false, { code: (raw && (raw.code || raw.status)) || 'bad_response', message: (raw && raw.error) || 'structure' })
        } catch (error) {
            window.__centrioSync?.report('team', false, { code: 'error', message: error && error.message })
        }
    }

    async function syncAssignments(orgId) {
        try {
            await syncStructure(orgId)
            const result = await authorizedInvoke('api-org-get-messenger-assignments', orgId)
            const assignments = unwrap(result)
            if (!Array.isArray(assignments)) {
                window.__centrioSync?.report('team', false, { code: (result && (result.code || result.status)) || 'bad_response', message: (result && result.error) || 'assignments' })
                return
            }
            window.__centrioSync?.report('team', true, { detail: assignments.length })

            const serverIds = new Set()
            for (const a of assignments) {
                const id = `org:${a.id}`
                serverIds.add(id)
                await addOrgAssignedMessenger({
                    id,
                    name: a.name,
                    url: a.url,
                    icon: a.icon || null,
                    color: a.color || null,
                    managedFolderId: a.folderId || null,
                    // a saved login+password exists for this messenger (never the secret itself)
                    credentialAvailable: a.credentialAvailable === true,
                    // Owner decides whether this messenger must work through the VPN.
                    useVpn: a.useVpn !== false
                })
            }

            // Clean up locally injected slots for assignments the owner has
            // since removed/reassigned elsewhere.
            const toRemove = state.activeMessengers
                .filter(m => m.orgAssigned && !serverIds.has(m.id))
                .map(m => m.id)
            toRemove.forEach(removeOrgAssignedMessenger)
        } catch (error) {
            window.__centrioSync?.report('team', false, { code: 'error', message: error && error.message })
        }
    }

    // Fetches the org's shared VPN once and, if present, connects to it the
    // same two-step protocol renderer/vpn-bind.js's own connectSaved() uses
    // (vpn-connect-saved, falling back to vpn-download-and-connect if the
    // config isn't cached locally yet) — called directly via the same
    // invokeIpc used everywhere else, rather than reaching into vpn-bind.js
    // (a file already flagged elsewhere as historically fragile — safer to
    // duplicate two IPC calls than to touch it). Only auto-connects if no
    // VPN is currently active, so it never interrupts a member who's
    // already connected to something (their own personal VPN, or this same
    // team VPN from a prior poll).
    // FEATURE (2026-09-17, live request — "Даже галка нужна - может
    // добавлять свои или нет"): reads THIS member's own
    // canAddOwnMessengers flag off the org's member list (GET .../members
    // is MEMBER-permitted server-side already) and gates the desktop app's
    // "+" add-messenger button accordingly. Defaults to allowed (true) if
    // the record can't be found — a transient read failure should never
    // silently lock someone out of their own app.
    async function syncMemberPermission(orgId) {
        try {
            const userId = cloudStore.getUser()?.id
            if (!userId) return
            const result = await authorizedInvoke('api-org-get-members', orgId)
            const list = unwrap(result)
            if (!Array.isArray(list)) return
            const self = list.find(m => m.userId === userId)
            setCanAddOwnMessengers(self ? self.canAddOwnMessengers !== false : true)
        } catch {}
    }

    async function syncSharedVpn(orgId) {
        if (state.vpnActive) return
        try {
            const result = await authorizedInvoke('api-org-get-vpn', orgId)
            const vpnData = unwrap(result)
            if (!vpnData?.link) return
            const link = vpnData.link
            let connectResult = await invokeIpc('vpn-connect-saved', link)
            if (connectResult?.needsDownload) {
                connectResult = await invokeIpc('vpn-download-and-connect', link)
            }
            if (connectResult?.success) await refreshAllVpnBadges(true)
        } catch {}
    }

    // BUGFIX (2026-09-28, live report: TEAM owner's unread/engagement
    // numbers didn't match reality): this used to map over EVERY active
    // messenger, personal ones included, and push their unread counts to
    // the org — an employee's own WhatsApp/Telegram unread count silently
    // counted into the org's totals and was visible to the owner/admin.
    // Only org-assigned messengers should ever be reported here. The
    // backend (POST /:orgId/messenger-stats) now also validates messengerKey
    // against real assignments server-side, but filtering here too means we
    // stop sending private data over the wire at all, not just storing it.
    // Raw (not mute-adjusted) count: an employee muting an assigned messenger
    // must not hide waiting clients from the owner — state.unreadCounts is 0
    // for muted messengers by design (renderer/unread.js).
    // Only messengers whose page has actually reported a count this session:
    // right after launch a not-yet-loaded webview reads as 0, and pushing
    // that would make the server reset how long a client has been waiting.
    function buildStatsPayload() {
        return state.activeMessengers.filter(m => m.orgAssigned && (reportedMessengerIds.has(m.id) || state.loginStates?.[m.id])).map(m => {
            const unreadCount = Math.max(0, Number(state.rawUnreadCounts?.[m.id] ?? state.unreadCounts[m.id]) || 0)
            return {
                messengerKey: m.id.replace(/^org:/, ''),
                messengerName: m.name,
                unreadCount,
                loginState: state.loginStates?.[m.id],
                // Not signed in: nothing loaded, so "0 unread" must not be reported as "read".
                lastReadAt: unreadCount === 0 && state.loginStates?.[m.id] !== 'out' ? new Date().toISOString() : undefined,
                lastMessageAt: unreadCount > 0 ? new Date().toISOString() : undefined
            }
        })
    }

    async function pushStats(orgId) {
        const stats = buildStatsPayload()
        if (stats.length === 0) return
        try {
            await authorizedInvoke('api-org-push-messenger-stats', orgId, stats)
        } catch {}
    }

    async function syncQuickReplies(orgId) {
        try {
            const result = await authorizedInvoke('api-org-get-quick-replies', orgId)
            const replies = unwrap(result)
            if (Array.isArray(replies)) setTeamQuickReplies(replies)
        } catch {}
    }

    function schedulePushStats() {
        clearTimeout(statsPushTimer)
        statsPushTimer = setTimeout(() => {
            const orgId = getOrgId()
            if (orgId) pushStats(orgId)
        }, STATS_PUSH_DEBOUNCE_MS)
    }

    function onUnreadChanged(e) {
        const id = e?.detail?.messengerId
        if (id) reportedMessengerIds.add(id)
        const messenger = id && state.activeMessengers.find(m => m.id === id)
        if (messenger?.orgAssigned) schedulePushStats()
    }

    // Registered at creation, not in start(): webviews can report their first
    // count before start() runs, and those reports must still be recorded.
    document.addEventListener('unread-count-changed', onUnreadChanged)

    // "Вход в мессенджер" (2026-10-05): the page reports whether the employee is signed in. Pushed to the
    // org right away, and used for the local reminder below.
    const signedOutSince = new Map() // messengerId -> ms timestamp
    const loginRemindedAt = new Map() // messengerId -> { at, count }
    document.addEventListener('login-state-changed', (e) => {
        const id = e?.detail?.messengerId
        const messenger = id && state.activeMessengers.find(m => m.id === id)
        if (!messenger?.orgAssigned) return
        if (e.detail.state === 'out') { if (!signedOutSince.has(id)) signedOutSince.set(id, Date.now()) }
        else { signedOutSince.delete(id); loginRemindedAt.delete(id) }
        schedulePushStats()
    })

    // Reminder for the EMPLOYEE: an assigned messenger that has been signed out for a while. First after 5 min,
    // then once an hour, at most 3 times; resets as soon as they sign in.
    const LOGIN_REMIND_AFTER_MS = 5 * 60 * 1000
    const LOGIN_REMIND_EVERY_MS = 60 * 60 * 1000
    const LOGIN_REMIND_MAX = 3
    function checkLoginReminders() {
        if (isOrgManager()) return
        const now = Date.now()
        for (const [id, since] of signedOutSince) {
            const messenger = state.activeMessengers.find(m => m.id === id && m.orgAssigned)
            if (!messenger) { signedOutSince.delete(id); continue }
            if (now - since < LOGIN_REMIND_AFTER_MS) continue
            const done = loginRemindedAt.get(id) || { at: 0, count: 0 }
            if (done.count >= LOGIN_REMIND_MAX || (done.count > 0 && now - done.at < LOGIN_REMIND_EVERY_MS)) continue
            loginRemindedAt.set(id, { at: now, count: done.count + 1 })
            notifyOwnerAlert({
                title: tGet('orgAlerts.loginTitle') || 'Нужен вход в мессенджер',
                body: (tGet('orgAlerts.loginBody', { name: messenger.name }) || `Войдите в «${messenger.name}»: пока вход не выполнен, сообщения не приходят.`)
            })
        }
    }

    function isOrgManager() {
        const role = cloudStore.getUser()?.orgSummary?.orgRole
        return role === 'OWNER' || role === 'ADMIN'
    }

    function readAlertsSeenAt() {
        try { return localStorage.getItem(ALERTS_SEEN_KEY) } catch { return null }
    }

    function writeAlertsSeenAt(iso) {
        try { localStorage.setItem(ALERTS_SEEN_KEY, iso) } catch {}
    }

    async function pollAlerts() {
        const orgId = getOrgId()
        if (!orgId || !isOrgManager()) return
        // First run on this device: only alerts from now on, never a backlog.
        const seenAt = readAlertsSeenAt() || new Date().toISOString()
        try {
            const result = await authorizedInvoke('api-org-get-alerts', orgId, seenAt)
            const feed = unwrap(result)
            if (!feed || !Array.isArray(feed.items)) return
            const newest = feed.items.reduce((max, a) => (a.createdAt > max ? a.createdAt : max), seenAt)
            writeAlertsSeenAt(newest)
            if (!feed.channelEnabled || feed.items.length === 0) return
            const loginItems = feed.items.filter(a => a.kind === 'login')
            const waitItems = feed.items.filter(a => a.kind !== 'login')
            if (waitItems.length > 0) {
                const lines = waitItems.slice(0, 5).map(a =>
                    `${a.memberName} — ${a.messengerName}: ${formatWaited(a.waitedMinutes)}`)
                if (waitItems.length > 5) lines.push(`+${waitItems.length - 5}`)
                notifyOwnerAlert({ title: tGet('orgAlerts.title') || 'Клиенты ждут ответа', body: lines.join('\n') })
            }
            if (loginItems.length > 0) {
                const lines = loginItems.slice(0, 5).map(a =>
                    `${a.memberName} — ${a.messengerName}: ${tGet('orgAlerts.loginMissing') || 'вход не выполнен'} ${a.waitedMinutes} ${tGet('orgAlerts.minShort') || 'мин'}`)
                if (loginItems.length > 5) lines.push(`+${loginItems.length - 5}`)
                notifyOwnerAlert({ title: tGet('orgAlerts.loginTitle') || 'Нужен вход в мессенджер', body: lines.join('\n') })
            }
        } catch {}
    }

    function formatWaited(minutes) {
        const m = Math.max(1, Number(minutes) || 0)
        const h = Math.floor(m / 60)
        const rest = m % 60
        const duration = m < 60
            ? (tGet('orgAlerts.minutes', { m }) || `${m} мин`)
            : rest
                ? (tGet('orgAlerts.hoursMinutes', { h, m: rest }) || `${h} ч ${rest} мин`)
                : (tGet('orgAlerts.hours', { h }) || `${h} ч`)
        return tGet('orgAlerts.waits', { time: duration }) || `ждёт ${duration}`
    }

    // ── Team password vault (2026-10-05) ───────────────────────────────────────────────────────────────
    // This device registers its PUBLIC key once per account; the matching private key stays in the OS secure
    // storage (main/services/vault.js). When the owner saved a login for an assigned messenger, the encrypted
    // blob for this device is downloaded on demand and decrypted by the main process only.
    const vaultKeyStorage = (orgId) => 'centrio-vault-key-' + orgId
    let vaultRegistering = false

    function readVaultKeyCache(orgId, userId) {
        try {
            const cached = JSON.parse(localStorage.getItem(vaultKeyStorage(orgId)) || 'null')
            return cached && cached.userId === userId && cached.deviceKeyId ? cached.deviceKeyId : null
        } catch { return null }
    }

    async function ensureVaultDeviceKey(orgId) {
        const user = cloudStore.getUser()
        if (!orgId || !user?.id) return null
        const cached = readVaultKeyCache(orgId, user.id)
        if (cached) return cached
        if (vaultRegistering) return null
        vaultRegistering = true
        try {
            const key = await invokeIpc('vault:get-public-key', user.id)
            if (!key?.success) return null
            const registered = unwrap(await authorizedInvoke('api-org-register-device-key', orgId, {
                deviceId: key.deviceId, publicKey: key.publicKey, name: key.name || undefined
            }))
            if (!registered?.id) return null
            try { localStorage.setItem(vaultKeyStorage(orgId), JSON.stringify({ userId: user.id, deviceKeyId: registered.id })) } catch {}
            return registered.id
        } catch { return null } finally { vaultRegistering = false }
    }

    // Resolves with a status only: { success: true } | { success: false, error: CODE }. The password stays in main.
    async function vaultAutoLogin(messengerId) {
        const orgId = getOrgId()
        const user = cloudStore.getUser()
        const messenger = state.activeMessengers.find(m => m.id === messengerId && m.orgAssigned)
        if (!orgId || !user?.id || !messenger) return { success: false, error: 'NO_MESSENGER' }
        const deviceKeyId = await ensureVaultDeviceKey(orgId)
        if (!deviceKeyId) return { success: false, error: 'NO_SECURE_STORAGE' }
        const assignmentId = messenger.id.replace(/^org:/, '')
        const credential = unwrap(await authorizedInvoke('api-org-get-credential', orgId, assignmentId, deviceKeyId))
        if (!credential?.blob) {
            try { localStorage.removeItem(vaultKeyStorage(orgId)) } catch {} // the key may have been replaced: register again next time
            return { success: false, error: 'NOT_SHARED' }
        }
        return invokeIpc('vault:autofill', { userId: user.id, messengerId, blob: credential.blob, aad: credential.aad, assignedUrl: messenger.url })
    }

    async function tick() {
        const orgId = getOrgId()
        if (!orgId) return
        await Promise.allSettled([
            ensureVaultDeviceKey(orgId),
            syncForcedSettings(orgId),
            syncAssignments(orgId),
            syncMemberPermission(orgId),
            syncSharedVpn(orgId),
            syncQuickReplies(orgId),
            pushStats(orgId)
        ])
    }

    function start() {
        if (pollTimer) return
        tick()
        statsHeartbeatTimer = setInterval(() => {
            const orgId = getOrgId()
            if (orgId) pushStats(orgId)
        }, STATS_HEARTBEAT_MS)
        alertsTimer = setInterval(pollAlerts, ALERTS_POLL_MS)
        loginRemindTimer = setInterval(checkLoginReminders, 60 * 1000)
        tasksTimer = setInterval(() => { if (getOrgId()) refreshTeamTasks() }, TASKS_POLL_MS)
        ;[4000, 12000].forEach(ms => setTimeout(() => { if (getOrgId()) refreshTeamTasks() }, ms))
        setTimeout(pollAlerts, 10000)

        // BUGFIX (2026-09-19, live report — "Мессенджеры почему-то через
        // раз загружает в приложении... не открывает даже Макс. Нужно
        // полностью настроить правильно синхронизацию"): orgTeamApi.start()
        // is called very early in renderer.js's boot sequence (before
        // loadData()/cloud-user hydration has necessarily settled), so this
        // very first tick() can lose that race and no-op — getOrgId() reads
        // null, or the assignments request itself fails on a cold
        // connection. Every sync* function above swallows its own errors
        // (by design — a transient sync hiccup must never surface as a user
        // -facing error), so there's no failure signal to react to here,
        // and the ONLY other scheduled attempt used to be POLL_INTERVAL_MS
        // (5 minutes) later — matching "через раз" exactly: whichever
        // restart happened to win that early race synced correctly, the
        // rest didn't, for a full 5 minutes. Every operation tick() runs is
        // idempotent (addOrgAssignedMessenger skips an already-injected
        // slot, syncForcedSettings only reapplies on an actual theme
        // change, etc.), so a few extra calls in quick succession right
        // after start() are cheap and harmless — this just closes that gap
        // instead of leaving it to chance.
        ;[3000, 8000, 15000].forEach(ms => setTimeout(tick, ms))

        pollTimer = setInterval(tick, POLL_INTERVAL_MS)
    }

    function stop() {
        if (pollTimer) clearInterval(pollTimer)
        clearInterval(statsHeartbeatTimer)
        clearInterval(alertsTimer)
        clearInterval(loginRemindTimer)
        clearInterval(tasksTimer)
        clearTimeout(statsPushTimer)
        pollTimer = null
        statsHeartbeatTimer = null
        alertsTimer = null
    }

    return { start, stop, tick, vaultAutoLogin }
}

module.exports = { createOrgTeamApi }
