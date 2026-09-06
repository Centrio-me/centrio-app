'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useLang } from '@/lib/i18n'
import { COMPARE_LINKS } from '@/lib/site-nav'

// Restored from the live server 2026-07-29 — this component (used by
// features/refund/blog pages, distinct from the newer combined SiteFooter
// exported by site-shell.tsx used elsewhere) had never been tracked in this
// repo, so its VERSION constant had drifted to '2.5.2' while the app itself
// moved on to 2.5.2 — visibly wrong on every page that renders this footer.
const VERSION = '2.5.2'

export default function SiteFooter() {
  const { t } = useLang()
  const [email, setEmail] = useState('')
  const [subState, setSubState] = useState<'idle' | 'loading' | 'done' | 'err'>('idle')

  const handleSubscribe = async () => {
    if (!email || !email.includes('@')) return
    setSubState('loading')
    try {
      await fetch('https://api.centrio.me/api/notifications/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setSubState('done')
    } catch {
      setSubState('done') // show success anyway — don't block UX
    }
  }

  const cols = [
    {
      title: t.footer_col_product ?? 'Продукт',
      links: [
        { label: t.nav_download ?? 'Скачать', href: '/download' },
        { label: t.nav_pricing ?? 'Тарифы', href: '/pricing' },
        { label: t.footer_features ?? 'Возможности', href: '/features' },
        { label: t.nav_dashboard ?? 'Личный кабинет', href: '/dashboard' },
        { label: t.footer_top_apps ?? 'Топ приложений', href: '/blog/top-apps' },
      ],
    },
    {
      title: t.footer_col_compare ?? 'Сравнение',
      links: COMPARE_LINKS,
    },
    {
      title: t.footer_col_resources ?? 'Ресурсы',
      links: [
        { label: t.footer_faq ?? 'FAQ', href: '/faq' },
        { label: t.footer_blog ?? 'Блог', href: '/blog' },
        { label: t.footer_support ?? 'Поддержка', href: 'mailto:support@centrio.me' },
      ],
    },
    {
      title: t.footer_col_legal ?? 'Правовые',
      links: [
        { label: t.footer_privacy ?? 'Конфиденциальность', href: '/privacy' },
        { label: t.footer_terms ?? 'Условия',              href: '/terms'   },
        { label: t.footer_refund ?? 'Возврат',             href: '/refund'  },
      ],
    },
  ]

  return (
    <>
      <style>{`
        .footer-link {
          color: rgba(255,255,255,0.38);
          text-decoration: none;
          font-size: 13.5px;
          transition: color .18s;
          display: block;
          padding: 3px 0;
        }
        .footer-link:hover { color: rgba(255,255,255,0.85); }
        .footer-sub-input {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 10px 0 0 10px;
          padding: 10px 14px;
          color: #fff;
          font-size: 13.5px;
          font-family: inherit;
          outline: none;
          flex: 1;
          min-width: 0;
          transition: border-color .2s;
        }
        .footer-sub-input:focus { border-color: rgba(59,130,246,0.5); }
        .footer-sub-btn {
          background: linear-gradient(135deg,#1d4ed8,#3b82f6);
          border: none;
          border-radius: 0 10px 10px 0;
          padding: 10px 16px;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          white-space: nowrap;
          transition: opacity .2s;
        }
        .footer-sub-btn:hover { opacity: .88; }
        .footer-sub-btn:disabled { opacity: .5; cursor: not-allowed; }
        @media (max-width: 768px) {
          .footer-grid { grid-template-columns: 1fr 1fr !important; }
          .footer-sub-col { grid-column: 1 / -1 !important; }
        }
        @media (max-width: 480px) {
          .footer-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(20px)', paddingTop: 56, paddingBottom: 0 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>

          {/* Main grid: 4 link columns + 1 subscription column */}
          <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 280px', gap: '40px 32px', marginBottom: 48 }}>
            {cols.map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>
                  {col.title}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {col.links.map(l => (
                    <Link key={l.href} href={l.href} className="footer-link">{l.label}</Link>
                  ))}
                </div>
              </div>
            ))}

            {/* Subscription column */}
            <div className="footer-sub-col">
              <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 16 }}>
                {t.footer_sub_title ?? 'Новости Centrio'}
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.65, marginBottom: 14 }}>
                {t.footer_sub_desc ?? 'Обновления, советы и анонсы новых функций — раз в месяц.'}
              </p>
              {subState === 'done' ? (
                <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#4ade80' }}>
                  ✓ {t.footer_sub_success ?? 'Подписка оформлена!'}
                </div>
              ) : (
                <div style={{ display: 'flex' }}>
                  <input
                    className="footer-sub-input"
                    type="email"
                    placeholder={t.footer_sub_placeholder ?? 'your@email.com'}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubscribe()}
                  />
                  <button
                    className="footer-sub-btn"
                    onClick={handleSubscribe}
                    disabled={subState === 'loading'}
                  >
                    {subState === 'loading' ? '...' : (t.footer_sub_btn ?? 'OK')}
                  </button>
                </div>
              )}
              <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.18)', marginTop: 10, lineHeight: 1.5 }}>
                {t.footer_sub_note ?? 'Без спама. Отписаться можно в любой момент.'}
              </p>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 24, paddingBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
            {/* Logo + version */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/logo.png" alt="Centrio" style={{ width: 22, height: 22, objectFit: 'contain', opacity: .6 }} />
              <span style={{ fontWeight: 700, color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Centrio</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.18)', marginLeft: 4 }}>v{VERSION}</span>
            </div>
            {/* Copyright */}
            <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.2)' }}>{t.footer_rights}</span>
          </div>

          {/* Legal */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '16px 0 24px' }}>
            <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.13)', lineHeight: 1.7, margin: 0 }}>
              ИП Козловский Артём Сергеевич · ИНН: 501908743800 · ОГРНИП: 326508100200742 ·{' '}
              <Link href="/terms"   style={{ color: 'rgba(255,255,255,0.22)', textDecoration: 'underline' }}>Условия</Link>
              {' · '}
              <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.22)', textDecoration: 'underline' }}>Конфиденциальность</Link>
              {' · '}
              <Link href="/refund"  style={{ color: 'rgba(255,255,255,0.22)', textDecoration: 'underline' }}>Возврат</Link>
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}
