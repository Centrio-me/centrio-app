'use strict'

// The key name of a keyboard event for the shortcut system. On a Latin layout the character is used as typed
// (so Dvorak/AZERTY keep the labels they show). On any other layout (Russian, Greek, Arabic …) the character is
// not a Latin letter, so the physical key (event.code) decides: the key printed "J" on a QWERTY keyboard is "J"
// whatever layout is active. This is what makes shortcuts work with the Russian layout switched on.
const CODE_NAMES = {
    Comma: ',', Period: '.', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\',
    Slash: '/', Backquote: '`', Equal: '=', Minus: '-', Tab: 'Tab', Space: 'Space', Escape: 'Esc',
    ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Delete: 'Delete',
    Backspace: 'Backspace', Enter: 'Enter'
}
// Typed characters of Shift+1..0 on a US layout, used only when an event carries no physical key code (virtual
// keyboards, remote desktop): without the code the digit cannot be told from the symbol.
const SHIFTED_DIGITS = { '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0' }
const KEY_NAMES = { ' ': 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }

function keyFromCode(code) {
    if (typeof code !== 'string') return ''
    const letter = /^Key([A-Z])$/.exec(code)
    if (letter) return letter[1]
    const digit = /^Digit([0-9])$/.exec(code)
    if (digit) return digit[1]
    if (/^F([1-9]|1\d|2[0-4])$/.test(code)) return code
    return CODE_NAMES[code] || ''
}

function shortcutKeyName(key, code) {
    // Digits are always the physical key: Shift+1 types '!' (or another symbol on other layouts), but it is still the 1 key.
    const digit = /^Digit([0-9])$/.exec(typeof code === 'string' ? code : '')
    if (digit) return digit[1]
    if (!code && typeof key === 'string' && SHIFTED_DIGITS[key]) return SHIFTED_DIGITS[key]
    if (typeof key === 'string' && key.length === 1 && /[\x21-\x7e]/.test(key)) return key.toUpperCase()
    if (typeof key === 'string' && KEY_NAMES[key]) return KEY_NAMES[key]
    const fromCode = keyFromCode(code)
    if (fromCode) return fromCode
    return typeof key === 'string' ? key : ''
}

module.exports = { shortcutKeyName }
