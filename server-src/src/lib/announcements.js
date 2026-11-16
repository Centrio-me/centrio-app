'use strict'
// The store of in-app windows: one JSON file (written whole, atomically) and the events in the event log.
// The rules themselves are in announcements-logic.js.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { normalizeCampaign, isActiveNow, audienceMatches, publicView, tally } = require('./announcements-logic')
const { appendEvent, readEvents } = require('./event-log')

const FILE = process.env.ANNOUNCEMENTS_FILE || path.join(__dirname, '..', '..', 'data', 'announcements.json')
const EVENTS = 'announcement-events'
const MAX_CAMPAIGNS = 200
const STATS_WINDOW_MS = 400 * 24 * 3600 * 1000

function readAll() {
    try {
        const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'))
        return Array.isArray(raw.campaigns) ? raw.campaigns : []
    } catch (err) {
        if (err.code !== 'ENOENT') console.error('[announcements] cannot read the file:', err.message)
        return []
    }
}

function writeAll(campaigns) {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    const temp = `${FILE}.tmp`
    fs.writeFileSync(temp, JSON.stringify({ campaigns }, null, 1) + '\n')
    fs.renameSync(temp, FILE)
}

function list() {
    const stats = tally(readEvents(EVENTS, Date.now() - STATS_WINDOW_MS))
    const zero = { shown: 0, click: 0, close: 0, reopen: 0 }
    return readAll().map((c) => ({ ...c, stats: stats[c.id] || zero })).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
}

function create(input) {
    const r = normalizeCampaign(input)
    if (!r.ok) return r
    const all = readAll()
    if (all.length >= MAX_CAMPAIGNS) return { ok: false, error: 'Слишком много окон, удалите старые' }
    const now = new Date().toISOString()
    const campaign = { id: crypto.randomBytes(6).toString('hex'), ...r.value, createdAt: now, updatedAt: now }
    writeAll([...all, campaign])
    return { ok: true, value: campaign }
}

function update(id, input) {
    const all = readAll()
    const old = all.find((c) => c.id === id)
    if (!old) return { ok: false, error: 'Окно не найдено', notFound: true }
    const r = normalizeCampaign(input)
    if (!r.ok) return r
    const campaign = { ...old, ...r.value, id, updatedAt: new Date().toISOString() }
    writeAll(all.map((c) => (c.id === id ? campaign : c)))
    return { ok: true, value: campaign }
}

function remove(id) {
    const all = readAll()
    if (!all.some((c) => c.id === id)) return false
    writeAll(all.filter((c) => c.id !== id))
    return true
}

/** The windows for a person, newest first: what the app shows (one on start) and decorates the logo with. */
function activeFor(who, now = Date.now()) {
    return readAll()
        .filter((c) => isActiveNow(c, now) && audienceMatches(c.audience, who))
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .map(publicView)
}

function exists(id) { return readAll().some((c) => c.id === id) }

function logEvent(id, event, who) {
    appendEvent(EVENTS, { at: new Date().toISOString(), id, event, who })
}

module.exports = { list, create, update, remove, activeFor, exists, logEvent }
