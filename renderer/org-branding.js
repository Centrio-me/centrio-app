// FEATURE (2026-09-10, "Владелец сможет менять логотип программы на свой
// логотип" — TEAM owner-control epic). Swaps the app's own logo images for
// an org's custom logo (orgSummary.orgLogoUrl, set via PATCH /api/org/:id/logo)
// whenever the current user is a member of an org that has one set, and
// restores the default asset otherwise (org removed its logo, or the user
// logged out of that org account).
//
// .app-logo is special: main/window.js's injectAppLogo() sets its `src` to
// a local file:// path on every window did-finish-load, which runs BEFORE
// the cloud user (and therefore orgSummary) is ever known. This module only
// ever runs afterward, in the renderer, so it simply overwrites `src` again
// once the org logo is known — no coordination with main needed.
const { cleanBrandName } = require('../shared/org-brand')

const LOGO_SELECTOR = '.app-logo, .startup-logo, .welcome-logo, .about-logo-img, .onb-logo'
const DEFAULT_SRC_ATTR = 'data-default-logo-src'

function applyOrgLogo(user) {
    // not a member of a team (or signed out): the program's own name comes back
    if (!user?.orgSummary) applyBrandName('')
    const orgLogoUrl = user?.orgSummary?.orgLogoUrl || null
    const elements = document.querySelectorAll(LOGO_SELECTOR)

    elements.forEach((el) => {
        // Remember each element's own default src exactly once, before the
        // first override — .app-logo has none at load time (main injects it
        // later), so its "default" is simply whatever src it currently has
        // the first time we touch it.
        if (!el.hasAttribute(DEFAULT_SRC_ATTR)) {
            el.setAttribute(DEFAULT_SRC_ATTR, el.getAttribute('src') || '')
        }

        if (orgLogoUrl) {
            // BUGFIX (2026-09-17, live report — "Лого теперь видно в ЛК ТИМ, а
            // вот в приложении ломается"): the old `if (el.src !== orgLogoUrl)`
            // guard was a no-op optimization that became a real bug once the
            // server started rejecting this exact URL with a
            // Cross-Origin-Resource-Policy: same-origin header (fixed
            // server-side the same day, see centrio-api's index.js) — once
            // el.src had already been set to orgLogoUrl during a FAILED
            // attempt, this comparison was true (same string) and the element
            // was never told to load again, even after the server-side fix
            // went live and a fresh request would have succeeded. Assigning
            // unconditionally forces a real (re)load attempt every time this
            // runs; onerror falls back to the bundled default logo instead of
            // leaving a permanently broken image if the URL is ever genuinely
            // unreachable (deleted org logo file, offline, etc).
            el.onerror = () => {
                const defaultSrc = el.getAttribute(DEFAULT_SRC_ATTR)
                el.classList.remove('is-org-logo')
                if (defaultSrc) el.src = defaultSrc
            }
            // a company's own logo is usually a square picture with sharp corners: it is rounded like an app icon
            // (3.8.3, owner: «логотип компании нужно немного скруглять»)
            el.classList.add('is-org-logo')
            el.src = orgLogoUrl
        } else {
            el.classList.remove('is-org-logo')
            const defaultSrc = el.getAttribute(DEFAULT_SRC_ATTR)
            if (defaultSrc && el.getAttribute('src') !== defaultSrc) el.src = defaultSrc
        }
    })
}

// FEATURE (3.9.1, owner: «чтобы человек мог поменять и Центрио: иконку и название своей команды»): the name the owner gave to the
// program replaces «Centrio» wherever the program writes its own name — the title bar, the start screen, «О программе» — and
// the title of the window. What was there first (with its dot) is kept and comes back when the name is taken away. The name is
// cleaned again here, whatever the server sent (shared/org-brand.js).
const NAME_SELECTOR = '.app-name, .about-name, .sp-word'
const DEFAULT_HTML_ATTR = 'data-default-brand-html'

function applyBrandName(raw, doc = document) {
    const name = cleanBrandName(raw)
    doc.querySelectorAll(NAME_SELECTOR).forEach((el) => {
        if (!el.hasAttribute(DEFAULT_HTML_ATTR)) el.setAttribute(DEFAULT_HTML_ATTR, el.innerHTML)
        if (name) {
            el.textContent = name
            el.classList.add('is-team-name')
            el.setAttribute('title', name)
        } else {
            el.innerHTML = el.getAttribute(DEFAULT_HTML_ATTR)
            el.classList.remove('is-team-name')
            el.removeAttribute('title')
        }
    })
    if (typeof doc.title === 'string') {
        if (!applyBrandName.firstTitle) applyBrandName.firstTitle = doc.title
        doc.title = name || applyBrandName.firstTitle
    }
}

module.exports = { applyOrgLogo, applyBrandName }
