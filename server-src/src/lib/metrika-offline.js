// Registrations as real conversions in Yandex Metrica (2026-11-08), so Direct learns on sign-ups, not on clicks.
// The website keeps the visitor's Metrica client id with the ad note (lib/ad-touch.js); a sign-up matched to that
// note carries it in User.signupSource; this sends each such sign-up once as goal "signup" via offline conversions.
const GOAL_ID = 'signup'

function cleanClientId(value) {
    const v = typeof value === 'string' ? value.trim() : ''
    return /^\d{6,30}$/.test(v) ? v : null
}

function cleanYclid(value) {
    const v = typeof value === 'string' ? value.trim() : ''
    return /^\d{6,30}$/.test(v) ? v : null
}

function parseSource(raw) {
    try { return JSON.parse(raw) } catch { return null }
}

// users: [{ id, createdAt, signupSource }] → [{ userId, clientId, at }]
function pendingSignups(users) {
    const out = []
    for (const u of users) {
        const src = parseSource(u.signupSource)
        if (!src || src.offlineSentAt) continue
        const clientId = cleanClientId(src.ymClientId)
        if (!clientId) continue
        out.push({ userId: u.id, clientId, at: new Date(u.createdAt) })
    }
    return out
}

function buildUploadCsv(rows, goal = GOAL_ID) {
    return 'ClientId,Target,DateTime\n' + rows.map((r) => `${r.clientId},${goal},${Math.floor(r.at.getTime() / 1000)}`).join('\n') + '\n'
}

module.exports = { GOAL_ID, cleanClientId, cleanYclid, pendingSignups, buildUploadCsv, parseSource }
