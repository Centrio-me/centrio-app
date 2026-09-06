import type { Metadata } from 'next'

const SITE_URL = 'https://centrio.me'
const OG_IMAGE = `${SITE_URL}/api/og`

const LANGUAGE_ALTERNATES = {
  ru: SITE_URL,
  en: `${SITE_URL}/en`,
  zh: `${SITE_URL}/zh`,
  fr: `${SITE_URL}/fr`,
  it: `${SITE_URL}/it`,
  'x-default': SITE_URL,
}

export const metadata: Metadata = {
  title: "Centrio — Tutte le tue chat in un'unica finestra",
  description:
    "Centrio è un'app desktop gratuita per Windows, macOS e Linux. Telegram, WhatsApp, Discord, Slack, Notion e oltre 100 servizi in un'unica finestra. VPN integrata, sincronizzazione cloud, cartelle.",
  alternates: {
    canonical: `${SITE_URL}/it`,
    languages: LANGUAGE_ALTERNATES,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/it`,
    siteName: 'Centrio',
    locale: 'it_IT',
    title: "Centrio — Tutte le tue chat in un'unica finestra",
    description: "App desktop gratuita per Windows, macOS e Linux. Telegram, WhatsApp, Discord e oltre 100 servizi in un'unica finestra.",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Centrio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: "Centrio — Tutte le tue chat in un'unica finestra",
    description: 'Telegram, WhatsApp, Discord e oltre 100 servizi. Gratis. Windows · macOS · Linux.',
    images: [OG_IMAGE],
  },
}

export default function ItHomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
