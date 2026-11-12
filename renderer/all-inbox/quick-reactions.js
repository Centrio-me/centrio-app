// A reaction shows the moment it is pressed, the way the messengers themselves do it (3.8.3, owner 2026-11-12:
// «реакция не появляется сразу»). The pressed state stands over the conversation until the messenger's own data says
// the same thing, or for ten seconds at most. One reaction per person, as in Telegram, MAX and WhatsApp.
const SETTLE_MS = 10 * 1000

const count = (r) => Math.max(0, parseInt(r && r.n, 10) || 0)

/** The reactions after pressing `emoji`: yours added (your earlier one goes), or taken off when it was this one. */
function toggleReaction(list, emoji) {
    const before = Array.isArray(list) ? list : []
    const wasMine = before.some((r) => r.mine && r.e === emoji)
    const next = []
    for (const r of before) {
        if (r.mine) {
            const left = count(r) - 1
            if (left > 0) next.push({ ...r, n: String(left), mine: false })
            continue
        }
        next.push({ ...r })
    }
    if (wasMine) return next
    const same = next.findIndex((r) => r.e === emoji)
    if (same >= 0) next[same] = { ...next[same], n: String(count(next[same]) + 1), mine: true }
    else next.push({ e: emoji, n: '1', mine: true })
    return next
}

/** The messenger's data has caught up: your reaction there is `mine` ('' = none). MAX gives pictures, not emoji. */
function settles(real, mine) {
    const yours = (Array.isArray(real) ? real : []).filter((r) => r.mine)
    if (!mine) return yours.length === 0
    return yours.some((r) => r.e === mine || (!r.e && r.img))
}

/**
 * Rows with the pressed reactions over them; entries that settled or grew old are dropped from `pending`.
 * @param {object[]} rows the conversation
 * @param {Map<string, { list: object[], mine: string, at: number }>} pending
 */
function overlayReactions(rows, pending, now = Date.now()) {
    if (!pending.size) return rows
    return rows.map((r) => {
        const p = r && r.type === 'msg' ? pending.get(r.id) : null
        if (!p) return r
        if (settles(r.reactions, p.mine) || now - p.at > SETTLE_MS) { pending.delete(r.id); return r }
        return { ...r, reactions: p.list }
    })
}

module.exports = { toggleReaction, settles, overlayReactions, SETTLE_MS }
