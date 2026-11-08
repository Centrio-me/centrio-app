// Which sites belong together for team features (2026-11-08, moved out of vault.js so the strict-mode
// navigation lock uses the same list): a site, its own subdomains, and the sign-in providers it redirects to.
// Second-level labels that are themselves registry suffixes (co.uk, com.ru, spb.ru...): without this, a site on
// "firma.spb.ru" would be treated as the same site as ANY *.spb.ru page, which anyone can register.
const SUFFIX_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'spb', 'msk', 'nov', 'ru', 'ne', 'or', 'go'])
// Hosting services where every customer gets a subdomain: "alice.github.io" and "bob.github.io" are different sites.
const SHARED_HOSTING_SUFFIXES = ['github.io', 'gitlab.io', 'herokuapp.com', 'netlify.app', 'pages.dev', 'workers.dev', 'vercel.app', 'blogspot.com', 'myshopify.com', 'web.app', 'firebaseapp.com', 'appspot.com', 'azurewebsites.net', 'cloudfront.net', 'wordpress.com', 'wixsite.com', 'weebly.com', 'tilda.ws', 'ucoz.ru', 'narod.ru']

function baseDomain(hostname) {
    const host = String(hostname || '').toLowerCase()
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) return host // an IP address is its own site
    const parts = host.split('.').filter(Boolean)
    for (const suffix of SHARED_HOSTING_SUFFIXES) {
        if (host.endsWith('.' + suffix)) return parts.slice(-(suffix.split('.').length + 1)).join('.')
    }
    if (parts.length <= 2) return parts.join('.')
    const tld = parts[parts.length - 1]
    const second = parts[parts.length - 2]
    if (tld.length === 2 && SUFFIX_LABELS.has(second) && parts.length >= 3) return parts.slice(-3).join('.')
    return parts.slice(-2).join('.')
}

// Sign-in providers a site legitimately redirects to (their own domain differs from the site's).
const PROVIDER_DOMAINS = {
    'yandex.ru': ['yandex.ru', 'yandex.com', 'ya.ru'],
    'ya.ru': ['yandex.ru', 'yandex.com', 'ya.ru'],
    'mail.ru': ['mail.ru'],
    'vk.com': ['vk.com', 'vk.ru'],
    'vk.ru': ['vk.com', 'vk.ru'],
    'google.com': ['google.com'],
    'gmail.com': ['google.com']
}

function allowedBaseDomains(assignedUrl) {
    let host
    try { host = new URL(assignedUrl).hostname } catch { return [] }
    const base = baseDomain(host)
    return [...new Set([base, ...(PROVIDER_DOMAINS[base] || [])])]
}

module.exports = { baseDomain, allowedBaseDomains, PROVIDER_DOMAINS }
