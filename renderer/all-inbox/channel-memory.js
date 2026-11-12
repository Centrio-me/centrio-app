// Channels whose list does not say they are channels (MAX, 3.8.2). Oleg, 2026-11-12: «чаты каналы в общей куче» — MAX
// draws a channel in its list like any chat, but the open chat says «… подписчиков» under the name (a group says
// «участников»). A chat seen once as a channel is remembered and stays in «Каналы». Kept per tab, on this computer.
const STORAGE_KEY = 'allInboxChannels'
const MAX_PER_TAB = 500

/** @param {string} subtitle the line under the chat's name in the messenger */
function isChannelSubtitle(subtitle) {
    return /подписчик|subscriber/i.test(String(subtitle || ''))
}

/** @param {{ get: (key: string) => any, set: (key: string, value: any) => void }} storage */
function createChannelMemory(storage) {
    const read = () => {
        try {
            const data = storage.get(STORAGE_KEY)
            return data && typeof data === 'object' ? data : {}
        } catch { return {} }
    }
    let known = read()

    return {
        has: (messengerId, title) => Array.isArray(known[messengerId]) && known[messengerId].includes(String(title)),
        remember(messengerId, title) {
            const id = String(messengerId || '')
            const name = String(title || '').trim()
            if (!id || !name) return
            const list = Array.isArray(known[id]) ? known[id] : []
            if (list.includes(name)) return
            known = { ...known, [id]: [...list, name].slice(-MAX_PER_TAB) }
            try { storage.set(STORAGE_KEY, known) } catch {}
        }
    }
}

/** The tabs' chats with the remembered channels marked as channels (a new array, the sources stay as they were). */
function withChannelKinds(sources, memory) {
    return (sources || []).map((source) => {
        const id = source && source.messenger && source.messenger.id
        if (!id || !Array.isArray(source.chats)) return source
        return { ...source, chats: source.chats.map((c) => (c && memory.has(id, c.title) ? { ...c, kind: 'channel' } : c)) }
    })
}

module.exports = { isChannelSubtitle, createChannelMemory, withChannelKinds, STORAGE_KEY }
