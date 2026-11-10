'use strict'
// «Все мессенджеры»: the recently used emoji of the panel

const RECENT_MAX = 32

/** The recent list after picking one: it moves to the front, the list stays short. */
function rememberRecent(list, emoji) {
    return [emoji, ...(list || []).filter((e) => e !== emoji)].slice(0, RECENT_MAX)
}

module.exports = { rememberRecent, RECENT_MAX }
