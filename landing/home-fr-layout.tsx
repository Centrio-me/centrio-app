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
  title: 'Centrio — Toutes vos messageries dans une seule fenêtre',
  description:
    "Centrio est une application de bureau gratuite pour Windows, macOS et Linux. Telegram, WhatsApp, Discord, Slack, Notion et plus de 100 services dans une seule fenêtre. VPN intégré, synchronisation cloud, dossiers.",
  alternates: {
    canonical: `${SITE_URL}/fr`,
    languages: LANGUAGE_ALTERNATES,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/fr`,
    siteName: 'Centrio',
    locale: 'fr_FR',
    title: 'Centrio — Toutes vos messageries dans une seule fenêtre',
    description: 'Application de bureau gratuite pour Windows, macOS et Linux. Telegram, WhatsApp, Discord et plus de 100 services dans une seule fenêtre.',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Centrio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Centrio — Toutes vos messageries dans une seule fenêtre',
    description: 'Telegram, WhatsApp, Discord et plus de 100 services. Gratuit. Windows · macOS · Linux.',
    images: [OG_IMAGE],
  },
}

export default function FrHomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
