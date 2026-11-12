'use strict'
// «Все мессенджеры» (3.8): the chat lists read from every tab (renderer/all-inbox/adapters.js) become one list.
const { parseListTime, formatListTime } = require('../../shared/inbox-time')

const MAX_TITLE = 120
const MAX_PREVIEW = 200
const KNOWN_ICONS = new Set(['saved'])
const KINDS = new Set(['user', 'bot', 'saved', 'group', 'channel'])
const OUT_STATES = new Set(['sent', 'read'])
const ACCOUNT_TONES = 4
// list filters by the kind of chat
const KIND_FILTERS = {
    personal: new Set(['user', 'bot', 'saved']),
    groups: new Set(['group']),
    channels: new Set(['channel'])
}

/**
 * @param {{ messenger: { id: string, name: string, icon?: string }, chats: object[] }[]} sources
 * @param {number} now ms
 * @param {{ unreadOnly?: boolean, query?: string, messengerId?: string, kind?: 'personal'|'groups'|'channels', chatIds?: Set<string> }} [filter]
 */
function mergeInbox(sources, now, filter = {}) {
    const seen = new Set()
    const list = []
    // two Telegram tabs (work and personal): their chats carry the tab's name so they can be told apart
    const perService = {}
    const accountIndex = {}
    for (const source of sources || []) {
        const m = source && source.messenger
        if (!m || !m.service) continue
        accountIndex[m.id] = perService[m.service] || 0
        perService[m.service] = (perService[m.service] || 0) + 1
    }
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
                // an exact time from the messenger (Telegram's own data) wins over the label read off the page
                timeLabel: Number(chat.at) > 0 ? formatListTime(Number(chat.at), now) : String(chat.time || '').trim(),
                at: Number(chat.at) > 0 ? Number(chat.at) : parseListTime(chat.time, now),
                unread,
                muted: chat.muted === true,
                avatar: typeof chat.avatar === 'string' ? chat.avatar : '',
                // a chat drawn with an icon of its own instead of an avatar («Избранное»)
                icon: KNOWN_ICONS.has(chat.icon) ? chat.icon : '',
                kind: KINDS.has(chat.kind) ? chat.kind : '',
                pinned: chat.pinned === true,
                online: chat.online === true,
                outState: OUT_STATES.has(chat.outState) ? chat.outState : '',
                members: Math.max(0, parseInt(chat.members, 10) || 0),
                // a message typed and not sent, kept by the messenger (shown as «Черновик:» like in Telegram)
                draft: typeof chat.draft === 'string' ? chat.draft.replace(/\s+/g, ' ').trim().slice(0, MAX_PREVIEW) : '',
                mentions: Math.max(0, parseInt(chat.mentions, 10) || 0),
                // «печатает», «записывает голосовое»… while it lasts
                typing: typeof chat.typing === 'string' ? chat.typing.trim().slice(0, 40) : '',
                accountLabel: m.service && perService[m.service] > 1 ? (m.name || '') : '',
                // the same colour marks the account on its chats and on its button above the list
                accountTone: m.service && perService[m.service] > 1 ? accountIndex[m.id] % ACCOUNT_TONES : -1
            })
        }
    }
    const query = String(filter.query || '').trim().toLowerCase()
    const kinds = KIND_FILTERS[filter.kind]
    return list
        .filter((c) => !filter.unreadOnly || c.unread > 0)
        .filter((c) => !filter.messengerId || c.messengerId === filter.messengerId)
        .filter((c) => !kinds || kinds.has(c.kind))
        // an own folder (3.8.3, folders.js): only its chats
        .filter((c) => !filter.chatIds || filter.chatIds.has(c.id))
        .filter((c) => !query || c.title.toLowerCase().includes(query) || c.preview.toLowerCase().includes(query))
        .map((c) => {
            const start = query ? c.title.toLowerCase().indexOf(query) : -1
            return start >= 0 ? { ...c, match: { start, length: query.length } } : c
        })
        // pinned chats first, as in the messengers themselves
        .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.at - a.at))
}

module.exports = { mergeInbox, ACCOUNT_TONES }
