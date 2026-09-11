'use strict'

const { session } = require('electron')
const store = require('./store')
const entitlement = require('./entitlement')

let log
try { log = require('electron-log') } catch { log = console }

// BUGFIX (2026-09-11, "Adblock вообще не работает. Реклама везде" — live
// user report): the toggle → 'update-adblock-state' → updateAllSessions()
// wiring was already correct (confirmed by tracing renderer/extensions-ui.js
// → renderer.js's onExtensionToggle → this file) — the actual problem was
// this list. ~20 domains covers a sliver of the real ad ecosystem; any site
// using literally anything else (which is most of them) showed ads
// completely unfiltered, reading as "doesn't work at all". Expanded to the
// major ad/tracking networks actually seen in the wild, including the
// Russian-market ones relevant to this app's audience (Yandex/VK/Mail.ru
// ad units, RTB House, etc. — separate from their non-ad product domains,
// which must stay reachable).
const AD_PATTERNS = [
    // ── Google ads/analytics ──
    '*://*.doubleclick.net/*',
    '*://*.google-analytics.com/*',
    '*://*.googlesyndication.com/*',
    '*://*.googleadservices.com/*',
    '*://*.googletagservices.com/*',
    '*://*.googletagmanager.com/*',
    '*://*.adservice.google.com/*',
    '*://*.pagead2.googlesyndication.com/*',
    '*://*.googleads.g.doubleclick.net/*',
    '*://*.securepubads.g.doubleclick.net/*',
    '*://*.ade.googlesyndication.com/*',
    '*://*.adsense.google.com/*',
    '*://*.adsmeasurement.google.com/*',

    // ── Social ad/tracking pixels ──
    '*://*.ads-twitter.com/*',
    '*://*.analytics.twitter.com/*',
    '*://*.ads-linkedin.com/*',
    '*://*.ads-youtube.com/*',
    '*://*.ads.facebook.com/*',
    '*://*.connect.facebook.net/*',
    '*://*.facebook.com/tr/*',
    '*://*.pixel.facebook.com/*',
    '*://*.snap.licdn.com/*',
    '*://*.px.ads.linkedin.com/*',
    '*://*.analytics.tiktok.com/*',
    '*://*.ads.tiktok.com/*',

    // ── Programmatic / RTB / ad exchanges ──
    '*://*.advertising.com/*',
    '*://*.adnxs.com/*',
    '*://*.carbonads.net/*',
    '*://*.openx.net/*',
    '*://*.scorecardresearch.com/*',
    '*://*.ads.pubmatic.com/*',
    '*://*.pubmatic.com/*',
    '*://*.ad-delivery.net/*',
    '*://*.adzerk.net/*',
    '*://*.rubiconproject.com/*',
    '*://*.casalemedia.com/*',
    '*://*.contextweb.com/*',
    '*://*.indexexchange.com/*',
    '*://*.sharethrough.com/*',
    '*://*.sovrn.com/*',
    '*://*.triplelift.com/*',
    '*://*.smartadserver.com/*',
    '*://*.criteo.com/*',
    '*://*.criteo.net/*',
    '*://*.taboola.com/*',
    '*://*.outbrain.com/*',
    '*://*.adroll.com/*',
    '*://*.admixer.net/*',
    '*://*.adition.com/*',
    '*://*.adform.net/*',
    '*://*.adcolony.com/*',
    '*://*.moatads.com/*',
    '*://*.adsafeprotected.com/*',
    '*://*.rtbhouse.com/*',
    '*://*.bidswitch.net/*',
    '*://*.turn.com/*',
    '*://*.mathtag.com/*',
    '*://*.media.net/*',
    '*://*.exponential.com/*',
    '*://*.bidr.io/*',
    '*://*.yieldmo.com/*',
    '*://*.gumgum.com/*',
    '*://*.propellerads.com/*',
    '*://*.popads.net/*',
    '*://*.adsterra.com/*',
    '*://*.exoclick.com/*',
    '*://*.trafficjunky.net/*',
    '*://*.juicyads.com/*',

    // ── Video-ad servers ──
    '*://*.tremorhub.com/*',
    '*://*.spotxchange.com/*',
    '*://*.springserve.com/*',
    '*://*.innovid.com/*',

    // ── Analytics/heatmap (bundled with most ad-tech, not core site function) ──
    '*://*.hotjar.com/*',
    '*://*.mouseflow.com/*',
    '*://*.crazyegg.com/*',
    '*://*.mixpanel.com/*',
    '*://*.segment.io/*',
    '*://*.amplitude.com/*',

    // ── Yandex/VK/Mail.ru ad units (their PRODUCT domains — mail.ru, vk.com,
    //    ya.ru itself — are deliberately NOT in this list, only the
    //    dedicated ad-serving subdomains/paths are) ──
    '*://*.yandex.ru/ads/*',
    '*://*.an.yandex.ru/*',
    '*://*.mc.yandex.ru/*',
    '*://*.yandexadexchange.net/*',
    '*://*.yandex.net/an/*',
    '*://*.strm.yandex.ru/*',
    '*://*.ads.vk.com/*',
    '*://*.vk-portal.net/*',
    '*://*.top-fwz1.mail.ru/*',
    '*://*.top-fwz2.mail.ru/*',
    '*://*.ad.mail.ru/*',
    '*://*.an.yandex.net/*',
    '*://*.betweendigital.com/*',
]

// FEATURE (2026-09-11, same "Adblock вообще не работает" report): network
// blocking alone leaves the ad SLOT behind — many sites reserve the space
// with a container div/iframe regardless of whether the ad script inside it
// loaded, so the user still sees an empty grey box (or worse, a partially
// broken ad that resolved via a domain not on the list above). This
// cosmetic layer hides common ad-container markup outright. Deliberately
// broad-but-common selectors (the same ones most basic cosmetic filter
// lists use) — not a full EasyList element-hiding parser, but real coverage
// for the overwhelming majority of ad slots without needing to ship/parse a
// third-party list.
const COSMETIC_CSS = `
    iframe[src*="doubleclick.net"], iframe[src*="googlesyndication.com"],
    iframe[src*="googleadservices.com"], iframe[id^="google_ads_iframe"],
    ins.adsbygoogle, div[id^="google_ads_iframe"],
    [id*="google_ads"], [class*="google-ad"],
    [id^="div-gpt-ad"], [class*="gpt-ad"],
    .adsbygoogle, .ad-container, .ad-wrapper, .ad-banner, .ad-slot,
    .advertisement, .advertisement-container, .banner-ad, .banner-ads,
    [class^="ad-"]:not([class*="adaptive"]):not([class*="address"]):not([class*="add"]),
    [class$="-ad"], [class*=" ad-"], [id^="ad-"], [id$="-ad"],
    [data-ad-slot], [data-ad-unit], [data-ad-client],
    iframe[src*="/ads/"], iframe[src*="adnxs.com"], iframe[src*="rubiconproject.com"],
    iframe[src*="criteo.com"], iframe[src*="taboola.com"], iframe[src*="outbrain.com"]
    { display: none !important; visibility: hidden !important; height: 0 !important; }
`

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
    updateAllSessions,
    COSMETIC_CSS
}
