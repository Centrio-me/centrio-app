// Server-Sent Events stream of one team's live events for one viewer (TEAM control, 2026-11-08).
const { subscribeOrg, visibleTo } = require('./team-events')

const PING_MS = 25 * 1000

function writeEvent(res, evt) {
    res.write(`event: ${evt.type}\ndata: ${JSON.stringify(evt.data || {})}\n\n`)
}

// findMember(): resolves the viewer's current membership; used to end the stream once he is removed.
function streamOrgEvents(req, res, { orgId, viewer, findMember }) {
    res.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
    })
    res.flushHeaders?.()
    res.write(': connected\n\n')

    let closed = false
    let ping = null
    let unsubscribe = () => {}
    const close = () => {
        if (closed) return
        closed = true
        clearInterval(ping)
        unsubscribe()
        res.end()
    }

    unsubscribe = subscribeOrg(orgId, (evt) => {
        if (closed || !visibleTo(evt, viewer)) return
        writeEvent(res, evt)
        // Removed, or his role changed: end the stream so a reconnect gets the right events (review M5).
        if (evt.type === 'member' && evt.data?.userId === viewer.userId) {
            Promise.resolve(findMember())
                .then((m) => { if (!m || m.status !== 'ACTIVE' || m.role !== viewer.role) close() })
                .catch(() => {})
        }
    })
    ping = setInterval(() => { if (!closed) res.write(': ping\n\n') }, PING_MS)
    ping.unref?.()
    req.on('close', close)
    return close
}

module.exports = { streamOrgEvents }
