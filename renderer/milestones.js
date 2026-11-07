// What the person has already tried in the app. Kept on this computer and sent to the server once there is an account,
// so "first steps" work without signing in and achievements are not lost.
const STORE_KEY = 'milestones'
const REACH_EVENT = 'centrio-reach'
const CHANGE_EVENT = 'centrio-milestone'

// Keys the server accepts as achievements. Local-only ones (like "service") only drive the first steps.
const SERVER_KEYS = ['notification', 'split', 'folder', 'task', 'note', 'quick_reply', 'vpn', 'passwords', 'assistant', 'first_steps']

// Buttons that count as trying a feature: one press is enough for a badge.
const BUTTONS = {
    splitBtn: 'split',
    todosBtn: 'task',
    notesBtn: 'note',
    quickRepliesBtn: 'quick_reply',
    passwordsBtn: 'passwords',
    assistantBtn: 'assistant',
}

const SYNC_DELAY_MS = 1500

const isFilled = (value) => Array.isArray(value) && value.length > 0

// Things the server cannot see, read from what is already on this computer. Notification and split are left out on purpose:
// they open the first steps gift, and that one is only for really doing them.
const PAST_TRACES = {
    vpn: async (store) => !!(await store.getAsync('vpnActiveLink', null)) || isFilled(await store.getAsync('vpnSubLinks', [])) || !!(await store.getAsync('vpnSubUrl', null)),
    task: async (store) => isFilled((await store.getAsync('todos', null))?.items),
    quick_reply: async (store) => isFilled(await store.getAsync('quickReplies', [])),
    folder: async (store) => isFilled(await store.getAsync('folders', [])),
    passwords: async (store) => !!(await store.getAsync('pmVault', null)),
}

/** Any module can mark a step without knowing about the store. */
function reachMilestone(key) {
    document.dispatchEvent(new CustomEvent(REACH_EVENT, { detail: { key } }))
}

function createMilestones({ store, cloudStore, cloudApi, getServiceCount, onSynced }) {
    let syncTimer = null

    const all = () => store.get(STORE_KEY, {}) || {}
    const has = (key) => !!all()[key]

    async function sync() {
        if (!cloudStore.isLoggedIn()) return
        const keys = Object.keys(all()).filter((key) => SERVER_KEYS.includes(key))
        const result = await cloudApi.reportAchievements({ keys, services: getServiceCount() }).catch(() => null)
        if (result?.success && result.data) onSynced(result.data)
    }

    function scheduleSync() {
        clearTimeout(syncTimer)
        syncTimer = setTimeout(sync, SYNC_DELAY_MS)
    }

    function reach(key) {
        if (has(key)) return
        store.set(STORE_KEY, { ...all(), [key]: new Date().toISOString() })
        document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } }))
        scheduleSync()
    }

    /** Runs at every start and after signing in: reports what is new, the server counts the rest. */
    async function start() {
        const found = await Promise.all(Object.keys(PAST_TRACES).filter((key) => !has(key)).map(async (key) => ((await PAST_TRACES[key](store).catch(() => false)) ? key : null)))
        const keys = found.filter(Boolean)
        if (keys.length) store.set(STORE_KEY, { ...all(), ...Object.fromEntries(keys.map((key) => [key, new Date().toISOString()])) })
        scheduleSync()
    }

    document.addEventListener(REACH_EVENT, (e) => reach(e.detail.key))
    document.addEventListener('click', (e) => {
        const button = e.target.closest?.('button[id]')
        const key = button && BUTTONS[button.id]
        if (key) reach(key)
    }, true)

    return { has, reach, sync, start }
}

module.exports = { reachMilestone, createMilestones, CHANGE_EVENT }
