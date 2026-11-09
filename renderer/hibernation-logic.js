// Hibernation (3.7.1): tabs nobody has opened for a while are put to sleep (their page is unloaded) and wake on a click.
// A sleeping page receives no messages, so by default only services that do not bring messages fall asleep
// (task lists, documents, AI chats, media), plus messengers whose notifications the person turned off.
const { popularMessengers } = require('./constants')

const MIN_MS = 60 * 1000
const MESSAGING = new Set(['messengers', 'mail'])
const HIBERNATE_DEFAULTS = Object.freeze({ afterMin: 30, scope: 'quiet' })
const AFTER_MIN_CHOICES = [0, 15, 30, 60, 120]

const hostOf = (url) => {
    try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

const CATALOG_HOSTS = popularMessengers
    .map((s) => [hostOf(s.url), s.category])
    .filter(([host, category]) => host && category)

/** Catalog category of a saved service, judged by its host; unknown sites count as messengers (the safe side). */
function serviceCategory(url) {
    const host = hostOf(url)
    if (!host) return 'messengers'
    // One direction only: a saved host may be a subdomain of a catalog host, never the other way round.
    const hit = CATALOG_HOSTS.find(([h]) => host === h || host.endsWith(`.${h}`))
    return hit ? hit[1] : 'messengers'
}

function normalizeSettings(raw) {
    const afterMin = AFTER_MIN_CHOICES.includes(Number(raw?.afterMin)) ? Number(raw.afterMin) : HIBERNATE_DEFAULTS.afterMin
    const scope = raw?.scope === 'all' ? 'all' : 'quiet'
    return { afterMin, scope }
}

function mayEverSleep(tab, scope) {
    if (tab.active || tab.inSplit || tab.detached || tab.audible || tab.orgAssigned) return false
    if ((tab.unread || 0) > 0) return false
    if (tab.hibernate === 'never') return false
    if (tab.hibernate === 'always' || scope === 'all') return true
    return tab.muted || !MESSAGING.has(serviceCategory(tab.url))
}

/**
 * Ids of the tabs to put to sleep now.
 * @param {Array<{id:string,url:string,active:boolean,inSplit:boolean,detached:boolean,unread:number,audible:boolean,
 *   orgAssigned:boolean,muted:boolean,lastActiveAt?:number,hibernate?:'never'|'always'}>} tabs awake tabs
 * @param {{afterMin:number, scope:'quiet'|'all'}} settings
 * @param {number} now
 * @param {number} [startedAt] app start, used for tabs never opened in this session
 */
function pickTabsToSleep(tabs, settings, now, startedAt = now) {
    const { afterMin, scope } = normalizeSettings(settings)
    if (!afterMin) return []
    const limit = afterMin * MIN_MS
    return tabs
        .filter((tab) => mayEverSleep(tab, scope))
        .filter((tab) => now - (Number(tab.lastActiveAt) || startedAt) >= limit)
        .map((tab) => tab.id)
}

module.exports = { serviceCategory, pickTabsToSleep, normalizeSettings, HIBERNATE_DEFAULTS, AFTER_MIN_CHOICES }
