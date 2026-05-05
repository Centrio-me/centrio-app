'use client'

import { useState, useEffect } from 'react'
import SiteFooter from '@/components/SiteFooter'
import SiteHeader from '@/components/SiteHeader'
import { useLang } from '@/lib/i18n'
import type React from 'react'
import Link from 'next/link'

const VERSION = '1.6.6'

const URLS = {
  win:       `https://download.centrio.me/Centrio%20Setup%20${VERSION}.exe`,
  mac:       `https://download.centrio.me/mac/Centrio-${VERSION}.dmg`,
  linux_app: `https://download.centrio.me/linux/Centrio-${VERSION}.AppImage`,
  linux_deb: `https://download.centrio.me/linux/messengerapp_${VERSION}_amd64.deb`,
}

const WinIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
    <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/>
  </svg>
)
const MacIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
  </svg>
)
const LinuxIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28">
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.4-.178-.867-.492-1.257z"/>
  </svg>
)

type OS = 'win' | 'mac' | 'linux'

export default function DownloadPage() {
  const [detectedOs, setDetectedOs] = useState<OS | null>(null)
  const [copied, setCopied] = useState(false)
  const { t } = useLang()

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

  const platforms = [
    {
      id: 'win' as OS,
      name: 'Windows',
      icon: <WinIcon />,
      color: '#0078D4',
      rgb: '0,120,212',
      badge: 'NSIS Installer В· x64',
      req: 'Windows 10 / 11 В· x64',
      size: '~85 MB',
      primary: { label: t.dl_win_btn, url: URLS.win },
      steps: t.dl_win_steps,
    },
    {
      id: 'mac' as OS,
      name: 'macOS',
      icon: <MacIcon />,
      color: '#a0a0b0',
      rgb: '160,160,180',
      badge: 'DMG В· x64',
      req: 'macOS 12 Monterey+',
      size: '~110 MB',
      primary: { label: t.dl_mac_btn, url: URLS.mac },
      steps: t.dl_mac_steps,
      note: t.dl_mac_note,
    },
    {
      id: 'linux' as OS,
      name: 'Linux',
      icon: <LinuxIcon />,
      color: '#f97316',
      rgb: '249,115,22',
      badge: 'AppImage В· deb В· x64',
      req: 'Ubuntu 20.04+, Debian, Arch',
      size: '~112 MB',
      primary: { label: t.dl_linux_btn_app, url: URLS.linux_app },
      secondary: { label: t.dl_linux_btn_deb, url: URLS.linux_deb },
      steps: t.dl_linux_steps,
    },
  ]

  const sorted = detectedOs
    ? [platforms.find(p => p.id === detectedOs)!, ...platforms.filter(p => p.id !== detectedOs)]
    : platforms

  return (
    <div style={{ minHeight: '100vh', background: '#070711', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <SiteHeader />

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', top: 0, width: 800, height: 400, background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.12) 0%, transparent 65%)', pointerEvents: 'none' }} />

        {/* HERO */}
        <section style={{ textAlign: 'center', padding: '72px 24px 56px', position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 20, padding: '5px 14px', fontSize: 11, color: '#60a5fa', marginBottom: 28, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            {t.dl_badge}
          </div>
          <h1 style={{ fontSize: 'clamp(36px, 6vw, 60px)', fontWeight: 800, lineHeight: 1.1, margin: '0 0 18px', letterSpacing: '-0.03em' }}>
            {t.dl_hero_h1}{' '}
            <span style={{ background: 'linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Centrio
            </span>
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.4)', maxWidth: 440, margin: '0 auto', lineHeight: 1.65 }}>
            {t.dl_hero_sub2}
          </p>
        </section>

        {/* DETECTED OS BUTTON */}
        {detectedOs && (() => {
          const p = platforms.find(pl => pl.id === detectedOs)!
          return (
            <div style={{ textAlign: 'center', padding: '0 24px 56px' }}>
              <div style={{ display: 'inline-block', background: `radial-gradient(ellipse at 50% 0%, rgba(${p.rgb},0.15), rgba(${p.rgb},0.04))`, border: `1px solid rgba(${p.rgb},0.25)`, borderRadius: 24, padding: '28px 40px', minWidth: 340 }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: 18, letterSpacing: '0.05em' }}>
                  {t.dl_detected_label} <span style={{ color: `rgba(${p.rgb},1)`, fontWeight: 700 }}>{p.name}</span>
                </div>
                <a href={p.primary.url} style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: `linear-gradient(135deg, rgba(${p.rgb},1), rgba(${p.rgb},0.75))`, color: '#fff', textDecoration: 'none', padding: '14px 32px', borderRadius: 13, fontWeight: 700, fontSize: 16, boxShadow: `0 8px 40px rgba(${p.rgb},0.35)` }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  {p.primary.label}
                </a>
                {'secondary' in p && p.secondary && (
                  <div style={{ marginTop: 12 }}>
                    <a href={p.secondary.url} style={{ fontSize: 13, color: `rgba(${p.rgb},0.6)`, textDecoration: 'none' }}>
                      {t.dl_or} {p.secondary.label} в†’
                    </a>
                  </div>
                )}
                <div style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
                  {p.req} В· {p.size}
                </div>
              </div>
            </div>
          )
        })()}

        {/* PLATFORM CARDS */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 8px' }}>{t.dl_all_title}</h2>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>{t.dl_all_sub}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18 }}>
            {sorted.map((p, i) => {
              const isDetected = p.id === detectedOs && i === 0
              return (
                <div key={p.id} style={{ background: isDetected ? `linear-gradient(145deg, rgba(${p.rgb},0.1), rgba(${p.rgb},0.03))` : 'rgba(255,255,255,0.025)', border: `1px solid ${isDetected ? `rgba(${p.rgb},0.35)` : 'rgba(255,255,255,0.07)'}`, borderRadius: 20, padding: '26px', position: 'relative', overflow: 'hidden' }}>
                  {isDetected && (
                    <div style={{ position: 'absolute', top: 0, right: 0, background: `linear-gradient(135deg, rgba(${p.rgb},0.9), rgba(${p.rgb},0.6))`, fontSize: 9, fontWeight: 800, color: '#fff', padding: '5px 13px', borderBottomLeftRadius: 12, letterSpacing: '0.1em' }}>{t.dl_your_pc}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
                    <div style={{ width: 50, height: 50, borderRadius: 15, background: `rgba(${p.rgb},0.12)`, border: `1px solid rgba(${p.rgb},0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.color }}>{p.icon}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontWeight: 500 }}>{p.badge}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '9px 14px', marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                    <span>{p.req}</span>
                    <span style={{ color: 'rgba(255,255,255,0.2)' }}>{p.size}</span>
                  </div>
                  <div style={{ marginBottom: 22 }}>
                    {p.steps.map((step, j) => (
                      <div key={j} style={{ display: 'flex', gap: 10, marginBottom: 9, alignItems: 'flex-start' }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1, background: `rgba(${p.rgb},0.15)`, border: `1px solid rgba(${p.rgb},0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: p.color }}>{j + 1}</span>
                        </div>
                        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{step}</span>
                      </div>
                    ))}
                  </div>
                  {'note' in p && p.note && (
                    <div style={{ background: 'rgba(251,191,36,0.07)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 10, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: 'rgba(251,191,36,0.65)', lineHeight: 1.6 }}>
                      вљ пёЏ {p.note}
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <a href={p.primary.url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: `linear-gradient(135deg, rgba(${p.rgb},0.9), rgba(${p.rgb},0.6))`, color: '#fff', textDecoration: 'none', padding: '12px', borderRadius: 12, fontWeight: 700, fontSize: 14 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      {p.primary.label}
                    </a>
                    {'secondary' in p && p.secondary && (
                      <a href={p.secondary.url} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.5)', textDecoration: 'none', padding: '11px', borderRadius: 12, fontSize: 13, fontWeight: 600 }}>
                        {p.secondary.label}
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* LINUX TERMINAL */}
        <section style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
          <div style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 22, padding: '36px', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 40, alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-block', background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, padding: '4px 12px', fontSize: 11, color: '#f97316', fontWeight: 700, marginBottom: 18, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}>
                {t.dl_terminal_label}
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 12px', lineHeight: 1.3 }}>{t.dl_terminal_title}</h3>
              <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 14, lineHeight: 1.75, margin: '0 0 20px' }}>
                {t.dl_terminal_sub}
              </p>
              <a href={URLS.linux_app} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', color: '#f97316', textDecoration: 'none', padding: '10px 20px', borderRadius: 10, fontSize: 13, fontWeight: 700 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="15" height="15"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                {t.dl_terminal_btn}
              </a>
            </div>
            <div>
              <div style={{ background: '#08080f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
                <div style={{ padding: '11px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
                  <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
                  <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#28ca41' }} />
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginLeft: 10 }}>bash</span>
                </div>
                <div style={{ padding: '18px 22px', fontFamily: '"JetBrains Mono","Fira Code","Cascadia Code",monospace', fontSize: 12.5, lineHeight: 2 }}>
                  <div><span style={{ color: 'rgba(255,255,255,0.25)', userSelect: 'none' }}>$ </span><span style={{ color: '#60a5fa' }}>wget</span><span style={{ color: 'rgba(255,255,255,0.45)' }}> {URLS.linux_app}</span></div>
                  <div><span style={{ color: 'rgba(255,255,255,0.25)', userSelect: 'none' }}>$ </span><span style={{ color: '#60a5fa' }}>chmod</span><span style={{ color: '#f97316' }}> +x</span><span style={{ color: 'rgba(255,255,255,0.45)' }}> Centrio-{VERSION}.AppImage</span></div>
                  <div><span style={{ color: 'rgba(255,255,255,0.25)', userSelect: 'none' }}>$ </span><span style={{ color: '#4ade80' }}>./</span><span style={{ color: 'rgba(255,255,255,0.45)' }}>Centrio-{VERSION}.AppImage</span></div>
                </div>
                <div style={{ padding: '8px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => copy(`wget ${URLS.linux_app}\nchmod +x Centrio-${VERSION}.AppImage\n./Centrio-${VERSION}.AppImage`)}
                    style={{ background: copied ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${copied ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.09)'}`, color: copied ? '#4ade80' : 'rgba(255,255,255,0.4)', padding: '5px 14px', borderRadius: 7, fontSize: 11, cursor: 'pointer', fontWeight: 700, transition: 'all 0.2s' }}>
                    {copied ? t.dl_copied : t.dl_copy}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* WHAT'S NEW */}
        <section style={{ maxWidth: 720, margin: '0 auto', padding: '0 24px 80px', textAlign: 'center' }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 6px' }}>{t.dl_whats_new_title}</h2>
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, margin: '0 0 28px' }}>{t.dl_whats_new_date}</p>
          <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 9 }}>
            {t.dl_whats_new_items.map((item) => (
              <div key={item.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 18px', background: 'rgba(255,255,255,0.025)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <svg viewBox="0 0 20 20" fill="#4ade80" width="16" height="16" style={{ flexShrink: 0, marginTop: 1 }}>
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                </svg>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <style>{`
        @media (max-width: 700px) {
          div[style*="grid-template-columns: 1fr 1.4fr"] { grid-template-columns: 1fr !important; }
          div[style*="grid-template-columns: repeat(auto-fit"] { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <SiteFooter />
    </div>
  )
}
