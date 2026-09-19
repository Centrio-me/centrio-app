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
    applyTheme,
    addOrgAssignedMessenger,
    removeOrgAssignedMessenger,
    refreshAllVpnBadges = () => {}, // (active) => void — keeps the sidebar VPN badges/state.vpnActive in sync, see renderer.js
    setCanAddOwnMessengers = () => {} // (allowed: boolean) => void — gates the "+" add-messenger button, see renderer.js/add-modal-bind.js
}) {
    const POLL_INTERVAL_MS = 5 * 60 * 1000
    let pollTimer = null
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
            if (forced && typeof forced.theme === 'string' && forced.theme !== lastForcedTheme) {
                lastForcedTheme = forced.theme
                applyTheme(forced.theme)
            }
        } catch {}
    }

    async function syncAssignments(orgId) {
        try {
            const result = await authorizedInvoke('api-org-get-messenger-assignments', orgId)
            const assignments = unwrap(result)
            if (!Array.isArray(assignments)) return

            const serverIds = new Set()
            for (const a of assignments) {
                const id = `org:${a.id}`
                serverIds.add(id)
                await addOrgAssignedMessenger({
                    id,
                    name: a.name,
                    url: a.url,
                    icon: a.icon || null,
                    color: a.color || null
                })
            }

            // Clean up locally injected slots for assignments the owner has
            // since removed/reassigned elsewhere.
            const toRemove = state.activeMessengers
                .filter(m => m.orgAssigned && !serverIds.has(m.id))
                .map(m => m.id)
            toRemove.forEach(removeOrgAssignedMessenger)
        } catch {}
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

    function buildStatsPayload() {
        return state.activeMessengers.map(m => {
            const unreadCount = state.unreadCounts[m.id] || 0
            return {
                messengerKey: m.orgAssigned ? m.id.replace(/^org:/, '') : m.id,
                messengerName: m.name,
                unreadCount,
                lastReadAt: unreadCount === 0 ? new Date().toISOString() : undefined,
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

    async function tick() {
        const orgId = getOrgId()
        if (!orgId) return
        await Promise.allSettled([
            syncForcedSettings(orgId),
            syncAssignments(orgId),
            syncMemberPermission(orgId),
            syncSharedVpn(orgId),
            pushStats(orgId)
        ])
    }

    function start() {
        if (pollTimer) return
        tick()

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
        pollTimer = null
    }

    return { start, stop, tick }
}

module.exports = { createOrgTeamApi }
