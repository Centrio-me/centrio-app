'use strict'
// «Все мессенджеры» (3.8): the chat lists read from every tab (renderer/all-inbox/adapters.js) become one list.
const { parseListTime } = require('../../shared/inbox-time')

const MAX_TITLE = 120
const MAX_PREVIEW = 200

/**
 * @param {{ messenger: { id: string, name: string, icon?: string }, chats: object[] }[]} sources
 * @param {number} now ms
 * @param {{ unreadOnly?: boolean, query?: string, messengerId?: string }} [filter]
 */
function mergeInbox(sources, now, filter = {}) {
    const seen = new Set()
    const list = []
    for (const source of sources || []) {
        const m = source && source.messenger
        if (!m || !m.id) continue
        for (const chat of source.chats || []) {
            if (!chat || typeof chat.title !== 'string' || !chat.title.trim()) continue
            const key = String(chat.key || chat.title)
            const id = `${m.id}::${key}`
            if (seen.has(id)) continue
            seen.add(id)
            const unread = Math.max(0, parseInt(chat.unread, 10) || 0)
            list.push({
                id,
                key,
                messengerId: m.id,
                messengerName: m.name || '',
                messengerIcon: m.icon || '',
                title: chat.title.trim().slice(0, MAX_TITLE),
                preview: String(chat.preview || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW),
                timeLabel: String(chat.time || '').trim(),
                at: parseListTime(chat.time, now),
                unread,
                muted: chat.muted === true,
                avatar: typeof chat.avatar === 'string' ? chat.avatar : ''
            })
        }
    }
    const query = String(filter.query || '').trim().toLowerCase()
    return list
        .filter((c) => !filter.unreadOnly || c.unread > 0)
        .filter((c) => !filter.messengerId || c.messengerId === filter.messengerId)
        .filter((c) => !query || c.title.toLowerCase().includes(query) || c.preview.toLowerCase().includes(query))
        .sort((a, b) => b.at - a.at)
}

module.exports = { mergeInbox }
