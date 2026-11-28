'use strict'
// Exchange rates of the Bank of Russia for the quick switcher (renderer/search-ui.js, shared/currency-query.js).
// One request a few hours; when the site cannot be reached the last answer is used, so a question never hangs.
const { net } = require('electron')
const store = require('./store')

const URL_DAILY = 'https://www.cbr-xml-daily.ru/daily_json.js'
const CACHE_KEY = 'ratesCache'
const TTL_MS = 6 * 60 * 60 * 1000
const TIMEOUT_MS = 8000

let memory = null

function parse(json) {
    const out = {}
    for (const [code, v] of Object.entries((json && json.Valute) || {})) {
        if (v && Number.isFinite(v.Value) && Number.isFinite(v.Nominal)) out[code] = { value: v.Value, nominal: v.Nominal, name: v.Name || code }
    }
    return { date: String((json && json.Date) || '').slice(0, 10), rates: out }
}

async function download() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const res = await net.fetch(URL_DAILY, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const parsed = parse(await res.json())
        if (!Object.keys(parsed.rates).length) throw new Error('empty')
        return { ...parsed, fetchedAt: Date.now() }
    } finally {
        clearTimeout(timer)
    }
}

/** { date, rates: { USD: { value, nominal, name } }, fetchedAt } or null when there has never been an answer */
async function getRates() {
    if (!memory) memory = store.get(CACHE_KEY, null)
    if (memory && Date.now() - memory.fetchedAt < TTL_MS) return memory
    try {
        memory = await download()
        store.set(CACHE_KEY, memory)
    } catch { /* keep the last one, if any */ }
    return memory || null
}

module.exports = { getRates }
