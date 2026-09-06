import type { Metadata } from 'next'

const SITE_URL = 'https://centrio.me'
const OG_IMAGE = `${SITE_URL}/api/og`

// hreflang map — identical across all four home-{lang}-layout.tsx files by
// design (each locale page must declare the full set of alternates, not
// just itself, or Google won't treat them as one cluster). Keep in sync
// with site-nav.ts's LOCALIZED_ROUTES / NON_DEFAULT_LANGS if routes change.
const LANGUAGE_ALTERNATES = {
  ru: SITE_URL,
  en: `${SITE_URL}/en`,
  zh: `${SITE_URL}/zh`,
  fr: `${SITE_URL}/fr`,
  it: `${SITE_URL}/it`,
  'x-default': SITE_URL,
}

export const metadata: Metadata = {
  title: 'Centrio — All Your Messengers in One Window',
  description:
    'Centrio is a free desktop app for Windows, macOS and Linux. Telegram, WhatsApp, Discord, Slack, Notion and 100+ services in one window. Built-in VPN, cloud sync, folders.',
  alternates: {
    canonical: `${SITE_URL}/en`,
    languages: LANGUAGE_ALTERNATES,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/en`,
    siteName: 'Centrio',
    locale: 'en_US',
    title: 'Centrio — All Your Messengers in One Window',
    description: 'Free desktop app for Windows, macOS and Linux. Telegram, WhatsApp, Discord and 100+ services in one window.',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Centrio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Centrio — All Your Messengers in One Window',
    description: 'Telegram, WhatsApp, Discord and 100+ services. Free. Windows · macOS · Linux.',
    images: [OG_IMAGE],
  },
}

export default function EnHomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
