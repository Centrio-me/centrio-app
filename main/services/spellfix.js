'use strict'
// Centrio's own spell fixer for «Исправить ошибки» in the right-click menu of a text field: Russian and English dictionaries of
// our own (Hunspell, through nspell), so it works the same on every computer, with or without the dictionaries of Chromium.
// A word is checked by its alphabet (Cyrillic by the Russian one, Latin by the English one); words with digits, links, @names and
// #tags are left alone. The person's own words (Settings → Расширения → Проверка правописания) are known to it.
const fs = require('fs')
const path = require('path')
const store = require('./store')

const MAX_TEXT = 20000
const MAX_MISTAKES = 60
const MAX_SUGGESTIONS = 5
const MIN_LATIN_LENGTH = 3 // «ok», «tv», «pc»: too short to judge
const WORD_RE = /[\p{L}][\p{L}'’-]*/gu
const SKIP_AROUND_RE = /[\p{N}_@#/.\\:]/u
const CYRILLIC_RE = /[Ѐ-ӿ]/
const LATIN_RE = /[A-Za-z]/

let engines = null

function dictionaryDir(name) {
    return path.join(path.dirname(require.resolve('nspell')), '..', '..', name)
}

function load() {
    if (engines) return engines
    const NSpell = require('nspell')
    const make = (pkg) => NSpell(fs.readFileSync(path.join(dictionaryDir(pkg), 'index.aff')), fs.readFileSync(path.join(dictionaryDir(pkg), 'index.dic')))
    engines = { ru: make('dictionary-ru'), en: make('dictionary-en') }
    // words of messengers that the general dictionary does not have, written like the word they decline like
    for (const word of ['мессенджер', 'стикер', 'репост', 'эмодзи', 'сторис', 'вебинар', 'ватсап', 'телеграм']) { try { engines.ru.add(word, word === 'эмодзи' || word === 'сторис' ? undefined : 'компьютер') } catch { /* the dictionary keeps what it has */ } }
    return engines
}

function ownWords() {
    const raw = store.get('spellcheck', {}) || {}
    return Array.isArray(raw.words) ? raw.words.filter((w) => typeof w === 'string') : []
}

/** Edit distance of two words (insert, delete, change one letter): the nearer a suggestion is to what was typed, the better it is */
function distance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0]
        row[0] = i
        for (let j = 1; j <= b.length; j++) {
            const keep = row[j]
            row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
            prev = keep
        }
    }
    return row[b.length]
}

const ALPHABET = { ru: 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя', en: 'abcdefghijklmnopqrstuvwxyz' }

/** Every word one slip away from this one (a letter changed, missing, extra or two swapped) that the dictionary knows */
function oneSlipAway(engine, word, alphabet) {
    const out = []
    const seen = new Set([word])
    const take = (candidate) => { if (!seen.has(candidate)) { seen.add(candidate); if (engine.correct(candidate)) out.push(candidate) } }
    const letters = [...word]
    for (let i = 0; i < letters.length; i++) {
        for (const c of alphabet) take(letters.slice(0, i).join('') + c + letters.slice(i + 1).join('')) // changed
        if (i < letters.length - 1) take(letters.slice(0, i).join('') + letters[i + 1] + letters[i] + letters.slice(i + 2).join('')) // swapped
    }
    for (let i = 0; i < letters.length; i++) take(letters.slice(0, i).join('') + letters.slice(i + 1).join('')) // extra letter
    for (let i = 0; i <= letters.length; i++) for (const c of alphabet) take(letters.slice(0, i).join('') + c + letters.slice(i).join('')) // missing letter
    return out
}

function bestSuggestions(engine, word, which) {
    const lower = word.toLowerCase()
    const typedCapital = word[0] !== lower[0]
    const own = oneSlipAway(engine, lower, ALPHABET[which]).map((w) => (typedCapital ? w[0].toUpperCase() + w.slice(1) : w))
    const fromDictionary = engine.suggest(word).map((s) => ({ s, d: distance(lower, s.toLowerCase()) })).sort((x, y) => x.d - y.d).map((x) => x.s)
    return [...new Set([...own, ...fromDictionary])].slice(0, MAX_SUGGESTIONS)
}

function engineFor(word) {
    if (CYRILLIC_RE.test(word) && !LATIN_RE.test(word)) return 'ru'
    if (LATIN_RE.test(word) && !CYRILLIC_RE.test(word)) return 'en'
    return null // a mix of alphabets: not ours to judge
}

/**
 * @param {string} text
 * @returns {{ ok: true, mistakes: { word: string, start: number, end: number, suggestions: string[] }[] }}
 */
function check(text) {
    const source = String(text || '').slice(0, MAX_TEXT)
    const { ru, en } = load()
    const own = new Set(ownWords().map((w) => w.toLowerCase()))
    const mistakes = []
    for (const m of source.matchAll(WORD_RE)) {
        const word = m[0].replace(/^[-'’]+|[-'’]+$/g, '')
        if (word.length < 2) continue
        const start = m.index + m[0].indexOf(word)
        const end = start + word.length
        if (SKIP_AROUND_RE.test(source[start - 1] || '') || SKIP_AROUND_RE.test(source[end] || '')) continue
        if (own.has(word.toLowerCase())) continue
        const which = engineFor(word)
        if (!which || (which === 'en' && word.length < MIN_LATIN_LENGTH)) continue
        const engine = which === 'ru' ? ru : en
        // a word written with a hyphen is right when all of its parts are
        const parts = word.split(/[-’']/).filter(Boolean)
        if (engine.correct(word) || (parts.length > 1 && parts.every((p) => p.length < 2 || engine.correct(p)))) continue
        mistakes.push({ word, start, end, suggestions: bestSuggestions(engine, word, which) })
        if (mistakes.length >= MAX_MISTAKES) break
    }
    return { ok: true, mistakes }
}

/** Reads the dictionaries ahead of the first use (they take a couple of seconds) */
function warm() {
    try { load() } catch { /* checked again on the first use */ }
}

module.exports = { check, warm }
