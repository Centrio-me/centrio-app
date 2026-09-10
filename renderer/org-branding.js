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
const LOGO_SELECTOR = '.app-logo, .startup-logo, .welcome-logo, .about-logo-img, .onb-logo'
const DEFAULT_SRC_ATTR = 'data-default-logo-src'

function applyOrgLogo(user) {
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
            if (el.src !== orgLogoUrl) el.src = orgLogoUrl
        } else {
            const defaultSrc = el.getAttribute(DEFAULT_SRC_ATTR)
            if (defaultSrc && el.getAttribute('src') !== defaultSrc) el.src = defaultSrc
        }
    })
}

module.exports = { applyOrgLogo }
