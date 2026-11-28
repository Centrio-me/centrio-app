'use strict'
// Centrio's own spell checking (11.2026): one setting for every service. It switches the checker of Chromium on for every session
// (the default one and the page of each messenger), picks the languages (Russian and English by default, not only the system one)
// and keeps one dictionary of the person's own words for all of them. The misspelling menu itself is in pageContextMenu.js.
const { app, session } = require('electron')
const store = require('./store')

const KEY = 'spellcheck'
const DEFAULT_LANGUAGES = ['ru', 'en-US']
const MAX_LANGUAGES = 6
const MAX_WORDS = 2000
const MAX_WORD_LENGTH = 60
// the languages offered in the settings (those among them that this system's checker knows)
const OFFERED = ['ru', 'en-US', 'en-GB', 'uk', 'de', 'fr', 'es', 'it', 'pt-BR', 'pl', 'tr', 'nl']

const sessions = new Set()

function read() {
    const raw = store.get(KEY, {}) || {}
    const languages = Array.isArray(raw.languages) ? raw.languages.filter((l) => typeof l === 'string' && l.length <= 12).slice(0, MAX_LANGUAGES) : []
    return {
        enabled: raw.enabled !== false,
        languages: languages.length ? languages : DEFAULT_LANGUAGES,
        words: Array.isArray(raw.words) ? raw.words.filter((w) => typeof w === 'string' && w && w.length <= MAX_WORD_LENGTH).slice(0, MAX_WORDS) : []
    }
}

function write(next) {
    store.set(KEY, next)
}

function available() {
    try { return session.defaultSession.availableSpellCheckerLanguages } catch { return [] }
}

function applyTo(ses) {
    const cfg = read()
    try {
        ses.setSpellCheckerEnabled(cfg.enabled)
        const known = new Set(ses.availableSpellCheckerLanguages)
        const langs = cfg.languages.filter((l) => known.has(l))
        if (langs.length) ses.setSpellCheckerLanguages(langs)
    } catch { /* a session that has no checker */ }
}

function setUp(ses) {
    if (!ses || sessions.has(ses)) return
    sessions.add(ses)
    applyTo(ses)
    for (const word of read().words) {
        try { ses.addWordToSpellCheckerDictionary(word) } catch { /* ignore */ }
    }
}

function setUpKnown() {
    setUp(session.defaultSession)
    const messengers = store.get('messengers', []) || []
    for (const m of Array.isArray(messengers) ? messengers : []) {
        if (m && typeof m.id === 'string') {
            try { setUp(session.fromPartition(`persist:${m.id}`)) } catch { /* ignore */ }
        }
    }
}

function init() {
    app.on('session-created', setUp)
    setUpKnown()
}

function getState() {
    const cfg = read()
    const known = new Set(available())
    return { enabled: cfg.enabled, languages: cfg.languages, offered: OFFERED.filter((l) => known.has(l)), words: cfg.words }
}

function setOptions({ enabled, languages }) {
    const cfg = read()
    const next = { ...cfg }
    if (typeof enabled === 'boolean') next.enabled = enabled
    if (Array.isArray(languages)) {
        const known = new Set(available())
        const picked = languages.filter((l) => typeof l === 'string' && known.has(l)).slice(0, MAX_LANGUAGES)
        if (picked.length) next.languages = picked
    }
    write(next)
    for (const ses of sessions) applyTo(ses)
    return getState()
}

function addWord(word) {
    const clean = String(word || '').trim().slice(0, MAX_WORD_LENGTH)
    if (!clean || /\s/.test(clean)) return getState()
    const cfg = read()
    if (!cfg.words.includes(clean) && cfg.words.length < MAX_WORDS) write({ ...cfg, words: [...cfg.words, clean] })
    for (const ses of sessions) {
        try { ses.addWordToSpellCheckerDictionary(clean) } catch { /* ignore */ }
    }
    return getState()
}

function removeWord(word) {
    const cfg = read()
    write({ ...cfg, words: cfg.words.filter((w) => w !== word) })
    for (const ses of sessions) {
        try { ses.removeWordFromSpellCheckerDictionary(String(word)) } catch { /* ignore */ }
    }
    return getState()
}

module.exports = { init, getState, setOptions, addWord, removeWord }
