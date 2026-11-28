'use strict'
// AdBlock's public filter lists (EasyList, EasyPrivacy, RU AdList): downloaded every few days, kept on the disk, read at start.
// They add to the built-in rules of adblock.js: whole domains of ad and tracking networks (checked on every request of a page, never on
// the page itself) and the elements that sites put ads in (hidden on those sites only, by the rules written for them).
// What is read from the lists is described in shared/adblock-rules.js.
const { app, net } = require('electron')
const fs = require('fs')
const path = require('path')
const store = require('./store')
const { parseLists, isHostListed, selectorsFor, toCss } = require('../../shared/adblock-rules')

let log
try { log = require('electron-log') } catch { log = console }

const KEY = 'adblockLists'
const LISTS = [
    { id: 'easylist', url: 'https://easylist.to/easylist/easylist.txt' },
    { id: 'easyprivacy', url: 'https://easylist.to/easylist/easyprivacy.txt' },
    { id: 'ruadlist', url: 'https://easylist-downloads.adblockplus.org/ruadlist.txt' }
]
const STALE_MS = 24 * 60 * 60 * 1000 // the lists are fetched again when they are a day old
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000 // and the age is looked at every few hours while the app runs
const FIRST_UPDATE_DELAY_MS = 40 * 1000
const DOWNLOAD_TIMEOUT_MS = 30 * 1000
const MAX_LIST_BYTES = 12 * 1024 * 1024
const SAVE_COUNT_EVERY = 50
// Services whose pages are applications, not sites with banners: no element of theirs is hidden by a rule written for the whole web
// (neither the general rules nor those of the site). Requests are filtered everywhere.
const APP_HOSTS = /(^|\.)(web\.telegram\.org|telegram\.org|whatsapp\.com|max\.ru|discord\.com|slack\.com|notion\.so|figma\.com|github\.com)$/

let rules = null
let updating = false
let blockedSinceSave = 0

function read() {
    const raw = store.get(KEY, {}) || {}
    return {
        enabled: raw.enabled !== false,
        cosmetic: raw.cosmetic !== false,
        updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : 0,
        blocked: Number.isFinite(raw.blocked) ? raw.blocked : 0
    }
}

function write(patch) {
    store.set(KEY, { ...read(), ...patch })
}

function dir() {
    return path.join(app.getPath('userData'), 'adblock-lists')
}

function loadFromDisk() {
    const texts = []
    for (const list of LISTS) {
        try { texts.push(fs.readFileSync(path.join(dir(), `${list.id}.txt`), 'utf8')) } catch { /* not downloaded yet */ }
    }
    rules = texts.length ? parseLists(texts) : null
    if (rules) log.info(`[adblock-lists] ${rules.domains.size} domains, ${rules.byHost.size} sites with their own rules`)
}

async function download(list) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)
    try {
        const res = await net.fetch(list.url, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        if (text.length > MAX_LIST_BYTES || !text.includes('!')) throw new Error('not a filter list')
        return text
    } finally {
        clearTimeout(timer)
    }
}

/** Downloads the lists again (all of them, or none when the network does not answer) and reads them. */
async function update() {
    if (updating) return status()
    updating = true
    try {
        fs.mkdirSync(dir(), { recursive: true })
        let saved = 0
        for (const list of LISTS) {
            try {
                fs.writeFileSync(path.join(dir(), `${list.id}.txt`), await download(list))
                saved += 1
            } catch (err) { log.warn(`[adblock-lists] ${list.id}: ${err && err.message}`) }
        }
        if (saved) { write({ updatedAt: Date.now() }); loadFromDisk() }
    } finally {
        updating = false
    }
    return status()
}

function init() {
    loadFromDisk()
    const refreshIfOld = () => {
        const cfg = read()
        if (cfg.enabled && Date.now() - cfg.updatedAt > STALE_MS) update().catch(() => {})
    }
    setTimeout(refreshIfOld, FIRST_UPDATE_DELAY_MS)
    setInterval(refreshIfOld, CHECK_EVERY_MS).unref()
}

const isOn = () => read().enabled && !!rules

const sameSite = (a, b) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)

/** Should this request of a page be stopped? Never the page itself, never a request to the site the page is on. */
function shouldBlock(details) {
    if (!isOn() || details.resourceType === 'mainFrame') return false
    let host
    try { host = new URL(details.url).hostname } catch { return false }
    if (!isHostListed(rules.domains, host)) return false
    try { if (details.referrer && sameSite(new URL(details.referrer).hostname, host)) return false } catch { /* no referrer */ }
    blockedSinceSave += 1
    if (blockedSinceSave >= SAVE_COUNT_EVERY) { write({ blocked: read().blocked + blockedSinceSave }); blockedSinceSave = 0 }
    return true
}

/** The rules of the site that hide its ad elements, as a style sheet ('' when there is nothing to hide) */
function cosmeticCss(pageUrl) {
    const cfg = read()
    if (!cfg.enabled || !cfg.cosmetic || !rules) return ''
    let host
    try { host = new URL(pageUrl).hostname } catch { return '' }
    const selectors = selectorsFor(rules, host, { skipGeneric: true })
    return selectors.length && !APP_HOSTS.test(host) ? toCss(selectors) : ''
}

function status() {
    const cfg = read()
    return {
        enabled: cfg.enabled, cosmetic: cfg.cosmetic, updatedAt: cfg.updatedAt, blocked: cfg.blocked + blockedSinceSave,
        domains: rules ? rules.domains.size : 0, sites: rules ? rules.byHost.size : 0, updating
    }
}

function setOptions({ enabled, cosmetic }) {
    const patch = {}
    if (typeof enabled === 'boolean') patch.enabled = enabled
    if (typeof cosmetic === 'boolean') patch.cosmetic = cosmetic
    write(patch)
    return status()
}

module.exports = { init, update, shouldBlock, cosmeticCss, status, setOptions, isOn }
