'use strict'
// "100 usd", "5000 руб в евро", "$20", "1 000 юаней to rub": the parts of a money question for the quick switcher, and the
// arithmetic on the rates of the Bank of Russia (RUB per unit, as cbr-xml-daily.ru gives them).
const CODE_BY_WORD = {}
const add = (code, words) => { for (const w of words) CODE_BY_WORD[w] = code }
add('RUB', ['rub', 'rur', 'руб', 'руб.', 'рубль', 'рубля', 'рублей', 'р', 'р.', '₽'])
add('USD', ['usd', '$', 'доллар', 'доллара', 'долларов', 'долл', 'долл.', 'бакс', 'баксов', 'баксы'])
add('EUR', ['eur', '€', 'евро'])
add('CNY', ['cny', 'rmb', 'юань', 'юаня', 'юаней'])
add('GBP', ['gbp', '£', 'фунт', 'фунта', 'фунтов'])
add('KZT', ['kzt', 'тенге'])
add('BYN', ['byn'])
add('UAH', ['uah', 'грн', 'гривна', 'гривны', 'гривен'])
add('TRY', ['try', 'лира', 'лиры', 'лир'])
add('JPY', ['jpy', '¥', 'иена', 'иены', 'иен'])
add('CHF', ['chf', 'франк', 'франка', 'франков'])
add('AED', ['aed', 'дирхам', 'дирхама', 'дирхамов'])
add('GEL', ['gel', 'лари'])
add('AMD', ['amd', 'драм', 'драма', 'драмов'])
add('UZS', ['uzs', 'сум', 'сума', 'сумов'])
add('PLN', ['pln', 'злотый', 'злотых', 'злотого'])
add('CZK', ['czk', 'крона', 'кроны', 'крон'])
add('INR', ['inr', 'рупия', 'рупии', 'рупий'])
add('CAD', ['cad'])
add('AUD', ['aud'])

const SEPARATORS = new Set(['в', 'to', 'in', '->', '=', '→', 'into'])
const DEFAULT_TARGETS = { RUB: ['USD', 'EUR', 'CNY'], USD: ['RUB', 'EUR'], EUR: ['RUB', 'USD'] }
const OTHER_TARGETS = ['RUB', 'USD']

function parseAmount(text) {
    const raw = text.replace(/[\s ]/g, '').replace(',', '.')
    if (!/^\d+(\.\d+)?$/.test(raw)) return null
    const value = Number(raw)
    return Number.isFinite(value) ? value : null
}

/**
 * @param {string} text
 * @returns {{ amount: number, from: string, to: string | null } | null}
 */
function parseCurrencyQuery(text) {
    const source = String(text || '').trim().toLowerCase()
    if (!source || source.length > 60) return null
    // a symbol glued to the number: "$20", "20$", "€5", "100₽"
    let m = /^([$€£¥₽])\s*(\d[\d\s.,]*)$/.exec(source)
    if (m) { const amount = parseAmount(m[2]); return amount == null ? null : { amount, from: CODE_BY_WORD[m[1]], to: null } }
    m = /^(\d[\d\s.,]*?)\s*([$€£¥₽])(?:\s+(?:в|to|in|->|=|→)\s+(\S+))?$/.exec(source)
    if (m) {
        const amount = parseAmount(m[1])
        const to = m[3] ? CODE_BY_WORD[m[3]] || null : null
        return amount == null || (m[3] && !to) ? null : { amount, from: CODE_BY_WORD[m[2]], to }
    }
    // "100 usd", "100 usd в рубли", "usd", "1 000 юаней to rub"
    const tokens = source.split(/\s+/)
    let i = 0
    let amountText = ''
    while (i < tokens.length && /^[\d.,]+$/.test(tokens[i])) { amountText += tokens[i]; i += 1 }
    const amount = amountText ? parseAmount(amountText) : 1
    if (amount == null || amount <= 0) return null
    const fromWord = tokens[i]
    const from = fromWord ? CODE_BY_WORD[fromWord] : null
    if (!from) return null
    i += 1
    if (i === tokens.length) return { amount, from, to: null }
    if (!SEPARATORS.has(tokens[i]) || i + 2 !== tokens.length) return null
    const to = CODE_BY_WORD[tokens[i + 1]]
    return to ? { amount, from, to } : null
}

/** The rate of a currency in RUB per one unit, or null when the Bank does not publish it. */
function rubPerUnit(rates, code) {
    if (code === 'RUB') return 1
    const r = rates && rates[code]
    return r && Number.isFinite(r.value) && r.value > 0 ? r.value / (r.nominal || 1) : null
}

/**
 * @param {{ amount: number, from: string, to: string | null }} query
 * @param {Record<string, { value: number, nominal: number }>} rates
 * @returns {{ code: string, value: number }[]}
 */
function convert(query, rates) {
    const fromRate = rubPerUnit(rates, query.from)
    if (fromRate == null) return []
    const targets = query.to ? [query.to] : (DEFAULT_TARGETS[query.from] || OTHER_TARGETS).filter((c) => c !== query.from)
    const out = []
    for (const code of targets) {
        const toRate = rubPerUnit(rates, code)
        if (toRate != null) out.push({ code, value: (query.amount * fromRate) / toRate })
    }
    return out
}

module.exports = { parseCurrencyQuery, convert }
