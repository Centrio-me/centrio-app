// Where reading starts when a chat with unread messages is opened (3.8.3): the first of the last `unread` incoming
// messages, like Telegram and MAX open a chat (Oleg, 2026-11-12). Own messages and day marks do not count.

/**
 * @param {{ type: string, id?: string, out?: boolean }[]} rows the conversation, oldest first
 * @param {number} unread how many messages the list said were unread
 * @returns {string} the id of the first unread message, '' when there is none
 */
function firstUnreadId(rows, unread) {
    const count = Math.max(0, Number(unread) || 0)
    if (!count) return ''
    const incoming = (rows || []).filter((r) => r && r.type === 'msg' && !r.out && r.id)
    if (!incoming.length) return ''
    return String(incoming[Math.max(0, incoming.length - count)].id)
}

module.exports = { firstUnreadId }
