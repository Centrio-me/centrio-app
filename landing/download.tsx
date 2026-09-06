'use client'

import { useState, useEffect } from 'react'
import type React from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { SiteNav, SiteFooter } from '@/components/ui/site-shell'
import { useLang } from '@/lib/i18n'
import { CHANGELOG } from './changelog-data'

const VERSION = '2.5.2'

const URLS = {
  win:       `https://download.centrio.me/Centrio%20Setup%20${VERSION}.exe`,
  mac:       `https://download.centrio.me/mac/Centrio-${VERSION}.dmg`,
  linux_app: `https://download.centrio.me/linux/Centrio-${VERSION}.AppImage`,
  linux_deb: `https://download.centrio.me/linux/messengerapp_${VERSION}_amd64.deb`,
}

const EASE = 'easeOut' as const
const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
}
const fadeUpDelay = (d: number) => ({
  hidden: { opacity: 0, y: 32 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE, delay: d } },
})

const WinIcon = ({ size = 32 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
  </svg>
)

const MacIcon = ({ size = 32 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={size} height={size}>
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
  </svg>
)

const LinuxIcon = ({ size = 32 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 16 16">
    <path d="M2.273 9.53a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.547Zm9.467-4.984a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546M7.4 13.108a5.54 5.54 0 0 1-3.775-2.88 3.27 3.27 0 0 1-1.944.24 7.4 7.4 0 0 0 5.328 4.465c.53.113 1.072.169 1.614.166a3.25 3.25 0 0 1-.666-1.9 6 6 0 0 1-.557-.091m3.828 2.285a2.273 2.273 0 1 0 0-4.546 2.273 2.273 0 0 0 0 4.546m3.163-3.108a7.44 7.44 0 0 0 .373-8.726 3.3 3.3 0 0 1-1.278 1.498 5.57 5.57 0 0 1-.183 5.535 3.26 3.26 0 0 1 1.088 1.693M2.098 3.998a3.3 3.3 0 0 1 1.897.486 5.54 5.54 0 0 1 4.464-2.388c.037-.67.277-1.313.69-1.843a7.47 7.47 0 0 0-7.051 3.745"/>
  </svg>
)

const DownloadIcon = ({ size = 16 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width={size} height={size}>
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>
)

type OS = 'win' | 'mac' | 'linux'

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Скачать', item: 'https://centrio.me/download' },
  ],
}

export default function DownloadPage() {
  const { t } = useLang()
  const [detectedOs, setDetectedOs] = useState<OS | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    if (/Windows/i.test(ua)) setDetectedOs('win')
    else if (/Mac/i.test(ua)) setDetectedOs('mac')
    else if (/Linux/i.test(ua)) setDetectedOs('linux')
  }, [])

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Platform data with translated text
  const platforms = [
    {
      id: 'win' as OS,
      name: 'Windows',
      icon: <WinIcon />,
      color: '#60a5fa',
      glow: 'rgba(96,165,250,0.3)',
      rgb: '96,165,250',
      badge: 'NSIS Installer · x64',
      req: 'Windows 10 / 11 · x64',
      size: '~85 MB',
      primary: { label: t.dl_btn_win, url: URLS.win },
      steps: [t.dl_step_win1, t.dl_step_win2, t.dl_step_win3],
    },
    {
      id: 'mac' as OS,
      name: 'macOS',
      icon: <MacIcon />,
      color: '#c0c0cc',
      glow: 'rgba(192,192,204,0.2)',
      rgb: '192,192,204',
      badge: 'DMG · Universal',
      req: 'macOS 12 Monterey+',
      size: '~110 MB',
      primary: { label: t.dl_btn_mac, url: URLS.mac },
      steps: [t.dl_step_mac1, t.dl_step_mac2, t.dl_step_mac3],
      note: t.dl_mac_note,
    },
    {
      id: 'linux' as OS,
      name: 'Linux',
      icon: <LinuxIcon />,
      color: '#fb923c',
      glow: 'rgba(251,146,60,0.25)',
      rgb: '251,146,60',
      badge: 'AppImage · deb · x64',
      req: 'Ubuntu 20.04+, Debian, Arch',
      size: '~112 MB',
      primary: { label: t.dl_btn_appimage, url: URLS.linux_app },
      secondary: { label: t.dl_btn_deb, url: URLS.linux_deb },
      steps: ['chmod +x Centrio-*.AppImage', './Centrio-*.AppImage', t.dl_step_linux3],
    },
  ]

  const sorted = detectedOs
    ? [platforms.find(p => p.id === detectedOs)!, ...platforms.filter(p => p.id !== detectedOs)]
    : platforms

  const detected = detectedOs ? platforms.find(p => p.id === detectedOs) : null

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <style>{`
        :root { color-scheme: dark; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body {
          background: #06060f;
          color: #e8e8ff;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
        }
        body::before {
          content: '';
          position: fixed; inset: 0; z-index: 0; pointer-events: none;
          background-image: radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px);
          background-size: 28px 28px;
        }
        .dl-page { position: relative; z-index: 1; }

        @keyframes grad-shift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        @keyframes shimmer { 0%{background-position:200% center} 100%{background-position:-200% center} }
        @keyframes blob-drift { 0%,100%{transform:translate(0,0) scale(1)} 33%{transform:translate(-40px,-30px) scale(1.08)} 66%{transform:translate(30px,20px) scale(.94)} }

        .gt {
          background: linear-gradient(135deg, #f0abfc 0%, #a855f7 40%, #38bdf8 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
          animation: shimmer 5s linear infinite;
        }
        .stag {
          display: inline-flex; align-items: center; gap: 10px;
          font-size: 11px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #c084fc;
          margin-bottom: 16px;
        }
        .stag::before, .stag::after { content:''; display:block; width:20px; height:1px; background: linear-gradient(to right, #c084fc, transparent); }
        .stag::after { background: linear-gradient(to left, #c084fc, transparent); }

        .btn-g {
          display: inline-flex; align-items: center; gap: 9px;
          background: linear-gradient(135deg, #d946ef, #8b5cf6 50%, #38bdf8);
          background-size: 200% auto;
          color: #fff; font-weight: 700; font-size: 15px; padding: 14px 28px;
          border-radius: 13px; border: none; cursor: pointer; text-decoration: none;
          transition: all .3s; box-shadow: 0 4px 28px rgba(168,85,247,.35);
          position: relative; overflow: hidden; white-space: nowrap; font-family: inherit;
          animation: grad-shift 4s ease infinite;
        }
        .btn-g:hover { transform: translateY(-2px); box-shadow: 0 14px 50px rgba(168,85,247,.55); }

        .btn-o {
          display: inline-flex; align-items: center; gap: 9px;
          background: transparent; border: 1px solid rgba(255,255,255,.12);
          color: rgba(240,240,255,.65); font-weight: 600; font-size: 14px; padding: 13px 24px;
          border-radius: 13px; cursor: pointer; text-decoration: none; transition: all .25s;
          white-space: nowrap; font-family: inherit;
        }
        .btn-o:hover { border-color: rgba(168,85,247,.4); color: #f0f0ff; background: rgba(168,85,247,.06); transform: translateY(-1px); }

        .platform-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 24px;
          padding: 30px;
          position: relative;
          overflow: hidden;
          transition: border-color 0.3s, box-shadow 0.3s, transform 0.3s;
        }
        .platform-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 80px rgba(0,0,0,0.5);
        }
        .platform-card.detected {
          border-color: rgba(168,85,247,0.35);
          background: linear-gradient(145deg, rgba(168,85,247,0.08), rgba(56,189,248,0.04));
        }

        .platform-btn-primary {
          display: flex; align-items: center; justify-content: center; gap: 9px;
          color: #fff; text-decoration: none; padding: 13px 20px;
          border-radius: 13px; font-weight: 700; font-size: 14.5px;
          transition: all .25s; border: none; cursor: pointer; font-family: inherit;
        }
        .platform-btn-secondary {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.5); text-decoration: none; padding: 12px 20px;
          border-radius: 13px; font-size: 13.5px; font-weight: 600; transition: all .25s;
        }
        .platform-btn-secondary:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); border-color: rgba(255,255,255,0.15); }

        .copy-btn {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.09);
          color: rgba(255,255,255,0.4); padding: 6px 16px; border-radius: 8px;
          font-size: 11px; cursor: pointer; font-weight: 700; transition: all 0.2s;
          font-family: inherit;
        }
        .copy-btn:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); }
        .copy-btn.copied { background: rgba(74,222,128,0.1); border-color: rgba(74,222,128,0.3); color: #4ade80; }

        .step-num {
          width: 22px; height: 22px; border-radius: 7px; flex-shrink: 0; margin-top: 1px;
          display: flex; align-items: center; justify-content: center;
          font-size: 10px; font-weight: 800;
        }

        .dl-hero-blob {
          position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none;
          animation: blob-drift 12s ease-in-out infinite;
        }

        .feature-row {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
        }
        .feature-pill {
          display: flex; align-items: center; gap: 12px;
          background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
          border-radius: 14px; padding: 14px 18px;
          transition: border-color .2s, background .2s;
        }
        .feature-pill:hover { background: rgba(168,85,247,0.05); border-color: rgba(168,85,247,0.18); }

        .wrap { max-width: 1160px; margin: 0 auto; padding: 0 24px; }

        @media (max-width: 900px) {
          .platform-grid { grid-template-columns: 1fr !important; }
          .feature-row { grid-template-columns: 1fr !important; }
          .linux-grid { grid-template-columns: 1fr !important; }
          .hero-cta-row { flex-direction: column !important; align-items: center !important; }
        }
        @media (max-width: 600px) {
          .detected-box { padding: 24px 20px !important; min-width: unset !important; width: 100% !important; }
        }
      `}</style>

      <div className="dl-page">
        <SiteNav active="/download" />

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section style={{ position: 'relative', paddingTop: 66, overflow: 'hidden' }}>
          <div className="dl-hero-blob" style={{ width: 500, height: 500, background: 'rgba(168,85,247,0.12)', left: '20%', top: -100 }} />
          <div className="dl-hero-blob" style={{ width: 400, height: 400, background: 'rgba(56,189,248,0.08)', right: '15%', top: 60, animationDelay: '-5s' }} />

          <div className="wrap" style={{ textAlign: 'center', padding: '80px 24px 0', position: 'relative' }}>

            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <div className="stag">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                </svg>
                {t.dl_hero_badge}
              </div>
            </motion.div>

            <motion.h1
              variants={fadeUpDelay(0.1)} initial="hidden" animate="show"
              style={{ fontSize: 'clamp(40px, 7vw, 72px)', fontWeight: 900, lineHeight: 1.05, marginBottom: 22, letterSpacing: '-0.035em', color: '#f0f0ff' }}>
              {t.dl_hero_h1a}<br />
              <span className="gt">{t.dl_hero_h1b}</span>
            </motion.h1>

            <motion.p
              variants={fadeUpDelay(0.2)} initial="hidden" animate="show"
              style={{ fontSize: 17, color: 'rgba(255,255,255,0.42)', maxWidth: 480, margin: '0 auto 36px', lineHeight: 1.75 }}>
              {t.dl_hero_sub}
            </motion.p>

            {/* Version badge */}
            <motion.div variants={fadeUpDelay(0.25)} initial="hidden" animate="show"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 44 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.25)', borderRadius: 20, padding: '6px 16px', fontSize: 12, color: '#c084fc', fontWeight: 700, letterSpacing: '0.06em' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', boxShadow: '0 0 8px #a855f7', display: 'inline-block' }} />
                v{VERSION} · {t.dl_hero_date}
              </div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '6px 14px', fontSize: 12, color: 'rgba(34,197,94,0.85)', fontWeight: 600 }}>
                <svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                {t.dl_hero_stable}
              </div>
            </motion.div>

            {/* ── DETECTED OS HERO BUTTON ─────────────────────────────── */}
            {detected && (
              <motion.div variants={fadeUpDelay(0.3)} initial="hidden" animate="show"
                style={{ display: 'flex', justifyContent: 'center', marginBottom: 60 }}>
                <div className="detected-box" style={{
                  background: `linear-gradient(145deg, rgba(${detected.rgb},0.1) 0%, rgba(${detected.rgb},0.03) 100%)`,
                  border: `1px solid rgba(${detected.rgb},0.3)`,
                  borderRadius: 28, padding: '32px 44px', minWidth: 380, textAlign: 'center',
                  boxShadow: `0 0 60px rgba(${detected.rgb},0.1)`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.04em' }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: `rgba(${detected.rgb},1)` }} />
                    {t.dl_detected} <span style={{ color: `rgba(${detected.rgb},1)`, fontWeight: 700 }}>{detected.name}</span>
                  </div>
                  <a href={detected.primary.url} className="btn-g" style={{ fontSize: 16, padding: '15px 36px', borderRadius: 14, boxShadow: `0 8px 40px rgba(${detected.rgb},0.3)` }}>
                    <DownloadIcon size={18} />
                    {detected.primary.label}
                  </a>
                  {detected.secondary && (
                    <div style={{ marginTop: 13 }}>
                      <a href={detected.secondary.url} style={{ fontSize: 13, color: `rgba(${detected.rgb},0.6)`, textDecoration: 'none', transition: 'color .2s' }}>
                        {t.dl_or} {detected.secondary.label} →
                      </a>
                    </div>
                  )}
                  <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
                    {detected.req} · {detected.size}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── STATS ROW ────────────────────────────────────────────── */}
            <motion.div variants={fadeUpDelay(0.35)} initial="hidden" animate="show"
              style={{ display: 'flex', justifyContent: 'center', gap: 0, marginBottom: 80 }}>
              <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
                {[
                  { val: '100+', label: t.stat1l },
                  { val: '3', label: t.dl_stat_platforms },
                  { val: '0₽', label: t.dl_stat_free },
                  { val: '30s', label: t.dl_stat_install },
                ].map((s, i) => (
                  <div key={i} style={{ padding: '18px 28px', textAlign: 'center', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#f0f0ff', letterSpacing: '-0.02em' }}>{s.val}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3, fontWeight: 500 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.18), rgba(56,189,248,0.12), transparent)' }} />

        {/* ── PLATFORM CARDS ───────────────────────────────────────────────── */}
        <section style={{ padding: '80px 0 80px' }}>
          <div className="wrap">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              style={{ textAlign: 'center', marginBottom: 52 }}>
              <div className="stag">{t.dl_all_platforms}</div>
              <h2 style={{ fontSize: 'clamp(26px,3.5vw,42px)', fontWeight: 800, color: '#f0f0ff', letterSpacing: '-0.025em', lineHeight: 1.15 }}>
                {t.dl_platforms_title} <span className="gt">{t.dl_platforms_title2}</span>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 16, marginTop: 12, lineHeight: 1.7 }}>
                {t.dl_platforms_sub}
              </p>
            </motion.div>

            <div className="platform-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
              {sorted.map((p, i) => {
                const isDetected = p.id === detectedOs && i === 0
                return (
                  <motion.div
                    key={p.id}
                    className={`platform-card${isDetected ? ' detected' : ''}`}
                    variants={fadeUpDelay(i * 0.1)} initial="hidden" whileInView="show" viewport={{ once: true }}
                    style={isDetected ? {
                      background: `linear-gradient(145deg, rgba(${p.rgb},0.1), rgba(${p.rgb},0.02))`,
                      borderColor: `rgba(${p.rgb},0.35)`,
                      boxShadow: `0 0 60px rgba(${p.rgb},0.08)`,
                    } : {}}>

                    {isDetected && (
                      <div style={{
                        position: 'absolute', top: 0, right: 0,
                        background: `linear-gradient(135deg, rgba(${p.rgb},0.95), rgba(${p.rgb},0.65))`,
                        fontSize: 9, fontWeight: 800, color: '#fff',
                        padding: '6px 16px', borderBottomLeftRadius: 14, letterSpacing: '0.12em',
                      }}>{t.dl_your_pc}</div>
                    )}

                    <div style={{
                      position: 'absolute', top: -1, left: 0, right: 0, height: 1,
                      background: `linear-gradient(to right, transparent, rgba(${p.rgb},${isDetected ? 0.6 : 0.25}), transparent)`,
                    }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                      <div style={{
                        width: 56, height: 56, borderRadius: 16,
                        background: `rgba(${p.rgb},0.12)`,
                        border: `1px solid rgba(${p.rgb},0.25)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: p.color, flexShrink: 0,
                        boxShadow: `0 4px 20px rgba(${p.rgb},0.15)`,
                      }}>{p.icon}</div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 20, color: '#f0f0ff', letterSpacing: '-0.02em' }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 3, fontWeight: 600, letterSpacing: '0.04em' }}>{p.badge}</div>
                      </div>
                    </div>

                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'rgba(255,255,255,0.04)', borderRadius: 11, padding: '10px 16px',
                      marginBottom: 22, fontSize: 12.5,
                    }}>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}>{p.req}</span>
                      <span style={{ color: `rgba(${p.rgb},0.7)`, fontWeight: 700 }}>{p.size}</span>
                    </div>

                    <div style={{ marginBottom: 24 }}>
                      {p.steps.map((step, j) => (
                        <div key={j} style={{ display: 'flex', gap: 11, marginBottom: 10, alignItems: 'flex-start' }}>
                          <div className="step-num" style={{
                            background: `rgba(${p.rgb},0.15)`,
                            border: `1px solid rgba(${p.rgb},0.3)`,
                            color: p.color,
                          }}>{j + 1}</div>
                          <span style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>{step}</span>
                        </div>
                      ))}
                    </div>

                    {(p as any).note && (
                      <div style={{
                        background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.14)',
                        borderRadius: 11, padding: '10px 14px', marginBottom: 20,
                        fontSize: 12.5, color: 'rgba(251,191,36,0.65)', lineHeight: 1.65,
                        display: 'flex', gap: 8,
                      }}>
                        <span style={{ flexShrink: 0 }}>⚠️</span>
                        <span>{(p as any).note}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 'auto' }}>
                      <a href={p.primary.url} className="platform-btn-primary" style={{
                        background: isDetected
                          ? 'linear-gradient(135deg, #d946ef, #8b5cf6 50%, #38bdf8)'
                          : `linear-gradient(135deg, rgba(${p.rgb},0.9), rgba(${p.rgb},0.6))`,
                        boxShadow: isDetected
                          ? '0 6px 32px rgba(168,85,247,0.4)'
                          : `0 6px 24px rgba(${p.rgb},0.25)`,
                        animation: isDetected ? 'grad-shift 4s ease infinite' : 'none',
                        backgroundSize: '200% auto',
                      }}>
                        <DownloadIcon size={16} />
                        {p.primary.label}
                      </a>
                      {(p as any).secondary && (
                        <a href={(p as any).secondary.url} className="platform-btn-secondary">
                          <DownloadIcon size={14} />
                          {(p as any).secondary.label}
                        </a>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </section>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.12), transparent)' }} />

        {/* ── WHY CENTRIO (features) ──────────────────────────────────────── */}
        <section style={{ padding: '80px 0' }}>
          <div className="wrap">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              style={{ textAlign: 'center', marginBottom: 44 }}>
              <div className="stag">{t.dl_why_label}</div>
              <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 800, color: '#f0f0ff', letterSpacing: '-0.025em' }}>
                {t.feat_title} <span className="gt">{t.feat_title2}</span>
              </h2>
            </motion.div>

            <div className="feature-row">
              {[
                { icon: '🗂', title: t.dl_f1t, desc: t.dl_f1d },
                { icon: '🔔', title: t.dl_f2t, desc: t.dl_f2d },
                { icon: '🎨', title: t.dl_f3t, desc: t.dl_f3d },
                { icon: '🌐', title: t.dl_f4t, desc: t.dl_f4d },
                { icon: '☁️', title: t.dl_f5t, desc: t.dl_f5d },
                { icon: '⚡', title: t.dl_f6t, desc: t.dl_f6d },
              ].map((f, i) => (
                <motion.div key={i} variants={fadeUpDelay(i * 0.08)} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  <div className="feature-pill">
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>{f.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#f0f0ff', marginBottom: 3 }}>{f.title}</div>
                      <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55 }}>{f.desc}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(56,189,248,0.1), transparent)' }} />

        {/* ── LINUX TERMINAL ───────────────────────────────────────────────── */}
        <section style={{ padding: '80px 0' }}>
          <div className="wrap">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 28, padding: '44px', overflow: 'hidden', position: 'relative' }}>

              <div style={{ position: 'absolute', top: -60, right: -60, width: 300, height: 300, background: 'rgba(251,146,60,0.06)', borderRadius: '50%', filter: 'blur(60px)', pointerEvents: 'none' }} />

              <div className="linux-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 48, alignItems: 'center', position: 'relative' }}>
                <div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.22)', borderRadius: 10, padding: '5px 14px', fontSize: 11, color: '#fb923c', fontWeight: 700, marginBottom: 20, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    <LinuxIcon size={14} />
                    {t.dl_linux_badge}
                  </div>
                  <h3 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 14px', lineHeight: 1.25, color: '#f0f0ff', letterSpacing: '-0.025em' }}>{t.dl_linux_h1}<br />{t.dl_linux_h2}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 14.5, lineHeight: 1.8, margin: '0 0 24px' }}>
                    {t.dl_linux_desc}
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <a href={URLS.linux_app} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.3)',
                      color: '#fb923c', textDecoration: 'none', padding: '11px 22px', borderRadius: 11,
                      fontSize: 13.5, fontWeight: 700, transition: 'all .2s',
                    }}>
                      <DownloadIcon size={15} />
                      AppImage
                    </a>
                    <a href={URLS.linux_deb} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.5)', textDecoration: 'none', padding: '11px 22px', borderRadius: 11,
                      fontSize: 13.5, fontWeight: 600, transition: 'all .2s',
                    }}>
                      <DownloadIcon size={15} />
                      .deb
                    </a>
                  </div>
                </div>

                {/* Terminal */}
                <div style={{ background: '#070710', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18, overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
                  <div style={{ padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28ca41' }} />
                    <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.2)', marginLeft: 10, fontFamily: 'monospace' }}>bash — centrio install</span>
                  </div>
                  <div style={{ padding: '22px 26px', fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace', fontSize: 12.5, lineHeight: 2.1 }}>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.2)', userSelect: 'none' }}>$ </span>
                      <span style={{ color: '#c084fc' }}>wget</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)' }}> https://download.centrio.me/linux/</span>
                      <br />
                      <span style={{ color: 'rgba(255,255,255,0.2)', userSelect: 'none', paddingLeft: 16 }}></span>
                      <span style={{ color: 'rgba(255,255,255,0.55)' }}>Centrio-{VERSION}.AppImage</span>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.2)', userSelect: 'none' }}>$ </span>
                      <span style={{ color: '#c084fc' }}>chmod</span>
                      <span style={{ color: '#fb923c' }}> +x</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }}> Centrio-{VERSION}.AppImage</span>
                    </div>
                    <div>
                      <span style={{ color: 'rgba(255,255,255,0.2)', userSelect: 'none' }}>$ </span>
                      <span style={{ color: '#4ade80' }}>./</span>
                      <span style={{ color: 'rgba(255,255,255,0.45)' }}>Centrio-{VERSION}.AppImage</span>
                    </div>
                    <div style={{ marginTop: 4, color: 'rgba(74,222,128,0.6)', fontSize: 11.5 }}>
                      ✓ Centrio {VERSION} launched
                    </div>
                  </div>
                  <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      className={`copy-btn${copied ? ' copied' : ''}`}
                      onClick={() => copy(`wget ${URLS.linux_app}\nchmod +x Centrio-${VERSION}.AppImage\n./Centrio-${VERSION}.AppImage`)}>
                      {copied ? t.dl_copied : t.dl_copy}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.12), transparent)' }} />

        {/* ── WHAT'S NEW ───────────────────────────────────────────────────── */}
        <section style={{ padding: '80px 0' }}>
          <div className="wrap">
            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }}
              style={{ textAlign: 'center', marginBottom: 44 }}>
              <div className="stag">{t.dl_news_label}</div>
              <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 800, color: '#f0f0ff', letterSpacing: '-0.025em' }}>
                v{VERSION} — <span className="gt">{t.dl_hero_date}</span>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, marginTop: 10 }}>{t.dl_news_sub}</p>
            </motion.div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, maxWidth: 860, margin: '0 auto' }}>
              {[
                { tag: 'fix', color: '#4ade80', text: 'LanguageTool — fixed "Cannot check text, confirm privacy policy first" showing almost always instead of the consent prompt' },
                { tag: 'ui', color: '#f97316', text: 'Update banner redesigned — bigger, clearer, with accent glow and pulse when an update is ready' },
                { tag: 'fix', color: '#4ade80', text: 'Onboarding tour no longer overlaps the PIN lock screen' },
                { tag: 'new', color: '#38bdf8', text: 'Keyboard shortcuts list — quick access button on the toolbar' },
                { tag: 'new', color: '#38bdf8', text: 'Search across all open messenger tabs at once, not just the active one' },
                { tag: 'i18n', color: '#a78bfa', text: 'Google Translate — clear hint when source and target language are the same' },
              ].map((item, i) => (
                <motion.div key={i} variants={fadeUpDelay(i * 0.07)} initial="hidden" whileInView="show" viewport={{ once: true }}>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '16px 20px', background: 'rgba(255,255,255,0.025)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', transition: 'border-color .2s' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, boxShadow: `0 0 8px ${item.color}`, marginTop: 6, flexShrink: 0 }} />
                    <div>
                      <span style={{ display: 'inline-block', background: `rgba(${item.color === '#a78bfa' ? '167,139,250' : item.color === '#4ade80' ? '74,222,128' : item.color === '#38bdf8' ? '56,189,248' : item.color === '#f97316' ? '249,115,22' : '255,255,255'},0.12)`, color: item.color, fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, letterSpacing: '0.08em', marginBottom: 5 }}>{item.tag.toUpperCase()}</span>
                      <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{item.text}</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <div style={{ height: 1, background: 'linear-gradient(to right, transparent, rgba(168,85,247,0.12), transparent)' }} />

        {/* ── CTA BOTTOM ───────────────────────────────────────────────────── */}
        <section style={{ padding: '90px 0 100px' }}>
          <div className="wrap" style={{ textAlign: 'center', position: 'relative' }}>
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 600, height: 300, background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />

            <motion.div variants={fadeUp} initial="hidden" whileInView="show" viewport={{ once: true }} style={{ position: 'relative' }}>
              <div className="stag" style={{ justifyContent: 'center' }}>{t.dl_cta_label}</div>
              <h2 style={{ fontSize: 'clamp(30px,5vw,56px)', fontWeight: 900, color: '#f0f0ff', letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: 18 }}>
                {t.hero_h1a}<br /><span className="gt">{t.hero_h1b}</span>
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 16, marginBottom: 40, lineHeight: 1.7 }}>
                {t.dl_cta_sub}
              </p>

              <div className="hero-cta-row" style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
                <a href={URLS.win} className="btn-g" style={{ fontSize: 15.5, padding: '15px 32px' }}>
                  <DownloadIcon size={17} />
                  {t.dl_cta_win_btn}
                </a>
                <Link href="/pricing" className="btn-o" style={{ fontSize: 15, padding: '14px 28px' }}>
                  {t.hero_cta2}
                </Link>
              </div>

              <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                {[t.dl_cta_free, 'Windows · macOS · Linux', `v${VERSION}`].map((text, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'rgba(255,255,255,0.28)' }}>
                    <svg viewBox="0 0 20 20" fill="rgba(168,85,247,0.6)" width="13" height="13">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                    </svg>
                    {text}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── CHANGELOG ────────────────────────────────────────────────────── */}
        <section style={{ padding: '0 0 100px' }}>
          <div className="wrap" style={{ maxWidth: 720 }}>
            <h2 style={{ fontSize: 'clamp(26px,3vw,38px)', fontWeight: 800, color: '#f0f0ff', textAlign: 'center', marginBottom: 16, letterSpacing: '-.02em' }}>
              История изменений
            </h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginBottom: 32 }}>
              Полный список изменений по версиям — то же самое, что видно в приложении
            </p>
            <div style={{ maxHeight: 520, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, background: 'rgba(255,255,255,0.02)', padding: '8px 24px' }}>
              {CHANGELOG.map((entry) => (
                <div key={entry.version} style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#a855f7', marginBottom: 8 }}>v{entry.version}</div>
                  {entry.notes.map((note, i) => (
                    <p key={i} style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65, margin: '6px 0 0', paddingLeft: 16, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'rgba(255,255,255,0.25)' }}>—</span>{note}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <SiteFooter />
      </div>
    </>
  )
}
