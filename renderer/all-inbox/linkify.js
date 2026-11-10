'use strict'
// «Все мессенджеры»: a message's text split into plain pieces and links. Only web addresses become links
// (http, https, www., t.me) — they open in the browser through the usual 'open-url' check in the main process.

const LINK_RE = /\b(?:https?:\/\/|www\.|t\.me\/)[^\s<>"«»]+/gi
const TRAILING = /[.,!?;:…'"»)\]]+$/

/**
 * @param {string|null|undefined} text
 * @returns {{ text: string, url?: string }[]}
 */
function linkParts(text) {
    const s = String(text || '')
    if (!s) return []
    const parts = []
    let last = 0
    for (const m of s.matchAll(LINK_RE)) {
        let link = m[0]
        // a closing bracket belongs to the link only when the link opened one itself
        const tail = (link.match(TRAILING) || [''])[0]
        let keep = tail.length
        while (keep > 0 && tail[tail.length - keep] === ')' && (link.slice(0, link.length - keep).split('(').length > link.slice(0, link.length - keep).split(')').length)) keep--
        link = link.slice(0, link.length - keep)
        if (!link) continue
        if (m.index > last) parts.push({ text: s.slice(last, m.index) })
        const url = /^https?:\/\//i.test(link) ? link : `https://${link}`
        parts.push({ text: link, url })
        last = m.index + link.length
    }
    if (last < s.length) parts.push({ text: s.slice(last) })
    return parts
}

module.exports = { linkParts }
