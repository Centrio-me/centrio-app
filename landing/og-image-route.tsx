// Dynamic Open Graph banner — generates a proper 1200x630 landscape image at
// a stable URL (https://centrio.me/api/og) instead of the 176x176 square
// /logo.png that every page's `openGraph.images` (via seo.ts's
// DEFAULT_OG_IMAGE) was falling back to. Square icon-as-banner is why link
// previews on Telegram/VK/WhatsApp/Twitter looked cramped/off — this fixes
// it site-wide in one place, since every page imports DEFAULT_OG_IMAGE
// rather than hardcoding its own image.
//
// This is a self-hosted Next.js app (pm2 + `next start`, not Vercel), so
// runtime is explicitly 'nodejs' — next/og's ImageResponse works fine
// self-hosted under Node, it doesn't require Vercel's edge network.
//
// Font: the default @vercel/og font has very limited Cyrillic coverage, and
// our tagline is in Russian, so we fetch Inter (the same family the site
// already uses via next/font/google in layout.tsx) with only the glyphs
// this image actually needs, following the standard Google Fonts loading
// pattern for @vercel/og. If that fetch fails for any reason (network
// hiccup, Google Fonts unreachable), we fall back to rendering with the
// default font rather than throwing — a broken/500 OG image is worse than
// a Cyrillic-with-fallback-glyphs one, and we've already shipped one "OG
// image completely 404s" bug this cycle (fixed 2026-08-03); this route
// should degrade, never hard-fail.
import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

const SITE_URL = 'https://centrio.me'
const TITLE = 'Centrio'
const TAGLINE = 'Все мессенджеры в одном окне'
const SUBTITLE = 'Telegram · WhatsApp · Discord · VK · Slack · MAX · 100+'

async function loadInter(text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Inter:wght@700&text=${encodeURIComponent(text)}`
    const css = await (await fetch(cssUrl)).text()
    const match = css.match(/src: url\(([^)]+)\) format\('(?:opentype|truetype)'\)/)
    if (!match) return null
    const fontRes = await fetch(match[1])
    if (fontRes.status !== 200) return null
    return await fontRes.arrayBuffer()
  } catch {
    return null
  }
}

export async function GET() {
  const fontData = await loadInter(`${TITLE}${TAGLINE}${SUBTITLE}`)

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '80px',
          background: 'linear-gradient(135deg, #06060f 0%, #0d0d1f 55%, #131328 100%)',
          fontFamily: fontData ? 'Inter' : 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 36 }}>
          <img src={`${SITE_URL}/logo.png`} width={72} height={72} style={{ borderRadius: 16 }} />
          <span style={{ fontSize: 44, fontWeight: 700, color: '#fafafa', letterSpacing: '-0.02em' }}>{TITLE}</span>
        </div>
        <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, color: '#fafafa', letterSpacing: '-0.03em', lineHeight: 1.15, maxWidth: 920 }}>
          {TAGLINE}
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: 'rgba(250,250,250,0.45)', marginTop: 28, letterSpacing: '-0.01em' }}>
          {SUBTITLE}
        </div>
        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: 6,
            background: 'linear-gradient(90deg, #6d5efc 0%, #22d3ee 100%)',
          }}
        />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: fontData ? [{ name: 'Inter', data: fontData, weight: 700, style: 'normal' }] : undefined,
    }
  )
}
