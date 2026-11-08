// The team live stream on the desktop (TEAM control, 2026-11-08). The main process keeps one
// connection to /api/org/:orgId/events, forwards each event to the window as 'team-event', and
// reconnects with backoff. After a reconnect it sends {type:'reconnected'} so the app resyncs fully;
// when the token is no longer accepted it sends {type:'auth-expired'} and the app starts it again.
const { API_URL } = require('../config/constants')
const { parseSse, nextDelay } = require('./teamEventsParse')

let active = null // { orgId, token, controller, attempt, stopped }

function send(getMainWindow, evt) {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) win.webContents.send('team-event', evt)
}

async function connect(conn, getMainWindow) {
    while (!conn.stopped) {
        conn.controller = new AbortController()
        try {
            const res = await fetch(`${API_URL}/api/org/${encodeURIComponent(conn.orgId)}/events`, {
                headers: { Authorization: `Bearer ${conn.token}`, Accept: 'text/event-stream' },
                signal: conn.controller.signal
            })
            const status = res.status
            if (status === 401 || status === 403) {
                conn.onFirst?.({ success: false, code: status === 401 ? 'unauthorized' : 'forbidden', status })
                conn.onFirst = null
                if (!conn.firstDone) { conn.stopped = true; return }
                send(getMainWindow, { type: status === 401 ? 'auth-expired' : 'membership-lost', data: {} })
                conn.stopped = true
                return
            }
            if (!res.ok || !res.body) throw new Error(`HTTP ${status}`)
            conn.onFirst?.({ success: true })
            conn.onFirst = null
            if (conn.firstDone) send(getMainWindow, { type: 'reconnected', data: {} })
            conn.firstDone = true
            conn.attempt = 0

            const reader = res.body.getReader()
            const decoder = new TextDecoder()
            let carry = ''
            while (!conn.stopped) {
                const { value, done } = await reader.read()
                if (done) break
                const parsed = parseSse(decoder.decode(value, { stream: true }), carry)
                carry = parsed.carry
                for (const evt of parsed.events) send(getMainWindow, evt)
            }
        } catch (error) {
            if (conn.stopped) return
            if (conn.onFirst) {
                // the first attempt failed for a network reason: report success-less but keep trying
                conn.onFirst({ success: false, code: 'network', error: error.message })
                conn.onFirst = null
            }
        }
        if (conn.stopped) return
        await new Promise((resolve) => setTimeout(resolve, nextDelay(conn.attempt++)))
    }
}

function stop() {
    if (!active) return
    active.stopped = true
    try { active.controller?.abort() } catch { /* already closed */ }
    active = null
}

// Resolves after the first answer from the server, so an expired token is refreshed by the caller.
function start({ token, orgId, getMainWindow }) {
    if (active && active.orgId === orgId && active.token === token && !active.stopped) return Promise.resolve({ success: true })
    stop()
    const conn = { orgId, token, controller: null, attempt: 0, stopped: false, firstDone: false, onFirst: null }
    active = conn
    return new Promise((resolve) => {
        conn.onFirst = resolve
        connect(conn, getMainWindow)
    })
}

module.exports = { start, stop }
