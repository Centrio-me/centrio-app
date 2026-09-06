import type { Metadata } from 'next'
import { Geist, Bricolage_Grotesque } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const geist = Geist({ subsets: ['latin', 'cyrillic'], variable: '--font-geist' })
// Bricolage Grotesque has no `cyrillic` subset (only latin, latin-ext,
// vietnamese) — Turbopack silently ignored the invalid subset request,
// but webpack's next/font loader fails the build hard on it. Bricolage is
// only used for display/headline text (see .sh in page.tsx and friends),
// which falls back to var(--font-geist) for any Cyrillic glyphs anyway.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display' })

const SITE_URL = 'https://centrio.me'
// Fixed 2026-08-03: this used to point at /og-image.png, which does not
// exist on the server (404) — every social share (Telegram/VK/WhatsApp/
// Twitter link preview) rendered a broken-image icon instead of a card.
// Fixed again 2026-08-13: was /logo.png (working, but a 176x176 square used
// as a landscape banner). Now points at the dynamic 1200x630 banner from
// og-image-route.tsx (deployed to /api/og) — same URL landing/seo.ts's
// DEFAULT_OG_IMAGE now uses, so the root layout and every page stay in sync.
const OG_IMAGE = 'https://centrio.me/api/og'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Centrio — Все мессенджеры в одном окне',
    template: '%s | Centrio',
  },
  description:
    'Centrio — бесплатное десктопное приложение для Windows, macOS и Linux. Telegram, WhatsApp, Discord, VK, Slack, Notion и 100+ сервисов в одном окне. VPN, облачная синхронизация, папки.',
  keywords: [
    'мессенджер', 'агрегатор мессенджеров', 'все мессенджеры в одном',
    'telegram desktop', 'whatsapp desktop', 'discord', 'vk desktop',
    'centrio', 'centrio.me', 'приложение для мессенджеров',
    'мультимессенджер', 'messenger app', 'all messengers one window',
    'десктопное приложение', 'windows macos linux',
    'облачная синхронизация', 'vpn мессенджер',
  ],
  authors: [{ name: 'Centrio', url: SITE_URL }],
  creator: 'Centrio',
  publisher: 'Centrio',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  alternates: {
    canonical: SITE_URL,
    // Locale siblings — only the homepage has real translated routes so
    // far (see site-nav.ts LOCALIZED_ROUTES); every other page inherits
    // this root metadata and would otherwise declare hreflang alternates
    // that don't exist. Page-specific metadata (download-layout.tsx etc.)
    // already overrides `alternates` wholesale, so this only actually
    // takes effect on the homepage itself.
    languages: {
      ru: SITE_URL,
      en: `${SITE_URL}/en`,
      zh: `${SITE_URL}/zh`,
      fr: `${SITE_URL}/fr`,
      it: `${SITE_URL}/it`,
      'x-default': SITE_URL,
    },
  },
  icons: {
    icon: [
      { url: '/logo.png', type: 'image/png' },
    ],
    apple: '/logo.png',
    shortcut: '/logo.png',
  },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Centrio',
    locale: 'ru_RU',
    title: 'Centrio — Все мессенджеры в одном окне',
    description:
      'Бесплатное приложение для Windows, macOS и Linux. Telegram, WhatsApp, Discord, VK и 100+ сервисов в одном окне.',
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: 'Centrio' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Centrio — Все мессенджеры в одном окне',
    description: 'Telegram, WhatsApp, Discord, VK и 100+ сервисов. Бесплатно. Windows · macOS · Linux.',
    images: [OG_IMAGE],
  },
}

const JSONLD_ORG = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'Centrio',
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  email: 'support@centrio.me',
  // Was empty ([]) — added 2026-08-13. @centrioapp confirmed live via curl
  // as the real public channel (bio: "Официальная поддержка Centrio...",
  // matches lib/telegram-bot.js NEWS_CHAT_ID and the admin "news channel"
  // tab) — NOT t.me/centrio_app, which the homepage footer social icon was
  // wrongly linking to until the same commit fixed it in page.tsx.
  sameAs: ['https://t.me/centrioapp'],
}

const JSONLD_APP = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Centrio',
  operatingSystem: 'Windows, macOS, Linux',
  applicationCategory: 'CommunicationApplication',
  description:
    'Centrio — десктопное приложение, объединяющее Telegram, WhatsApp, Discord, VK, Slack, Notion и 100+ сервисов в одном окне. Встроенный VPN, облачная синхронизация, папки.',
  url: SITE_URL,
  downloadUrl: `${SITE_URL}/download`,
  softwareVersion: '2.5.2',
  offers: [
    { '@type': 'Offer', price: '0', priceCurrency: 'RUB', name: 'Free' },
    { '@type': 'Offer', price: '199', priceCurrency: 'RUB', name: 'Pro (ежемесячно)' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className="dark">
      <head>
        {/* Canonical is intentionally NOT hardcoded here — it used to be a
            static <link rel="canonical" href={SITE_URL}> that rendered on
            every single page (blog posts, pricing, features, etc.),
            producing two conflicting canonical tags per page since each
            page's own `metadata.alternates.canonical` also renders one.
            Two canonical tags is explicitly against Google's guidance and
            can cause the signal to be ignored entirely. The Metadata API's
            `alternates.canonical` above (default: SITE_URL, overridden per
            page) is the single source of truth now. */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD_ORG) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSONLD_APP) }}
        />
      </head>
      <body className={`${geist.className} ${geist.variable} ${display.variable}`} style={{ background: '#0b0a08', minHeight: '100vh' }}>
        {children}

        {/* Yandex.Metrika */}
        <Script id="ym-init" strategy="afterInteractive">{`
          (function(m,e,t,r,i,k,a){
            m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
          })(window,document,'script','https://mc.yandex.ru/metrika/tag.js?id=108785516','ym');
          ym(108785516,'init',{ssr:true,webvisor:true,clickmap:true,ecommerce:"dataLayer",referrer:document.referrer,url:location.href,accurateTrackBounce:true,trackLinks:true});
        `}</Script>
        <noscript>
          <div><img src="https://mc.yandex.ru/watch/108785516" style={{position:'absolute',left:'-9999px'}} alt="" /></div>
        </noscript>
      </body>
    </html>
  )
}
