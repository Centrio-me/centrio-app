'use strict'

const { session } = require('electron')
const store = require('./store')
const entitlement = require('./entitlement')

let log
try { log = require('electron-log') } catch { log = console }

// Basic ad/tracker blocking list (simplified)
const AD_PATTERNS = [
    '*://*.doubleclick.net/*',
    '*://*.google-analytics.com/*',
    '*://*.googlesyndication.com/*',
    '*://*.googleadservices.com/*',
    '*://*.googletagservices.com/*',
    '*://*.googletagmanager.com/*',
    '*://*.ads.pubmatic.com/*',
    '*://*.ad-delivery.net/*',
    '*://*.adzerk.net/*',
    '*://*.adservice.google.com/*',
    '*://*.ads-twitter.com/*',
    '*://*.analytics.twitter.com/*',
    '*://*.ads-linkedin.com/*',
    '*://*.ads-youtube.com/*',
    '*://*.advertising.com/*',
    '*://*.adnxs.com/*',
    '*://*.carbonads.net/*',
    '*://*.openx.net/*',
    '*://*.scorecardresearch.com/*',
    '*://*.yandex.ru/ads/*',
    '*://*.an.yandex.ru/*',
    '*://*.mc.yandex.ru/*',
]

function isEnabled() {
    // AdBlock status is controlled via extensionsState.adblock, but that flag
    // alone is not trustworthy: it's the same object the renderer needs
    // write-access to for legitimate reasons (toggling any of the other
    // extensions), and main.js's store:set backstop only strips it going
    // forward — a store file hand-edited while the app is closed, or a stale
    // `true` left over from before a Pro downgrade the backstop hasn't seen
    // yet, would otherwise still flip real ad-blocking on for a free user.
    // Re-check entitlement here too, at the actual point of enforcement.
    if (!entitlement.isEffectivePro()) return false
    const state = store.get('extensionsState', {})
    return state.adblock === true
}

function applyToSession(sess) {
    if (!sess || !sess.webRequest) return

    if (!isEnabled()) {
        try { sess.webRequest.onBeforeRequest(null); } catch(e) {}
        return
    }

    sess.webRequest.onBeforeRequest({ urls: AD_PATTERNS }, (details, callback) => {
        log.info(`[adblock] Blocking: ${details.url}`)
        callback({ cancel: true })
    })
}

function updateAllSessions() {
    const { session: electronSession } = require('electron')

    // Default session
    applyToSession(electronSession.defaultSession)

    // All messenger sessions
    const messengers = store.get('messengers', [])
    for (const m of messengers) {
        try {
            const sess = electronSession.fromPartition(`persist:${m.id}`)
            applyToSession(sess)
        } catch(e) {}
    }
}

module.exports = {
    isEnabled,
    applyToSession,
    updateAllSessions
}
