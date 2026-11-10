// Support (2026-11-10, owner: «Если клиент говорит — оператор или поддержка — звать меня. Пока сам может
// справиться — пусть общается»): the customer asking for a person ends the bot's part of the conversation at once.
// Decided here, without the model, so it never depends on how the model reads the message.

// Asking for a person in so many words, wherever it stands in the message
const STRONG = [
    /оператор/,
    /живо(й|го|м|му)\s+(человек|сотрудник|специалист)/,
    /(позов|позва|соедин|переключ|свяж|дайте|дай\s|нужен|нужна|хочу)\S*\s+(.{0,30}\s)?(с\s+)?(человек|специалист|сотрудник|поддержк|оператор|менеджер|админ)/,
    /\b(operator|human|real person|live (agent|person|chat|support))\b/,
    /\b(speak|talk|chat)\s+(to|with)\s+(a |an |the )?(person|human|agent|someone|somebody|operator|support|manager)/,
    /人工|客服|真人/,
    /\b(operador|operatore|op[ée]rateur|agente humano|persona real|conseiller|humain)\b/
]

// A short message that is just the call: «Поддержка», «Человек!», «Support please», «Mitarbeiter bitte»
const SHORT_WORDS = /(поддержк|человек|специалист|сотрудник|менеджер|support|agent|person|someone|mitarbeiter|mensch)/
const SHORT_MAX_WORDS = 3

/** Whether the customer asks for a person from the team instead of the bot. */
function wantsHuman(text) {
    const s = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (!s) return false
    if (STRONG.some((re) => re.test(s))) return true
    const words = s.split(' ').filter(Boolean)
    return words.length <= SHORT_MAX_WORDS && SHORT_WORDS.test(s)
}

module.exports = { wantsHuman }
