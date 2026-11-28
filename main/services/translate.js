'use strict'
// Translation of a selected text for the popup of the «Переводчик» tool. No account and no key: the public endpoint of Google
// Translate first, then MyMemory when the first one does not answer.
const { net } = require('electron')

const GOOGLE = 'https://translate.googleapis.com/translate_a/single'
const MY_MEMORY = 'https://api.mymemory.translated.net/get'
const MAX_CHARS = 3000
const MAX_QUERY_URL = 1800 // a longer question goes in the body of a POST
const MY_MEMORY_CHUNK = 450
const TIMEOUT_MS = 9000

async function getJson(url, init = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
        const res = await net.fetch(url, { ...init, signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
    } finally {
        clearTimeout(timer)
    }
}

async function viaGoogle(text, target) {
    const body = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: text })
    const query = body.toString()
    const data = query.length < MAX_QUERY_URL
        ? await getJson(`${GOOGLE}?${query}`)
        : await getJson(GOOGLE, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: query })
    const parts = Array.isArray(data && data[0]) ? data[0] : []
    const translated = parts.map((p) => (Array.isArray(p) ? p[0] : '')).join('')
    if (!translated) throw new Error('empty')
    return { text: translated, from: typeof data[2] === 'string' ? data[2] : '', provider: 'google' }
}

function chunks(text) {
    const out = []
    let rest = text
    while (rest.length > MY_MEMORY_CHUNK) {
        let cut = rest.lastIndexOf(' ', MY_MEMORY_CHUNK)
        if (cut < MY_MEMORY_CHUNK / 2) cut = MY_MEMORY_CHUNK
        out.push(rest.slice(0, cut))
        rest = rest.slice(cut)
    }
    out.push(rest)
    return out
}

async function viaMyMemory(text, target) {
    const done = []
    for (const piece of chunks(text)) {
        const url = `${MY_MEMORY}?q=${encodeURIComponent(piece)}&langpair=${encodeURIComponent(`Autodetect|${target}`)}`
        const data = await getJson(url)
        const out = data && data.responseData && data.responseData.translatedText
        if (!out || data.responseStatus !== 200) throw new Error('empty')
        done.push(out)
    }
    return { text: done.join(''), from: '', provider: 'mymemory' }
}

/**
 * @param {string} text
 * @param {string} target a language code, e.g. 'ru'
 * @returns {Promise<{ ok: true, text: string, from: string, provider: string } | { ok: false, error: string }>}
 */
async function translate(text, target) {
    const clean = String(text || '').trim().slice(0, MAX_CHARS)
    if (!clean) return { ok: false, error: 'empty' }
    for (const run of [viaGoogle, viaMyMemory]) {
        try {
            const result = await run(clean, target)
            return { ok: true, ...result }
        } catch { /* the next way */ }
    }
    return { ok: false, error: 'offline' }
}

module.exports = { translate }
