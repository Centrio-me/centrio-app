'use strict'
// «Все мессенджеры»: whether the chat open in the tab is the one the person chose in the list. Names are compared
// letters and digits only (messengers add emoji, stars and badges to them). An unknown name never matches, so nothing
// is ever typed into a chat that could be someone else's.

function normalize(name) {
    return String(name || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]/gu, '')
}

/** @param {string} chosen the name in our list @param {string} open the name the tab shows */
function sameChat(chosen, open) {
    const a = normalize(chosen)
    const b = normalize(open)
    return !!a && !!b && a === b
}

module.exports = { sameChat }
