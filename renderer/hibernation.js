// Hibernation controller (3.7.1): once a minute checks which tabs nobody has opened for a while and puts them to sleep.
// The rules live in hibernation-logic.js; here we only collect the facts about every tab and call the tab manager's sleep.
const { pickTabsToSleep, normalizeSettings } = require('./hibernation-logic')

const TICK_MS = 60 * 1000

function createHibernation({ state, store, sleepTab, isMessengerMuted }) {
    const startedAt = Date.now()
    const lastActiveAt = new Map()

    const readSettings = () => {
        const raw = store.get('hibernate', {}) || {}
        return { ...normalizeSettings(raw), perTab: raw.perTab && typeof raw.perTab === 'object' ? raw.perTab : {} }
    }

    const inSplit = (id) => state.splitMode && (state.splitTabId === id || (Array.isArray(state.splitZoneIds) && state.splitZoneIds.includes(id)))
    const isActive = (id) => state.activeTabId === id

    function audible(id) {
        try { return !!document.getElementById(`webview-${id}`)?.isCurrentlyAudible?.() } catch { return false }
    }

    function markUsedNow() {
        const now = Date.now()
        state.activeMessengers.forEach((m) => { if (isActive(m.id) || inSplit(m.id)) lastActiveAt.set(m.id, now) })
    }

    function collectAwakeTabs(perTab) {
        return state.activeMessengers
            .filter((m) => !state.sleepingTabs.has(m.id) && document.getElementById(`webview-${m.id}`))
            .map((m) => ({
                id: m.id,
                url: m.url,
                active: isActive(m.id),
                inSplit: inSplit(m.id),
                detached: state.detachedTabs?.has?.(m.id) || false,
                unread: state.unreadCounts?.[m.id] || 0,
                audible: audible(m.id),
                orgAssigned: !!m.orgAssigned,
                muted: typeof isMessengerMuted === 'function' ? isMessengerMuted(m.id) : false,
                lastActiveAt: lastActiveAt.get(m.id),
                hibernate: perTab[m.id]
            }))
    }

    function tick() {
        markUsedNow()
        const settings = readSettings()
        const ids = pickTabsToSleep(collectAwakeTabs(settings.perTab), settings, Date.now(), startedAt)
        ids.forEach((id) => { if (sleepTab(id)) lastActiveAt.delete(id) })
        return ids
    }

    function setSettings(patch) {
        const current = store.get('hibernate', {}) || {}
        const next = { ...current, ...normalizeSettings({ ...current, ...patch }) }
        store.set('hibernate', next)
        return readSettings()
    }

    /** choice: 'never' | 'always' | 'auto' */
    function setTabChoice(id, choice) {
        const current = store.get('hibernate', {}) || {}
        const perTab = { ...(current.perTab || {}) }
        if (choice === 'never' || choice === 'always') perTab[id] = choice
        else delete perTab[id]
        store.set('hibernate', { ...current, perTab })
    }

    const getTabChoice = (id) => readSettings().perTab[id] || 'auto'

    // A tab opened by the person counts as used right away (not only at the next tick).
    document.addEventListener('centrio-tab-switched', (e) => { if (e.detail?.id) lastActiveAt.set(e.detail.id, Date.now()) })
    setInterval(tick, TICK_MS)

    return { tick, readSettings, setSettings, setTabChoice, getTabChoice }
}

module.exports = { createHibernation }
