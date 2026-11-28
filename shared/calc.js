'use strict'
// A small safe calculator for the quick switcher: + - * / ^ % ( ), a decimal point or comma, spaces; no eval.
// "2+2*3" -> 8, "(10+5)/3" -> 5, "15% от 200" is not understood (that is a sentence, not an expression), "200*15%" -> 30.
const MAX_LENGTH = 120

const isDigit = (c) => c >= '0' && c <= '9'

function tokenize(text) {
    const tokens = []
    let i = 0
    while (i < text.length) {
        const c = text[i]
        if (c === ' ' || c === '\u00a0') { i += 1; continue }
        if (isDigit(c) || ((c === '.' || c === ',') && isDigit(text[i + 1] || ''))) {
            let j = i
            while (j < text.length && (isDigit(text[j]) || text[j] === '.' || text[j] === ',')) j += 1
            const raw = text.slice(i, j).replace(',', '.')
            if ((raw.match(/\./g) || []).length > 1) return null
            tokens.push({ t: 'n', v: Number(raw) })
            i = j
            continue
        }
        if ('+-*/^%()'.includes(c)) { tokens.push({ t: c }); i += 1; continue }
        if (c === '×' || c === 'x' || c === 'х') { tokens.push({ t: '*' }); i += 1; continue }
        if (c === '÷' || c === ':') { tokens.push({ t: '/' }); i += 1; continue }
        if (c === '−' || c === '–') { tokens.push({ t: '-' }); i += 1; continue }
        return null
    }
    return tokens
}

// precedence climbing: expr := term (('+'|'-') term)*, term := power (('*'|'/') power)*, power := unary ('^' power)?, unary := '-' unary | postfix
function parse(tokens) {
    let pos = 0
    const peek = () => tokens[pos]
    const take = () => tokens[pos++]

    function primary() {
        const tok = take()
        if (!tok) throw new Error('end')
        if (tok.t === 'n') return tok.v
        if (tok.t === '(') {
            const v = expr()
            if (!peek() || take().t !== ')') throw new Error('paren')
            return v
        }
        throw new Error('token')
    }
    function postfix() {
        let v = primary()
        while (peek() && peek().t === '%') { take(); v /= 100 }
        return v
    }
    function unary() {
        if (peek() && peek().t === '-') { take(); return -unary() }
        if (peek() && peek().t === '+') { take(); return unary() }
        return postfix()
    }
    function power() {
        const base = unary()
        if (peek() && peek().t === '^') { take(); return base ** power() }
        return base
    }
    function term() {
        let v = power()
        while (peek() && (peek().t === '*' || peek().t === '/')) {
            const op = take().t
            const right = power()
            v = op === '*' ? v * right : v / right
        }
        return v
    }
    function expr() {
        let v = term()
        while (peek() && (peek().t === '+' || peek().t === '-')) {
            const op = take().t
            const right = term()
            v = op === '+' ? v + right : v - right
        }
        return v
    }
    const value = expr()
    if (pos !== tokens.length) throw new Error('rest')
    return value
}

/**
 * The value of an arithmetic expression, or null when the text is not one (or the result is not a finite number).
 * A bare number is not "a calculation": nothing to answer.
 * @param {string} text
 * @returns {number | null}
 */
function evaluate(text) {
    const source = String(text || '').trim()
    if (!source || source.length > MAX_LENGTH) return null
    const tokens = tokenize(source)
    // something has to be calculated: a sign between two things (a leading minus alone is just a number)
    if (!tokens || !tokens.some((tk, i) => i > 0 && '+-*/^'.includes(tk.t))) return null
    try {
        const value = parse(tokens)
        return Number.isFinite(value) ? value : null
    } catch {
        return null
    }
}

/** 8 -> "8", 0.30000000000000004 -> "0.3", 1234567.891 -> "1 234 567.891" */
function formatNumber(value, maxFraction = 8) {
    const rounded = Number(value.toFixed(maxFraction))
    const [int, frac] = String(rounded).split('.')
    const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
    return frac ? `${grouped}.${frac}` : grouped
}

module.exports = { evaluate, formatNumber }
