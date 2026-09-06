import type { MetadataRoute } from 'next'

// Dynamic sitemap — replaces the old hand-maintained public/sitemap.xml, which
// had drifted out of date (missing /features, /refund, and 2 of the 4 blog
// posts that already existed). Generating this from a single list means new
// pages just need to be added here once; Next.js serves it at /sitemap.xml
// automatically and nothing can silently fall out of sync again.

const SITE_URL = 'https://centrio.me'

// Locale siblings for the homepage — kept in sync with site-nav.ts's
// LOCALIZED_ROUTES / NON_DEFAULT_LANGS and the four home-{lang}-layout.tsx
// metadata files. Only listed here for paths that actually have a
// translated route; everything else stays Russian-only and gets no
// `alternates` entry.
const HOME_LANGUAGES = {
  ru: SITE_URL,
  en: `${SITE_URL}/en`,
  zh: `${SITE_URL}/zh`,
  fr: `${SITE_URL}/fr`,
  it: `${SITE_URL}/it`,
  'x-default': SITE_URL,
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const pages: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
    { path: '/', changeFrequency: 'weekly', priority: 1.0 },
    { path: '/en', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/zh', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/fr', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/it', changeFrequency: 'weekly', priority: 0.9 },
    { path: '/download', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/pricing', changeFrequency: 'monthly', priority: 0.9 },
    { path: '/features', changeFrequency: 'monthly', priority: 0.8 },
    { path: '/faq', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog', changeFrequency: 'weekly', priority: 0.7 },
    { path: '/blog/who-needs-it', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/how-to-combine-messengers', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/messenger-vpn-guide', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/stop-switching-tabs', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/is-it-safe', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/remote-team-messengers', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/vs-rambox', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/vs-franz', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/vs-wavebox', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/vs-ferdium', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/top-apps', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/blog/multiple-accounts', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/telegram-vpn-block', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/best-messenger-aggregators', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/all-social-media-one-place', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/max-transition', changeFrequency: 'weekly', priority: 0.8 },
    { path: '/blog/whatsapp-telegram-ban-risk', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/blog/vs-station', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/blog/vs-shift', changeFrequency: 'monthly', priority: 0.6 },
    { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/refund', changeFrequency: 'yearly', priority: 0.3 },
  ]

  const HOME_PATHS = new Set(['/', '/en', '/zh', '/fr', '/it'])

  return pages.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
    ...(HOME_PATHS.has(path) ? { alternates: { languages: HOME_LANGUAGES } } : {}),
  }))
}
