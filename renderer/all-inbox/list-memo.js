'use strict'
// «Все мессенджеры» (3.8.3 speed check): the lists were read every 2 seconds with every avatar as a data URL —
// Telegram alone gave ~0.9 MB each time, the same pictures again and again. Now the tab sends an avatar once per
// session; after that only «@key» comes, and our side fills it from what it already has. A key we do not have (an
// answer lost on the way) is reported, and the caller starts a new session so everything comes again.

/** wraps a list page script: each data: avatar crosses once per session and per picture */
function withListMemo(listScript, session) {
    return `(function () {
        var s = ${JSON.stringify(String(session))};
        var memo = window.__ciListSent && window.__ciListSent.s === s ? window.__ciListSent : (window.__ciListSent = { s: s, k: {} });
        var list = ${listScript};
        if (!list || typeof list.length !== 'number') return list;
        for (var i = 0; i < list.length; i++) {
            var c = list[i], v = c && c.avatar;
            if (!v || typeof v !== 'string' || v.indexOf('data:') !== 0) continue;
            var key = String(c.key);
            if (memo.k[key] === v.length) c.avatar = '@' + key;
            else memo.k[key] = v.length;
        }
        return list;
    })()`
}

/**
 * @param {Array<object>|null} chats a list as it came from the tab
 * @param {Map<string, string>} cache avatars already received, by chat key
 * @returns {{ chats: Array<object>|null, missing: boolean }}
 */
function resolveListAvatars(chats, cache) {
    if (!Array.isArray(chats)) return { chats, missing: false }
    let missing = false
    const out = chats.map((c) => {
        const v = c && c.avatar
        if (typeof v !== 'string' || !v) return c
        if (v.startsWith('@')) {
            const have = cache.get(v.slice(1))
            if (have) return { ...c, avatar: have }
            missing = true
            return { ...c, avatar: '' }
        }
        if (v.startsWith('data:')) cache.set(String(c.key), v)
        return c
    })
    return { chats: out, missing }
}

module.exports = { withListMemo, resolveListAvatars }
