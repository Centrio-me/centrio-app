'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useLang, LANGS, LANG_LABELS, type Lang } from '@/lib/i18n'
import { MAIN_NAV, LOCALIZED_ROUTES, canonicalPath, localizedHref } from '@/lib/site-nav'

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe'

const IcoGlobe = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
)

const IcoPerson = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
)

const IcoDownload = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

function LangSwitcher({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const pathname = usePathname()
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const chooseLang = (l: Lang) => {
    setOpen(false)
    const canonical = canonicalPath(pathname || '/')
    if (LOCALIZED_ROUTES.has(canonical)) {
      router.push(localizedHref(canonical, l))
    } else {
      setLang(l)
    }
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} className="nav-lang-btn" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '7px 12px', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
        <span className="nav-lang-globe" style={{ display: 'none', lineHeight: 0 }}><IcoGlobe /></span>
        <span className="nav-lang-label">{LANG_LABELS[lang]}</span>
        <svg className="nav-lang-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, background: '#060a14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, overflow: 'hidden', zIndex: 200, minWidth: 120, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {LANGS.map(l => (
            <button key={l} onClick={() => chooseLang(l)} style={{ display: 'block', width: '100%', padding: '9px 16px', background: l === lang ? 'rgba(59,130,246,0.15)' : 'transparent', border: 'none', color: l === lang ? '#60a5fa' : 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: l === lang ? 600 : 400, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SiteHeader() {
  const { lang, t, setLang } = useLang()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <style>{`
        .site-nav { position:fixed; top:0; left:0; right:0; z-index:100; transition:all .3s; }
        .site-nav.scrolled { background:rgba(8,8,16,0.9); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); border-bottom:1px solid rgba(255,255,255,0.07); }
        .site-nav-inner { max-width:1200px; margin:0 auto; padding:0 24px; display:flex; align-items:center; justify-content:space-between; height:68px; gap:16px; }
        .site-nav-links { display:flex; align-items:center; gap:32px; }
        .site-nav-link { color:rgba(255,255,255,0.5); font-size:14px; font-weight:500; text-decoration:none; transition:color .2s; }
        .site-nav-link:hover { color:#fff; }
        .site-nav-right { display:flex; gap:8px; align-items:center; }
        .site-nav-lk { font-size:13px; font-weight:500; color:rgba(255,255,255,0.6); text-decoration:none; padding:8px 14px; border-radius:9px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); transition:all .2s; white-space:nowrap; display:flex; align-items:center; gap:6px; }
        .site-nav-lk:hover { background:rgba(255,255,255,0.1); color:#fff; }
        .site-nav-dl { display:inline-flex; align-items:center; gap:7px; background:linear-gradient(135deg,#1d4ed8,#3b82f6); color:#fff; font-weight:600; font-size:13px; padding:9px 16px; border-radius:9px; border:none; cursor:pointer; text-decoration:none; transition:all .22s; box-shadow:0 4px 20px rgba(59,130,246,.4); white-space:nowrap; }
        .site-nav-dl:hover { transform:translateY(-1px); box-shadow:0 8px 28px rgba(59,130,246,.55); }

        /* Tablet: hide nav links */
        @media (max-width:900px) {
          .site-nav-links { display:none !important; }
          .site-nav-right { gap:6px; }
        }

        /* Mobile: icon-only buttons */
        @media (max-width:560px) {
          .nav-lang-label { display:none !important; }
          .nav-lang-chevron { display:none !important; }
          .nav-lang-globe { display:flex !important; }
          .nav-lang-btn { padding:7px 9px !important; }

          .nav-lk-text { display:none !important; }
          .site-nav-lk { padding:8px 10px !important; }

          .nav-dl-text { display:none !important; }
          .site-nav-dl { padding:9px 11px !important; gap:0 !important; }
        }
      `}</style>
      <nav className={`site-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="site-nav-inner">
          {/* Logo */}
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
            <img src="/logo.png" alt="Centrio" style={{ width: 30, height: 30, objectFit: 'contain' }} />
            <span style={{ fontWeight: 700, fontSize: 19, color: '#fff', letterSpacing: '-.02em' }}>Centrio</span>
          </Link>

          {/* Nav links — sourced from MAIN_NAV (lib/site-nav.ts) so every page's
              header points to the same destinations. */}
          <div className="site-nav-links">
            {MAIN_NAV.map(item => (
              <Link key={item.href} href={item.href} className="site-nav-link">{t[item.labelKey]}</Link>
            ))}
          </div>

          {/* Right */}
          <div className="site-nav-right">
            <LangSwitcher lang={lang} setLang={setLang} />
            <Link href="/dashboard" className="site-nav-lk">
              <span className="nav-lk-icon" style={{ lineHeight: 0 }}><IcoPerson /></span>
              <span className="nav-lk-text">{t.nav_dashboard}</span>
            </Link>
            <a href={WIN_DOWNLOAD} className="site-nav-dl">
              <IcoDownload />
              <span className="nav-dl-text">{t.nav_dl_btn}</span>
            </a>
          </div>
        </div>
      </nav>
      {/* Spacer for fixed nav */}
      <div style={{ height: 68 }} />
    </>
  )
}
