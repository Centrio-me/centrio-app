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
  title: 'Centrio — 所有聊天软件集于一窗',
  description:
    'Centrio 是一款适用于 Windows、macOS 和 Linux 的免费桌面应用，将 Telegram、WhatsApp、Discord、Slack、Notion 等 100 多个服务集成到一个窗口中。内置 VPN、云同步、文件夹管理。',
  alternates: {
    canonical: `${SITE_URL}/zh`,
    languages: LANGUAGE_ALTERNATES,
  },
  openGraph: {
    type: 'website',
    url: `${SITE_URL}/zh`,
    siteName: 'Centrio',
    locale: 'zh_CN',
    title: 'Centrio — 所有聊天软件集于一窗',
    description: '适用于 Windows、macOS 和 Linux 的免费桌面应用。Telegram、WhatsApp、Discord 等 100 多个服务集于一窗。',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Centrio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Centrio — 所有聊天软件集于一窗',
    description: 'Telegram、WhatsApp、Discord 等 100 多个服务。免费。Windows · macOS · Linux。',
    images: [OG_IMAGE],
  },
}

export default function ZhHomeLayout({ children }: { children: React.ReactNode }) {
  return children
}
