'use client'
import Link from 'next/link'
import { useState, useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useLang, LANGS, LANG_LABELS, type Lang } from '@/lib/i18n'
import { MAIN_NAV, LOCALIZED_ROUTES, canonicalPath, localizedHref } from '@/lib/site-nav'

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
      <button onClick={() => setOpen(o => !o)} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 9, padding: '7px 12px', color: 'rgba(240,240,255,0.55)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all .2s', fontFamily: 'inherit' }}>
        {LANG_LABELS[lang]}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 7px)', right: 0, background: 'rgba(8,7,20,0.98)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12, overflow: 'hidden', zIndex: 50, minWidth: 126, boxShadow: '0 16px 60px rgba(0,0,0,0.8)' }}>
          {LANGS.map(l => (
            <button key={l} onClick={() => chooseLang(l)} style={{ display: 'block', width: '100%', padding: '9px 16px', background: l === lang ? 'rgba(168,85,247,0.1)' : 'transparent', border: 'none', color: l === lang ? '#c084fc' : 'rgba(240,240,255,0.5)', fontSize: 13, fontWeight: l === lang ? 700 : 400, cursor: 'pointer', textAlign: 'left', transition: 'all .15s', fontFamily: 'inherit' }}>
              {LANG_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function SiteNav({ active }: { active?: string }) {
  const { lang, t, setLang } = useLang()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', h)
    return () => window.removeEventListener('scroll', h)
  }, [])

  const linkStyle = (href: string): React.CSSProperties => ({
    color: active === href ? '#f0f0ff' : 'rgba(240,240,255,.38)',
    fontSize: 14, fontWeight: 500, textDecoration: 'none', transition: 'color .2s',
  })

  return (
    <>
      <style>{`
        :root { color-scheme: dark; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body { background: #06060f; color: #e8e8ff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; overflow-x: hidden; }
        body::before { content:''; position:fixed; inset:0; z-index:0; pointer-events:none; background-image:radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px); background-size:28px 28px; }
        .snav-link:hover { color: #f0f0ff !important; }
        .snav-dash:hover { color: #f0f0ff !important; border-color: rgba(168,85,247,.3) !important; }
        @media (max-width: 768px) { .snav-links { display: none !important; } }
      `}</style>
      <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, transition: 'all .3s', ...(scrolled ? { background: 'rgba(6,6,15,.9)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', borderBottom: '1px solid rgba(255,255,255,.05)' } : {}) }}>
        <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 66, gap: 16 }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none', flexShrink: 0 }}>
            <img src="/logo.png" alt="Centrio" style={{ width: 28, height: 28, objectFit: 'contain' }} />
            <span style={{ fontWeight: 800, fontSize: 18, color: '#f0f0ff', letterSpacing: '-.025em' }}>Centrio</span>
          </Link>
          <div className="snav-links" style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
            {MAIN_NAV.map(item => (
              <Link key={item.href} href={item.href} className="snav-link" style={linkStyle(item.href)}>{t[item.labelKey]}</Link>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <LangSwitcher lang={lang} setLang={setLang} />
            <Link href="/dashboard" className="snav-dash" style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(240,240,255,.48)', textDecoration: 'none', padding: '8px 15px', borderRadius: 9, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', transition: 'all .2s', whiteSpace: 'nowrap' }}>{t.nav_dashboard}</Link>
            <Link href="/download" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#d946ef,#8b5cf6 50%,#38bdf8)', backgroundSize: '200% auto', color: '#fff', fontWeight: 700, fontSize: 13, padding: '9px 18px', borderRadius: 10, textDecoration: 'none', boxShadow: '0 4px 20px rgba(168,85,247,.35)', whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {t.nav_dl_btn}
            </Link>
          </div>
        </div>
      </nav>
    </>
  )
}

export function SiteFooter() {
  const { t } = useLang()
  return (
    <footer style={{ background: '#06060f', borderTop: '1px solid rgba(255,255,255,.05)', padding: '60px 0 36px', position: 'relative', zIndex: 1 }}>
      <div style={{ maxWidth: 1160, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 48 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
              <img src="/logo.png" alt="Centrio" style={{ width: 26, height: 26, objectFit: 'contain' }} />
              <span style={{ fontWeight: 800, fontSize: 17, color: '#f0f0ff', letterSpacing: '-.025em' }}>Centrio</span>
            </div>
            <p style={{ color: 'rgba(240,240,255,.3)', fontSize: 13.5, lineHeight: 1.75, maxWidth: 240, marginBottom: 20 }}>{t.ft_desc}</p>
            <a href="mailto:support@centrio.me" style={{ fontSize: 13, color: 'rgba(240,240,255,.25)', textDecoration: 'none' }}>support@centrio.me</a>
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'rgba(240,240,255,.28)', display: 'block', marginBottom: 16 }}>{t.ft_product}</span>
            {[...MAIN_NAV.map(item => ({ label: t[item.labelKey], href: item.href })), { label: t.footer_faq, href: '/faq' }].map(({ label, href }) => (
              <Link key={href} href={href} style={{ display: 'block', fontSize: 13.5, color: 'rgba(240,240,255,.38)', textDecoration: 'none', marginBottom: 9, transition: 'color .2s' }}>{label}</Link>
            ))}
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'rgba(240,240,255,.28)', display: 'block', marginBottom: 16 }}>{t.ft_download_col}</span>
            {([['Windows', '/download/windows'], ['macOS', '/download/macos'], ['Linux', '/download/linux']] as [string, string][]).map(([l, h]) => (
              <Link key={h} href={h} style={{ display: 'block', fontSize: 13.5, color: 'rgba(240,240,255,.38)', textDecoration: 'none', marginBottom: 9, transition: 'color .2s' }}>{l}</Link>
            ))}
          </div>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase' as const, color: 'rgba(240,240,255,.28)', display: 'block', marginBottom: 16 }}>{t.ft_legal}</span>
            {([
              [t.footer_privacy, '/privacy'],
              [t.ft_terms_of_use, '/terms'],
              [t.ft_refund, '/refund'],
            ] as [string, string][]).map(([l, h]) => (
              <Link key={h} href={h} style={{ display: 'block', fontSize: 13.5, color: 'rgba(240,240,255,.38)', textDecoration: 'none', marginBottom: 9, transition: 'color .2s' }}>{l}</Link>
            ))}
          </div>
        </div>
        <div style={{ borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'rgba(240,240,255,.2)' }}>{t.footer_rights}</span>
          <div style={{ display: 'flex', gap: 20 }}>
            <Link href="/privacy" style={{ fontSize: 13, color: 'rgba(240,240,255,.2)', textDecoration: 'none' }}>{t.footer_privacy}</Link>
            <Link href="/terms" style={{ fontSize: 13, color: 'rgba(240,240,255,.2)', textDecoration: 'none' }}>{t.footer_terms}</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
