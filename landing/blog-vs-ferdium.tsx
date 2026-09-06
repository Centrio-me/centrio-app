import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Centrio vs Ferdium: сравнение агрегаторов мессенджеров 2026',
  description: 'Centrio против Ferdium — сравнение бесплатного open-source агрегатора и Centrio с встроенным VPN, поддержкой VK и русскоязычной поддержкой. Что выбрать в 2026 году?',
  alternates: { canonical: 'https://centrio.me/blog/vs-ferdium' },
  openGraph: {
    title: 'Centrio vs Ferdium: полное сравнение',
    description: 'Открытый форк Franz против Centrio — сравниваем поддержку, VPN и удобство для русскоязычных пользователей.',
    url: 'https://centrio.me/blog/vs-ferdium',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const ROWS = [
  { feature: 'Модель распространения', centrio: 'Бесплатно + Pro-подписка', ferdium: 'Полностью бесплатно, open-source' },
  { feature: 'Поддержка и обновления', centrio: '✅ Официальная команда, поддержка на русском', ferdium: '⚠️ Силами сообщества, без гарантированного SLA' },
  { feature: 'Встроенный VPN', centrio: '✅ VLESS, VMess, Trojan, SS, Hysteria2', ferdium: '❌ Нет' },
  { feature: 'Российские сервисы (VK, Яндекс)', centrio: '✅ Из коробки', ferdium: '⚠️ Через рецепты сообщества, не всегда стабильно' },
  { feature: 'Облачная синхронизация настроек', centrio: '✅ Pro', ferdium: '❌ Нет' },
  { feature: 'Установка', centrio: '✅ Подписанный установщик, автообновление', ferdium: '⚠️ Требует больше технической самостоятельности' },
  { feature: 'Windows / macOS / Linux', centrio: '✅', ferdium: '✅' },
  { feature: 'Открытый исходный код', centrio: '❌', ferdium: '✅' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Centrio vs Ferdium: сравнение агрегаторов мессенджеров 2026', item: 'https://centrio.me/blog/vs-ferdium' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Centrio vs Ferdium: сравнение агрегаторов мессенджеров 2026',
  description: 'Centrio против Ferdium — сравнение бесплатного open-source агрегатора и Centrio с встроенным VPN, поддержкой VK и русскоязычной поддержкой. Что выбрать в 2026 году?',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/vs-ferdium' },
};

export default function VsFerdiumPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 50px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Сравнение · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Centrio vs Ferdium:<br />
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>какой агрегатор выбрать?</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Ferdium — бесплатный open-source форк Franz. Сравниваем его с Centrio по поддержке, VPN и удобству для русскоязычных пользователей.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Обзор</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ferdium</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Ferdium — бесплатный и полностью открытый форк закрытого проекта Franz, развивается силами сообщества. Хороший выбор для тех, кто ценит open-source и готов самостоятельно разбираться с рецептами сервисов и настройкой.
                </p>
              </div>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Centrio</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Centrio — агрегатор с официальной поддержкой на русском языке, встроенным VPN и готовой интеграцией VK и других российских сервисов «из коробки», без ручной настройки.
                </p>
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Сравнительная таблица</h2>
            <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Параметр</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center', color: '#a5b4fc', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Centrio</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Ferdium</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '13px 20px', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.feature}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>{row.centrio}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.ferdium}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Когда выбрать Ferdium, а когда Centrio</h2>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.8, marginBottom: 14 }}>
                <strong style={{ color: '#e2e8f0' }}>Ferdium подойдёт</strong>, если для вас принципиален открытый код и вы готовы самостоятельно решать проблемы с рецептами сервисов без выделенной поддержки.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.8, margin: 0 }}>
                <strong style={{ color: '#a5b4fc' }}>Centrio подойдёт</strong>, если вам важны встроенный VPN, стабильная работа с VK и другими российскими сервисами «из коробки», официальная поддержка на русском языке и готовый подписанный установщик без ручной конфигурации.
              </p>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/vs-rambox" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Rambox →</Link>
              <Link href="/blog/vs-wavebox" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Wavebox →</Link>
              <Link href="/blog/is-it-safe" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Безопасно ли это? →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте Centrio бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Скачайте и сравните сами — бесплатный тариф без ограничений по времени.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>Версия 2.5.2 · Бесплатно · Windows · macOS · Linux</p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
