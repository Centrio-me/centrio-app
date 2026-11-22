'use strict'
// The name of a topic of a Telegram group as the chips show it. The page's row of a topic holds its icon too: a coloured circle with
// the first letter of the name, or an emoji drawn as a picture whose text is a private-use character (an empty box in our font).

const NO_GLYPH = /[-�​-‍⁠﻿]/g

/** @returns {string} */
function cleanTopicTitle(raw) {
    let t = String(raw == null ? '' : raw).replace(NO_GLYPH, '').replace(/\s+/g, ' ').trim()
    // «Т Тема»: the icon's letter, then the name that starts with the same letter
    const m = /^(\S) (\S.*)$/u.exec(t)
    if (m && Array.from(m[2])[0].toLowerCase() === m[1].toLowerCase() && /\p{L}/u.test(m[1])) t = m[2]
    return t
}

module.exports = { cleanTopicTitle }
