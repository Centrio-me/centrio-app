'use strict'
// What AdBlock takes from the public filter lists (EasyList, RU AdList in the Adblock Plus syntax). Deliberately the safe part only:
//  - network rules that name a whole domain («||ads.example.com^»), and their exceptions («@@||example.com^»);
//  - cosmetic rules that hide an element by a plain selector («##.banner», «example.com##.ad-slot»).
// Path rules, regular expressions and the extended selectors (:has-text, :xpath…) are left out: a rule that cannot be applied
// exactly is not applied at all, so a page is never broken by a rule that was read wrong.
const NETWORK_OPTIONS_OK = new Set(['third-party', '3p', 'script', 'image', 'stylesheet', 'xmlhttprequest', 'subdocument', 'media', 'font', 'ping', 'other', 'popup'])
const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/
const EXTENDED_SELECTOR_RE = /:-abp-|:has-text|:contains\(|:xpath\(|:style\(|:remove\(|:matches-css|:-js\(|:upward\(|:min-text-length|:watch-attr|:nth-ancestor|:others\(|:not\(:|^\s*$|[{}<\\]/
const SELECTOR_RE = /^[\w\-.#[\]="':*>+~, ()^$|/@%!]+$/
const MAX_SELECTOR_LENGTH = 200

function parseNetworkRule(line, domains, exceptions) {
    const exception = line.startsWith('@@')
    const body = exception ? line.slice(2) : line
    if (!body.startsWith('||')) return
    const [pattern, options] = body.slice(2).split('$')
    if (options) {
        for (const option of options.split(',')) {
            const name = option.replace(/^~/, '')
            if (option.startsWith('~') || !NETWORK_OPTIONS_OK.has(name)) return // only options that do not narrow the rule by something we cannot see
        }
    }
    if (!pattern.endsWith('^')) return
    const host = pattern.slice(0, -1).toLowerCase()
    if (!HOST_RE.test(host)) return
    ;(exception ? exceptions : domains).add(host)
}

function parseCosmeticRule(line, generic, byHost) {
    const at = line.indexOf('##')
    if (at < 0 || line.includes('#@#') || line.includes('#?#') || line.includes('#$#')) return
    const selector = line.slice(at + 2).trim()
    if (!selector || selector.length > MAX_SELECTOR_LENGTH || EXTENDED_SELECTOR_RE.test(selector) || !SELECTOR_RE.test(selector)) return
    const hostsPart = line.slice(0, at).trim()
    if (!hostsPart) { generic.add(selector); return }
    for (const host of hostsPart.split(',')) {
        const h = host.trim().toLowerCase()
        if (!h || h.startsWith('~') || !HOST_RE.test(h)) continue
        if (!byHost.has(h)) byHost.set(h, new Set())
        byHost.get(h).add(selector)
    }
}

/**
 * @param {string[]} texts the lists, as downloaded
 * @returns {{ domains: Set<string>, generic: string[], byHost: Map<string, string[]> }}
 */
function parseLists(texts) {
    const domains = new Set()
    const exceptions = new Set()
    const generic = new Set()
    const byHost = new Map()
    for (const text of texts) {
        for (const raw of String(text || '').split('\n')) {
            const line = raw.trim()
            if (!line || line.startsWith('!') || line.startsWith('[')) continue
            if (line.includes('##') && !line.startsWith('||') && !line.startsWith('@@')) parseCosmeticRule(line, generic, byHost)
            else parseNetworkRule(line, domains, exceptions)
        }
    }
    for (const host of exceptions) domains.delete(host)
    return { domains, generic: [...generic], byHost: new Map([...byHost].map(([h, set]) => [h, [...set]])) }
}

/** True when the host, or a domain above it, is in the set: «cdn.ads.example.com» matches «ads.example.com» and «example.com». */
function isHostListed(domains, host) {
    let h = String(host || '').toLowerCase()
    while (h.includes('.')) {
        if (domains.has(h)) return true
        h = h.slice(h.indexOf('.') + 1)
    }
    return false
}

/** The selectors that hide elements on a host: the general ones (unless `skipGeneric`) and those written for it or the domains above it. */
function selectorsFor(rules, host, { skipGeneric = false } = {}) {
    const out = skipGeneric ? [] : [...rules.generic]
    let h = String(host || '').toLowerCase()
    while (h.includes('.')) {
        const own = rules.byHost.get(h)
        if (own) out.push(...own)
        h = h.slice(h.indexOf('.') + 1)
    }
    return out
}

/** One rule for every selector: a selector the page's engine does not understand spoils only its own rule. */
function toCss(selectors) {
    return selectors.map((s) => `${s}{display:none!important}`).join('\n')
}

module.exports = { parseLists, isHostListed, selectorsFor, toCss }
