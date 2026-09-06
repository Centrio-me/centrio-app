// Shared Open Graph image fallback.
//
// Every page that declares its own `openGraph` metadata object was omitting
// `images` entirely (Next.js does not deep-merge `openGraph` with the root
// layout's default when a page redeclares the object — it fully replaces
// it), so blog posts, pricing, faq, features and download had NO og:image
// meta tag at all: sharing those links on Telegram/VK/WhatsApp/Twitter
// rendered a plain text link card, not an image preview.
//
// Import DEFAULT_OG_IMAGE and spread it into each page's own `openGraph`
// object (`images: [DEFAULT_OG_IMAGE]`) so every page gets a working image.
//
// 2026-08-13: swapped the 176x176 /logo.png square fallback for the real
// 1200x630 landscape banner generated at request time by
// og-image-route.tsx (deployed to /api/og). If that route ever breaks,
// worst case is a slow/failed image fetch on link-share previews — nothing
// else on the site depends on this URL, so it degrades in isolation.
export const DEFAULT_OG_IMAGE = {
  url: 'https://centrio.me/api/og',
  width: 1200,
  height: 630,
  alt: 'Centrio — все мессенджеры в одном окне',
}
