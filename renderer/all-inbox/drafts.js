'use strict'
// «Все мессенджеры»: what was typed and not sent stays with its chat while another one is open, like in messengers.
// Kept in memory only (a session), the oldest ones go first when there are too many.

const MAX_DRAFTS = 50

function createDrafts(limit = MAX_DRAFTS) {
    const map = new Map()
    return {
        keep(chatId, text) {
            map.delete(chatId)
            if (String(text || '').trim()) map.set(chatId, String(text))
            while (map.size > limit) map.delete(map.keys().next().value)
        },
        take(chatId) { return map.get(chatId) || '' },
        forget(chatId) { map.delete(chatId) }
    }
}

// the conversation window writes here and the list shows «Черновик:» from here
const sharedDrafts = createDrafts()

module.exports = { createDrafts, sharedDrafts, MAX_DRAFTS }
