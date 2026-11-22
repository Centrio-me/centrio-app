'use strict'
// «Все мессенджеры»: text typed into a messenger's field through the tab. A new line is Shift+Enter (what Telegram, MAX and
// WhatsApp take as a line break); a «\n» inside one inserted text was not taken as one by every field, and the paragraphs of a
// sent note ran together (Oleg, 2026-11-22).

const LINE_BREAK_SETTLE_MS = 20

/**
 * @param {{ insertText: Function, sendInputEvent: Function }} w the tab
 * @param {string} text
 * @param {(ms: number) => Promise<void>} wait
 */
async function typeLines(w, text, wait) {
    const lines = String(text || '').split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
        if (lines[i]) w.insertText(lines[i])
        if (i < lines.length - 1) {
            w.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] })
            w.sendInputEvent({ type: 'char', keyCode: '\r', modifiers: ['shift'] })
            w.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] })
            await wait(LINE_BREAK_SETTLE_MS)
        }
    }
}

module.exports = { typeLines }
