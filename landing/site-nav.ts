// Single source of truth for the site's primary navigation and the
// cross-linked "compare" (vs-*) blog links.
//
// The site has three independent nav/footer implementations
// (SiteHeader.tsx, components/ui/site-shell.tsx, and the homepage's own
// inline nav in app/page.tsx) that used to hardcode their own copies of
// these link lists. That let them drift — e.g. the top nav's "Возможности"
// link pointed to `/#features` in SiteHeader.tsx but to `/features` in
// site-shell.tsx, and the homepage footer's comparison links were missing
// `vs-ferdium` entirely.
//
// Import MAIN_NAV / COMPARE_LINKS from here instead of re-declaring the
// array locally. Change a destination once, it updates everywhere that
// imports this file.

export interface NavItem {
  /** i18n key on the `t` object from useLang() */
  labelKey: 'nav_features' | 'nav_messengers' | 'nav_pricing' | 'nav_download' | 'nav_blog'
  href: string
}

// Canonical top-level navigation, used on every page except the homepage
// (the homepage links its own in-page anchor sections for messengers/
// pricing/download, which is an intentional same-page UX, not drift).
export const MAIN_NAV: NavItem[] = [
  { labelKey: 'nav_features',   href: '/features' },
  { labelKey: 'nav_messengers', href: '/#messengers' },
  { labelKey: 'nav_pricing',    href: '/pricing' },
  { labelKey: 'nav_download',   href: '/download' },
  { labelKey: 'nav_blog',       href: '/blog' },
]

export interface CompareLink {
  label: string
  href: string
}

// Comparison / "vs" blog posts, linked from footers and the blog index.
export const COMPARE_LINKS: CompareLink[] = [
  { label: 'vs Rambox',  href: '/blog/vs-rambox'  },
  { label: 'vs Franz',   href: '/blog/vs-franz'   },
  { label: 'vs Wavebox', href: '/blog/vs-wavebox' },
  { label: 'vs Ferdium', href: '/blog/vs-ferdium' },
]

// ── Multi-language routing ──────────────────────────────────────────────
// Russian is the default locale and stays unprefixed at its existing paths
// (never change these — they're already indexed). Other locales live at
// `/{lang}{canonicalPath}`. Only pages actually translated in i18n.ts's
// dictionary get a real route here — everywhere else, LangSwitcher falls
// back to its old client-side-only text swap instead of navigating to a
// URL that doesn't exist.
export const NON_DEFAULT_LANGS = ['en', 'zh', 'fr', 'it'] as const
export type NonDefaultLang = typeof NON_DEFAULT_LANGS[number]

export const LOCALIZED_ROUTES: ReadonlySet<string> = new Set([
  '/',
  '/download',
  '/blog/vs-franz',
  '/blog/vs-rambox',
  '/blog/vs-wavebox',
])

const LANG_PREFIX_RE = new RegExp(`^/(${NON_DEFAULT_LANGS.join('|')})(?=/|$)`)

// Strips a locale prefix (if any) back down to the canonical ru path —
// e.g. '/en/download' -> '/download', '/en' -> '/', '/pricing' -> '/pricing'.
export function canonicalPath(pathname: string): string {
  const stripped = pathname.replace(LANG_PREFIX_RE, '')
  return stripped === '' ? '/' : stripped
}

// Builds the URL for `targetLang` given the current canonical path — only
// meaningful when LOCALIZED_ROUTES.has(canonical) is true.
export function localizedHref(canonical: string, targetLang: string): string {
  if (targetLang === 'ru') return canonical
  return canonical === '/' ? `/${targetLang}` : `/${targetLang}${canonical}`
}
