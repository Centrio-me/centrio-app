// Quick switcher ranking (3.7.1): services, saved split screens and app actions in one list, found by a few letters.
// Understands a query typed in the wrong keyboard layout (ЙЦУКЕН <-> QWERTY) and letters in order with gaps.
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`"
const RU = 'йцукенгшщзхъфывапролджэячсмитьбю.ё'
const TO_RU = new Map([...EN].map((c, i) => [c, RU[i]]))
const TO_EN = new Map([...RU].map((c, i) => [c, EN[i]]))
const GROUP_ORDER = { services: 0, presets: 1, actions: 2 }
const EMPTY_LIMIT = 8

/** The same keys in the other layout: 'ntktuhfv' -> 'телеграм', 'ыуе' -> 'set'. */
function swapLayout(text) {
    const s = String(text).toLowerCase()
    const latin = /[a-z]/.test(s) && !/[а-яё]/.test(s)
    const map = latin ? TO_RU : TO_EN
    return [...s].map((c) => map.get(c) ?? c).join('')
}

function scoreText(text, q) {
    const t = String(text || '').toLowerCase()
    if (!t || !q) return 0
    if (t === q) return 100
    if (t.startsWith(q)) return 80
    if (t.split(/[\s\-_.:/]+/).some((w) => w.startsWith(q))) return 65
    if (t.includes(q)) return 45
    // letters in order: "тчк вст" -> "Точки восстановления"
    const words = q.split(/\s+/).filter(Boolean)
    if (words.length > 1 && words.every((w) => t.split(/\s+/).some((tw) => inOrder(tw, w)))) return 30
    if (q.length >= 3 && t.split(/\s+/).some((w) => inOrder(w, q))) return 15
    return 0
}

function inOrder(text, letters) {
    let i = 0
    for (const c of text) if (c === letters[i]) i += 1
    return i === letters.length
}

function scoreItem(item, q) {
    const label = scoreText(item.label, q)
    const keywords = Math.max(0, ...(item.keywords || []).map((k) => scoreText(k, q) - 5))
    return Math.max(label, keywords)
}

/** Items matching the query, best first; an empty query keeps the order of the groups (services first). */
function rankItems(items, query) {
    const q = String(query || '').toLowerCase().trim()
    const byGroup = (a, b) => (GROUP_ORDER[a.item.group] ?? 9) - (GROUP_ORDER[b.item.group] ?? 9) || a.index - b.index
    const indexed = items.map((item, index) => ({ item, index }))
    if (!q) return indexed.sort(byGroup).slice(0, EMPTY_LIMIT).map((x) => x.item)
    const alt = swapLayout(q)
    return indexed
        .map((x) => ({ ...x, score: Math.max(scoreItem(x.item, q), alt !== q ? scoreItem(x.item, alt) - 1 : 0) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || byGroup(a, b))
        .map((x) => x.item)
}

module.exports = { rankItems, swapLayout }
