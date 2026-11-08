// Presence of team members and the live board rows (TEAM control, 2026-11-08).
// A beat says only: the app is open, how long the computer has been idle, which TEAM messenger is
// in front and how many unread the team messengers have. Never anything from inside a chat.

const OFFLINE_AFTER_SEC = 90
const AWAY_AFTER_IDLE_SEC = 300
const BEAT_MINUTES = 0.5

function statusFor(beat, now, inHours) {
    const fresh = beat && beat.open && (now - new Date(beat.at)) / 1000 <= OFFLINE_AFTER_SEC
    const working = fresh && beat.idleSec < AWAY_AFTER_IDLE_SEC
    if (working) return 'working'
    if (!inHours) return 'off_hours'
    if (!fresh) return 'offline'
    return 'away'
}

// The device the person is actually at: open, least idle, newest.
function pickPersonBeat(beats) {
    if (!beats || beats.length === 0) return null
    return [...beats].sort((a, b) =>
        (Number(b.open) - Number(a.open)) ||
        (a.idleSec - b.idleSec) ||
        (new Date(b.at) - new Date(a.at))
    )[0]
}

function activeMinutesOf(beat) {
    return beat.open && beat.idleSec < AWAY_AFTER_IDLE_SEC ? BEAT_MINUTES : 0
}

// Body of POST /:orgId/presence, narrowed to this person's team messengers.
function parseBeat(body, assignedIds) {
    const unread = body && typeof body.unread === 'object' && body.unread ? body.unread : {}
    let unreadTotal = 0
    for (const [id, n] of Object.entries(unread)) {
        if (assignedIds.has(id) && Number.isFinite(n) && n > 0) unreadTotal += Math.trunc(n)
    }
    const front = typeof body?.frontAssignmentId === 'string' && assignedIds.has(body.frontAssignmentId) ? body.frontAssignmentId : null
    const idle = Number(body?.idleSec)
    return {
        open: body?.open !== false,
        idleSec: Number.isFinite(idle) ? Math.min(Math.max(0, Math.trunc(idle)), 7 * 24 * 3600) : 0,
        frontAssignmentId: front,
        unreadTotal,
        deviceKeyId: typeof body?.deviceKeyId === 'string' ? body.deviceKeyId.slice(0, 64) : null
    }
}

function sinceFor(status, beat, daily, now) {
    if (status === 'working') return daily?.firstAt || beat?.at || null
    if (status === 'away') return new Date(now.getTime() - beat.idleSec * 1000)
    if (status === 'offline') return beat?.at || null
    return null
}

function buildLivePerson({ member, beats, stats, assignments, daily, now, inHours }) {
    const active = new Map(assignments.filter((a) => !a.paused).map((a) => [a.id, a]))
    const liveStats = stats.filter((s) => active.has(s.messengerKey))
    const beat = pickPersonBeat(beats)
    const status = statusFor(beat, now, inHours)

    let longestWait = null
    let waitingCount = 0
    for (const s of liveStats) {
        if (s.unreadCount > 0 && s.waitingSince) {
            waitingCount++
            const minutes = Math.floor((now - new Date(s.waitingSince)) / 60000)
            if (!longestWait || minutes > longestWait.minutes) {
                longestWait = { assignmentName: active.get(s.messengerKey).name, minutes }
            }
        }
    }

    const front = beat && beat.frontAssignmentId ? active.get(beat.frontAssignmentId) : null
    return {
        userId: member.userId,
        name: member.name,
        status,
        sinceAt: sinceFor(status, beat, daily, now),
        frontName: status === 'working' || status === 'away' ? (front ? front.name : null) : null,
        unreadTotal: liveStats.reduce((sum, s) => sum + (s.unreadCount || 0), 0),
        waitingCount,
        longestWait,
        signInProblems: liveStats.filter((s) => s.loginState === 'out').length,
        devices: new Set(beats.filter((b) => b.open).map((b) => b.deviceKeyId || 'unknown')).size,
        activeMinToday: daily ? Math.round(daily.activeMin) : 0,
        messengers: assignments.map((a) => {
            const s = a.paused ? null : liveStats.find((x) => x.messengerKey === a.id)
            return {
                id: a.id,
                name: a.name,
                paused: !!a.paused,
                unread: s ? s.unreadCount : 0,
                waitingMin: s && s.unreadCount > 0 && s.waitingSince ? Math.floor((now - new Date(s.waitingSince)) / 60000) : null,
                loginState: s ? s.loginState || null : null
            }
        })
    }
}

function summarizeLive(people) {
    return {
        onShift: people.filter((p) => p.status === 'working' || p.status === 'away').length,
        waitingNow: people.reduce((sum, p) => sum + (p.waitingCount || 0), 0),
        longestWaitMin: people.reduce((max, p) => Math.max(max, p.longestWait ? p.longestWait.minutes : 0), 0)
    }
}

module.exports = { statusFor, pickPersonBeat, activeMinutesOf, parseBeat, buildLivePerson, summarizeLive, OFFLINE_AFTER_SEC }
