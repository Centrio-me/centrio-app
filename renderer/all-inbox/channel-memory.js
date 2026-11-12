// Kinds of chats whose list does not say them (MAX, 3.8.2–3.8.3). Oleg, 2026-11-12: «чаты каналы в общей куче»,
// «автофильтр чаты/каналы/группы работает для ТГ и не работает для макса» — MAX draws channels and groups in its list
// like any chat, but the open chat says it under the name: «… подписчиков» for a channel, «… участников» for a group.
// A chat seen once is remembered and stays in «Каналы» or «Группы». Kept per tab, on this computer.
const STORAGE_KEY = 'allInboxChannels'
const MAX_PER_TAB = 500
const KINDS = new Set(['channel', 'group'])

/** @param {string} subtitle the line under the chat's name in the messenger @returns {'channel'|'group'|''} */
function kindFromSubtitle(subtitle) {
    const text = String(subtitle || '')
    if (/подписчик|subscriber/i.test(text)) return 'channel'
    if (/участник|member/i.test(text)) return 'group'
    return ''
}

const isChannelSubtitle = (subtitle) => kindFromSubtitle(subtitle) === 'channel'

// 3.8.2 kept a list of channel names per tab; 3.8.3 keeps { name: kind }
function normalise(data) {
    const out = {}
    if (!data || typeof data !== 'object') return out
    for (const [tab, value] of Object.entries(data)) {
        if (Array.isArray(value)) out[tab] = Object.fromEntries(value.filter((t) => typeof t === 'string').map((t) => [t, 'channel']))
        else if (value && typeof value === 'object') out[tab] = Object.fromEntries(Object.entries(value).filter(([, k]) => KINDS.has(k)))
    }
    return out
}

/** @param {{ get: (key: string) => any, set: (key: string, value: any) => void }} storage */
function createChannelMemory(storage) {
    let known = {}
    try { known = normalise(storage.get(STORAGE_KEY)) } catch { known = {} }

    const kindOf = (messengerId, title) => (known[messengerId] && known[messengerId][String(title)]) || ''
    return {
        kindOf,
        has: (messengerId, title) => kindOf(messengerId, title) === 'channel',
        remember(messengerId, title, kind = 'channel') {
            const id = String(messengerId || '')
            const name = String(title || '').trim()
            if (!id || !name || !KINDS.has(kind) || kindOf(id, name) === kind) return
            const entries = Object.entries({ ...(known[id] || {}), [name]: kind }).slice(-MAX_PER_TAB)
            known = { ...known, [id]: Object.fromEntries(entries) }
            try { storage.set(STORAGE_KEY, known) } catch {}
        }
    }
}

/** The tabs' chats with the remembered kinds (a new array, the sources stay as they were). */
function withChannelKinds(sources, memory) {
    return (sources || []).map((source) => {
        const id = source && source.messenger && source.messenger.id
        if (!id || !Array.isArray(source.chats)) return source
        return {
            ...source,
            chats: source.chats.map((c) => {
                const kind = c && memory.kindOf(id, c.title)
                return kind ? { ...c, kind } : c
            })
        }
    })
}

module.exports = { kindFromSubtitle, isChannelSubtitle, createChannelMemory, withChannelKinds, STORAGE_KEY }
