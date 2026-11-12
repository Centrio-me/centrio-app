'use strict'
// One account, one profile. Signing out puts the account's whole local profile aside and restarts the app as new;
// signing in to that account brings it back. The next person on this computer never sees the previous one's
// messengers, folders, PIN, downloads or settings, and those never reach their account through the cloud sync.
//
// Messenger logins stay on disk in their own persist:<messenger id> partitions: a partition is opened only by a
// messenger of the profile that owns it, so signing back in does not mean logging in to every messenger again.
//
// A full restart rather than a window reload: the main process holds profile state in memory too (running VPN,
// unlocked password vault, downloads, team partitions).
const { app, ipcMain } = require('electron')
const store = require('../services/store')

const PROFILE_KEYS = [
    'messengers', 'folders', 'workspaces', 'activeTabId', 'activeWorkspaceId', 'tabOrder',
    'settings', 'security', 'lockOnStartup', 'pinEnabled', 'pinHash', 'lockBackground',
    'globalProxy', 'vpnActiveLink', 'vpnAppModes', 'vpnSubLinks', 'vpnSubUrl',
    'sidebarOrder', 'sidebarBarExpanded', 'menuCollapsed', 'dividers', 'rightbarLayout',
    'foldersEnabled', 'foldersStyle', 'folderColors', 'orgAssignedFolders', 'filesInWindows',
    'appZoomLevel', 'tabZoomLevel', 'extensionsState',
    'split', 'splitPresets', 'splitLeftPctPref', 'gridRowPctPref', 'gridSidePctPref', 'gridColAPref', 'gridColBPref',
    'mutedMessengers', 'globalMuteAll', 'dndUntil', 'dndLastHours',
    'quickReplies', 'todos', 'pmVault', 'assistant', 'messengerNotifHistory', 'downloadsHistory',
    'milestones', 'firstStepsActive', 'firstStepsCollapsed', 'hintsSeen',
    // «Все мессенджеры»: on/off and own folders (3.8.3) — the folders point at this account's tabs
    'allInbox'
]
// Removed but not worth keeping: the first-run flag, and a copy of the profile made before a cloud apply.
const WIPE_ONLY_KEYS = ['backup', 'onboardingAuthSeen']
const SNAPSHOTS_KEY = 'profileSnapshots'
const OWNER_KEY = 'profileOwnerId'
const USER_ID = /^[\w-]{1,64}$/
const RESTART_DELAY_MS = 150

// While the profile is being replaced the page must not write its old state back into the store.
let replacing = false

const isProfileBeingReplaced = () => replacing

function currentUserId() {
    const id = store.get('cloud.user')?.id
    return typeof id === 'string' && USER_ID.test(id) ? id : null
}

function saveSnapshot(userId, pushed) {
    const values = {}
    for (const key of PROFILE_KEYS) {
        if (store.has(key)) values[key] = store.get(key)
    }
    store.set(`${SNAPSHOTS_KEY}.${userId}`, { at: new Date().toISOString(), pushed: !!pushed, values })
}

function wipeProfile() {
    const language = store.get('settings.language') // a language belongs to the computer, like the window size
    for (const key of [...PROFILE_KEYS, ...WIPE_ONLY_KEYS]) store.delete(key)
    if (language) store.set('settings.language', language)
}

function restoreSnapshot(userId) {
    const path = `${SNAPSHOTS_KEY}.${userId}`
    const snapshot = store.get(path)
    if (!snapshot || typeof snapshot.values !== 'object') return false
    for (const [key, value] of Object.entries(snapshot.values)) {
        if (PROFILE_KEYS.includes(key)) store.set(key, value)
    }
    // The cloud did not get the last changes at sign-out: this copy is the newer one.
    if (!snapshot.pushed) store.set('cloud.pendingLocalChanges', true)
    store.delete(path)
    return true
}

function restartApp() {
    setTimeout(() => {
        app.relaunch()
        app.quit()
    }, RESTART_DELAY_MS)
}

function registerProfileIpc() {
    // Accounts signed in before this version have no recorded owner yet.
    const signedIn = currentUserId()
    if (signedIn && !store.get(OWNER_KEY)) store.set(OWNER_KEY, signedIn)

    ipcMain.handle('profile:sign-out', async (_event, userId, pushed) => {
        replacing = true
        try {
            if (typeof userId === 'string' && USER_ID.test(userId)) saveSnapshot(userId, pushed)
            wipeProfile()
            store.delete('cloud')
            store.delete(OWNER_KEY)
        } finally {
            restartApp()
        }
        return { success: true }
    })

    // Runs after every sign-in. The account comes from what main itself received from the server, never from the page.
    ipcMain.handle('profile:signed-in', async () => {
        const userId = currentUserId()
        if (!userId) return { success: false, restarting: false }
        const owner = store.get(OWNER_KEY)
        // Owner already set and nothing saved: an ordinary sign-in. A saved profile still has to come back even if the
        // app was closed right after signing in and this account was recorded as the owner at the next start.
        if (owner === userId && !store.has(`${SNAPSHOTS_KEY}.${userId}`)) return { success: true, restarting: false }

        replacing = true
        let changed = false
        // Signed out by an expired session and now someone else signs in: the previous profile must not stay here.
        if (owner && owner !== userId && USER_ID.test(owner)) {
            saveSnapshot(owner, false)
            wipeProfile()
            changed = true
        }
        if (restoreSnapshot(userId)) changed = true
        store.set(OWNER_KEY, userId)
        if (changed) restartApp()
        else replacing = false
        return { success: true, restarting: changed }
    })
}

module.exports = { registerProfileIpc, isProfileBeingReplaced, PROFILE_KEYS }
