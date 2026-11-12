// Emoji drawn the way the messenger itself draws them (3.8.3, owner 2026-11-12: «мы ведь не свои юзаем эмодзи, а ТГ и
// других мессенджеров»). Telegram Web and MAX show their emoji as pictures from their own servers, named by code points;
// our window takes the same pictures from the same place — nothing of theirs is shipped with Centrio. Other messengers,
// and a picture that does not load, keep our own emoji font.
const emojiRegex = require('emoji-regex')

const VARIATION = 0xfe0f

function emojiCode(sequence, upper = false) {
    const code = [...String(sequence)]
        .map((ch) => ch.codePointAt(0))
        .filter((cp) => cp !== VARIATION)
        .map((cp) => cp.toString(16))
        .join('-')
    return upper ? code.toUpperCase() : code
}

const SETS = {
    telegram: (seq) => `https://web.telegram.org/k/assets/img/emoji/${emojiCode(seq)}.png`,
    max: (seq) => `https://st.max.ru/emojis/${emojiCode(seq, true)}_64.webp`
}

/** @returns {string} the picture of the emoji in the messenger's own set, '' when it has none we know */
function emojiUrl(sequence, service) {
    const make = SETS[service]
    return make && sequence ? make(sequence) : ''
}

/** @returns {({ text: string } | { emoji: string })[]} */
function emojiParts(text) {
    const s = String(text || '')
    if (!s) return []
    const parts = []
    let last = 0
    for (const m of s.matchAll(emojiRegex())) {
        if (m.index > last) parts.push({ text: s.slice(last, m.index) })
        parts.push({ emoji: m[0] })
        last = m.index + m[0].length
    }
    if (last < s.length) parts.push({ text: s.slice(last) })
    return parts
}

// the set of the open chat's messenger, shared by the messages and the emoji panel
let current = ''
const setEmojiSet = (service) => { current = String(service || '') }
const getEmojiSet = () => current

module.exports = { emojiUrl, emojiParts, emojiCode, setEmojiSet, getEmojiSet }
