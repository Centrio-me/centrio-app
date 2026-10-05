const { renderConsentLabels, bindConsentLinks } = require('./consent-ui')
// Локализация рендерера
// ВАЖНО: статические импорты всех локалей — esbuild не умеет бандлить динамический require с переменной

const DICTIONARIES = {
    ru: require('../locales/ru.js'),
    en: require('../locales/en.js'),
    de: require('../locales/de.js'),
    es: require('../locales/es.js'),
    fr: require('../locales/fr.js'),
    it: require('../locales/it.js'),
    zh: require('../locales/zh.js'),
}

let currentLanguage = 'ru'
let cachedDictionary = null
let cachedLanguage   = null

function setCurrentLanguage (lang) {
    if (typeof lang === 'string' && lang.trim()) {
        currentLanguage  = lang.trim()
        cachedDictionary = null
        cachedLanguage   = null
    }
}

// First launch only: follow the language of the system, so a foreign user sees their own language from the very
// first screen. Anyone who already has settings, messengers or has seen the sign-in screen keeps what they have.
const SYSTEM_LANGUAGE_FALLBACK = 'en'
function detectSystemLanguage () {
    const list = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || []
    for (const tag of list) {
        const base = String(tag || '').toLowerCase().split('-')[0]
        if (DICTIONARIES[base]) return base
    }
    return SYSTEM_LANGUAGE_FALLBACK
}

async function initI18n () {
    try {
        if (window.electronAPI?.storeGet) {
            const settings = await window.electronAPI.storeGet('settings', {})
            if (settings?.language && typeof settings.language === 'string') {
                currentLanguage = settings.language
            } else {
                const messengers = await window.electronAPI.storeGet('messengers', [])
                const seenAuth = await window.electronAPI.storeGet('onboardingAuthSeen', false)
                if (!(Array.isArray(messengers) && messengers.length) && !seenAuth) {
                    currentLanguage = detectSystemLanguage()
                    cachedDictionary = null
                    cachedLanguage = null
                    await window.electronAPI.storeSet('settings', { ...(settings || {}), language: currentLanguage })
                }
            }
        }
    } catch (error) {
        console.error('i18n init error:', error)
    }

    getDictionary()
}

function getCurrentLanguage () {
    return currentLanguage || 'ru'
}

function getDictionary () {
    const lang = getCurrentLanguage()

    if (cachedDictionary && cachedLanguage === lang) return cachedDictionary

    cachedDictionary = DICTIONARIES[lang] || DICTIONARIES.ru
    cachedLanguage   = lang

    return cachedDictionary
}

function tGet (key, params = {}) {
    if (!key || typeof key !== 'string') return ''

    const dict = getDictionary()
    const keys = key.split('.')
    let val = dict

    for (const k of keys) {
        val = val?.[k]
        if (val === undefined) return key
    }

    if (typeof val !== 'string') return key

    // Интерполяция {param}
    return val.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`))
}

function applyI18n (root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return
    renderConsentLabels(tGet)
    bindConsentLinks()

    root.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n
        if (!key) return
        el.textContent = tGet(key)
    })

    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
        const key = el.dataset.i18nPlaceholder
        if (!key) return
        el.placeholder = tGet(key)
    })

    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
        const key = el.dataset.i18nTitle
        if (!key) return
        el.title = tGet(key)
    })

    root.querySelectorAll('option[data-i18n]').forEach((el) => {
        const key = el.dataset.i18n
        if (!key) return
        el.textContent = tGet(key)
    })
}

module.exports = {
    setCurrentLanguage,
    initI18n,
      getCurrentLanguage,
    getDictionary,
    tGet,
    applyI18n,
}
