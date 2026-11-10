'use strict'
// «Все мессенджеры»: the shape of a message, the way Telegram decides it — large lonely emoji, the size of a photo.

const MAX_JUMBO = 3
const MEDIA_MAX_W = 420
const MEDIA_MIN_W = 160
const MEDIA_MAX_H = 420
const MEDIA_DEFAULT = { width: 320, height: 240 }

// one emoji: a pictographic character with its modifiers and joined parts, or a flag (two regional letters)
const EMOJI = /(?:\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*)/gu

/** How many emoji a message is made of when it is only 1–3 emoji (drawn large, without a bubble); otherwise 0. */
function jumboCount(text) {
    const s = String(text || '').replace(/\s+/g, '')
    if (!s) return 0
    const found = s.match(EMOJI) || []
    if (!found.length || found.join('') !== s) return 0
    return found.length <= MAX_JUMBO ? found.length : 0
}

/** The size a photo takes in the conversation: its own proportions, within Telegram's limits. */
function mediaBox(w, h) {
    if (!(w > 0) || !(h > 0)) return { ...MEDIA_DEFAULT }
    let width = Math.min(MEDIA_MAX_W, w)
    let height = Math.round((width * h) / w)
    if (height > MEDIA_MAX_H) { height = MEDIA_MAX_H; width = Math.round((height * w) / h) }
    if (width < MEDIA_MIN_W) width = MEDIA_MIN_W
    return { width, height }
}

module.exports = { jumboCount, mediaBox, MEDIA_MAX_W }
