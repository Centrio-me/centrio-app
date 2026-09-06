import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

// Next.js app-router 404 convention — without this file at src/app/not-found.tsx,
// every unmatched URL falls back to the framework's default English
// "This page could not be found." page: no branding, no navigation, no
// localization on a Russian-first site. That default page inherits the root
// layout's <head> (hence the stray "Centrio — Все мессенджеры..." <title>
// seen alongside the "404: This page could not be found." one in raw HTML),
// but none of its actual body content or styling.
export const metadata: Metadata = {
  title: 'Страница не найдена — 404',
  robots: { index: false, follow: true },
};

const LINKS = [
  { href: '/', label: 'Главная' },
  { href: '/download', label: 'Скачать Centrio' },
  { href: '/features', label: 'Возможности' },
  { href: '/pricing', label: 'Тарифы' },
  { href: '/blog', label: 'Блог' },
  { href: '/faq', label: 'Вопросы и ответы' },
];

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <div style={{ minHeight: '70vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif", display: 'flex', alignItems: 'center' }}>
        <div style={{ maxWidth: 620, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 'clamp(64px,12vw,120px)', fontWeight: 800, letterSpacing: '-2px', lineHeight: 1, background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 8 }}>
            404
          </div>
          <h1 style={{ fontSize: 'clamp(22px,4vw,32px)', fontWeight: 800, marginBottom: 14 }}>
            Такой страницы нет
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15.5, lineHeight: 1.7, marginBottom: 36 }}>
            Возможно, ссылка устарела или в адресе опечатка. Вот несколько мест, откуда можно начать:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 40 }}>
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                style={{ color: '#c4b5fd', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(196,181,253,0.25)', borderRadius: 10, padding: '9px 18px' }}
              >
                {l.label}
              </Link>
            ))}
          </div>
          <Link
            href="/"
            style={{ display: 'inline-block', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 12, padding: '13px 32px', textDecoration: 'none', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}
          >
            ← Вернуться на главную
          </Link>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
