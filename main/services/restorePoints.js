'use strict'
// Restore points (3.7.1): copies of the person's setup — services, folders, split presets, settings, quick replies — that
// can be put back with one click. Made once a day on start, by hand, and right before a restore (so a restore can be
// undone). Kept as files in <userData>/restore-points, never sent anywhere. PIN, passwords, AI keys, VPN links and account
// tokens are not part of a point: putting an old copy of those back would be a security hazard, not a convenience.
const fs = require('fs')
const path = require('path')

const RESTORE_KEYS = [
    'messengers', 'folders', 'workspaces', 'activeWorkspaceId', 'tabOrder',
    'settings', 'globalProxy', 'vpnAppModes',
    'sidebarOrder', 'sidebarBarExpanded', 'menuCollapsed', 'dividers', 'rightbarLayout',
    'foldersEnabled', 'foldersStyle', 'folderColors', 'orgAssignedFolders', 'filesInWindows',
    'appZoomLevel', 'tabZoomLevel', 'extensionsState',
    'split', 'splitPresets', 'splitLeftPctPref', 'gridRowPctPref', 'gridSidePctPref', 'gridColAPref', 'gridColBPref',
    'mutedMessengers', 'globalMuteAll', 'quickReplies', 'todos', 'hibernate', 'workHours'
]
const REASONS = new Set(['daily', 'manual', 'before-restore'])
const ID_RE = /^rp-\d{13}-[a-z]+$/
const DAILY_EVERY_MS = 20 * 60 * 60 * 1000
const KEEP_AUTO = 7
const KEEP_MANUAL = 10
const KEEP_BEFORE_RESTORE = 3
// Keys whose saved value must be a list / an object; a point with anything else is damaged and is never applied.
const ARRAY_KEYS = new Set(['messengers', 'folders', 'workspaces', 'splitPresets', 'quickReplies', 'sidebarOrder', 'dividers', 'tabOrder'])
const OBJECT_KEYS = new Set(['settings', 'mutedMessengers', 'folderColors', 'orgAssignedFolders', 'filesInWindows', 'extensionsState', 'hibernate', 'workHours', 'rightbarLayout', 'split', 'globalProxy', 'vpnAppModes'])

function isSound(values) {
    if (!values || typeof values !== 'object' || Array.isArray(values)) return false
    for (const [key, value] of Object.entries(values)) {
        if (ARRAY_KEYS.has(key) && !Array.isArray(value)) return false
        if (OBJECT_KEYS.has(key) && (value === null || typeof value !== 'object')) return false
    }
    return true
}

const countOf = (value) => (Array.isArray(value) ? value.length : 0)

function summarize(values) {
    return {
        messengers: countOf(values.messengers),
        folders: countOf(values.folders),
        presets: countOf(values.splitPresets),
        quickReplies: countOf(values.quickReplies)
    }
}

function createRestorePoints({ store, dir, now = Date.now, keepAuto = KEEP_AUTO, keepManual = KEEP_MANUAL, keepBeforeRestore = KEEP_BEFORE_RESTORE, log = () => {} }) {
    const ensureDir = () => fs.mkdirSync(dir, { recursive: true })
    const fileOf = (id) => path.join(dir, `${id}.json`)

    function readPoint(id) {
        if (!ID_RE.test(String(id))) return null
        try {
            const point = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'))
            return point && typeof point.values === 'object' ? point : null
        } catch { return null }
    }

    function list() {
        let names = []
        try { names = fs.readdirSync(dir) } catch { return [] }
        return names
            .map((name) => name.replace(/\.json$/, ''))
            .filter((id) => ID_RE.test(id))
            .map((id) => readPoint(id))
            .filter(Boolean)
            .map(({ id, at, reason, summary }) => ({ id, at, reason, summary }))
            .sort((a, b) => b.at - a.at)
    }

    function prune() {
        const all = list()
        // Each kind is kept on its own, so restoring many times never pushes out the daily copies.
        const drop = [
            ...all.filter((p) => p.reason === 'daily').slice(keepAuto),
            ...all.filter((p) => p.reason === 'before-restore').slice(keepBeforeRestore),
            ...all.filter((p) => p.reason === 'manual').slice(keepManual)
        ]
        drop.forEach((p) => { try { fs.unlinkSync(fileOf(p.id)) } catch (e) { log(`[restore-points] prune ${p.id}: ${e.message}`) } })
    }

    function currentValues() {
        const values = {}
        for (const key of RESTORE_KEYS) if (store.has(key)) values[key] = store.get(key)
        return values
    }

    function create(reason) {
        const values = currentValues()
        if (!Object.keys(values).length) return null
        ensureDir()
        const at = now()
        const kind = REASONS.has(reason) ? reason : 'manual'
        const id = `rp-${String(at).padStart(13, '0')}-${kind.replace(/[^a-z]/g, '')}`
        const point = { id, at, reason: kind, summary: summarize(values), values }
        // Written whole or not at all: a crash or a full disk never leaves a half file behind.
        const tmp = `${fileOf(id)}.tmp`
        try {
            fs.writeFileSync(tmp, JSON.stringify(point))
            fs.renameSync(tmp, fileOf(id))
        } catch (e) {
            try { fs.unlinkSync(tmp) } catch { /* nothing written */ }
            throw e
        }
        prune()
        return { id, at, reason: kind, summary: point.summary }
    }

    function ensureDaily() {
        const last = list().find((p) => p.reason === 'daily')
        if (last && now() - last.at < DAILY_EVERY_MS) return null
        return create('daily')
    }

    function restore(id) {
        const point = readPoint(id)
        if (!point || !isSound(point.values)) return false
        create('before-restore')
        for (const key of RESTORE_KEYS) {
            if (Object.prototype.hasOwnProperty.call(point.values, key)) store.set(key, point.values[key])
            else store.delete(key)
        }
        // The restored copy is now the one the person wants: the cloud must take it, not overwrite it at the next sync.
        store.set('cloud.pendingLocalChanges', true)
        return true
    }

    function remove(id) {
        if (!ID_RE.test(String(id))) return false
        try { fs.unlinkSync(fileOf(id)); return true } catch { return false }
    }

    return { create, ensureDaily, list, restore, remove, dir }
}

module.exports = { createRestorePoints, RESTORE_KEYS, summarize }
