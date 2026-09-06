import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Топ-10 приложений в Centrio — апрель 2026',
  description: 'Самые популярные мессенджеры и сервисы среди пользователей Centrio в апреле 2026. Telegram, WhatsApp, Discord и другие — смотрите статистику.',
  alternates: { canonical: 'https://centrio.me/blog/top-apps' },
  openGraph: {
    title: 'Топ-10 приложений в Centrio — апрель 2026',
    description: 'Рейтинг самых популярных сервисов среди пользователей Centrio.',
    url: 'https://centrio.me/blog/top-apps',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const MONTHS = [
  {
    month: 'Апрель 2026',
    apps: [
      { rank: 1,  name: 'Telegram',        pct: 82, color: '#26a5e4', change: '→' },
      { rank: 2,  name: 'WhatsApp',         pct: 71, color: '#25d366', change: '→' },
      { rank: 3,  name: 'Discord',          pct: 58, color: '#5865f2', change: '↑' },
      { rank: 4,  name: 'Gmail',            pct: 54, color: '#ea4335', change: '↑' },
      { rank: 5,  name: 'Slack',            pct: 47, color: '#4a154b', change: '↓' },
      { rank: 6,  name: 'VK',              pct: 44, color: '#0077ff', change: '↑' },
      { rank: 7,  name: 'Notion',          pct: 38, color: '#fff', change: '↑' },
      { rank: 8,  name: 'Instagram',       pct: 35, color: '#e1306c', change: '→' },
      { rank: 9,  name: 'Jira',            pct: 29, color: '#0052cc', change: '↑' },
      { rank: 10, name: 'Zoom',            pct: 24, color: '#2d8cff', change: '→' },
    ]
  },
  {
    month: 'Март 2026',
    apps: [
      { rank: 1,  name: 'Telegram',        pct: 80, color: '#26a5e4', change: '→' },
      { rank: 2,  name: 'WhatsApp',         pct: 69, color: '#25d366', change: '→' },
      { rank: 3,  name: 'Slack',            pct: 55, color: '#4a154b', change: '↑' },
      { rank: 4,  name: 'Gmail',            pct: 51, color: '#ea4335', change: '↓' },
      { rank: 5,  name: 'Discord',          pct: 44, color: '#5865f2', change: '→' },
      { rank: 6,  name: 'VK',              pct: 40, color: '#0077ff', change: '→' },
      { rank: 7,  name: 'Instagram',       pct: 37, color: '#e1306c', change: '↑' },
      { rank: 8,  name: 'Notion',          pct: 33, color: '#fff', change: '→' },
      { rank: 9,  name: 'Zoom',            pct: 28, color: '#2d8cff', change: '↑' },
      { rank: 10, name: 'Figma',           pct: 22, color: '#a259ff', change: '↑' },
    ]
  },
];

const changeColor = (c: string) => c === '↑' ? '#22c55e' : c === '↓' ? '#ef4444' : 'rgba(255,255,255,0.3)'

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Топ-10 приложений в Centrio — апрель 2026', item: 'https://centrio.me/blog/top-apps' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Топ-10 приложений в Centrio — апрель 2026',
  description: 'Самые популярные мессенджеры и сервисы среди пользователей Centrio в апреле 2026. Telegram, WhatsApp, Discord и другие — смотрите статистику.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-04-01',
  dateModified: '2026-04-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/top-apps' },
};

export default function TopAppsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <style>{`
        .topapp-row { transition: background .15s; }
        .topapp-row:hover { background: rgba(255,255,255,0.035) !important; }
      `}</style>
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(59,130,246,0.15)', color: '#93c5fd', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Статистика · обновляется ежемесячно
          </div>
          <h1 style={{ fontSize: 'clamp(24px,4vw,44px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Топ-10 приложений{' '}
            <span style={{ background: 'linear-gradient(90deg,#60a5fa,#a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>в Centrio</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1.7, maxWidth: 560, margin: '0 auto' }}>
            Самые популярные мессенджеры и сервисы среди пользователей Centrio по данным агрегированной анонимной статистики.
          </p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          {MONTHS.map((month, mi) => (
            <section key={month.month} style={{ marginBottom: 56 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#e2e8f0' }}>{month.month}</h2>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                {mi === 0 && (
                  <span style={{ fontSize: 12, background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, padding: '3px 10px', fontWeight: 600 }}>
                    Актуально
                  </span>
                )}
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden' }}>
                {month.apps.map((app, i) => (
                  <div key={app.name} className="topapp-row" style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '16px 22px',
                    borderBottom: i < month.apps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    background: i === 0 ? 'rgba(59,130,246,0.05)' : 'transparent',
                  }}
                  >
                    {/* Rank */}
                    <div style={{ width: 32, textAlign: 'center', fontSize: 14, fontWeight: 700, color: i < 3 ? '#fff' : 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : app.rank}
                    </div>
                    {/* App dot */}
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: app.color, flexShrink: 0, boxShadow: `0 0 8px ${app.color}88` }} />
                    {/* Name */}
                    <div style={{ fontWeight: 600, fontSize: 14.5, flex: 1 }}>{app.name}</div>
                    {/* Bar */}
                    <div style={{ width: 200, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 4, flexShrink: 0 }}>
                      <div style={{ height: '100%', width: `${app.pct}%`, background: app.color, borderRadius: 4, opacity: 0.7, transition: 'width .6s' }} />
                    </div>
                    {/* Pct */}
                    <div style={{ width: 40, fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textAlign: 'right', flexShrink: 0 }}>
                      {app.pct}%
                    </div>
                    {/* Change */}
                    <div style={{ width: 16, fontSize: 13, fontWeight: 700, color: changeColor(app.change), textAlign: 'center', flexShrink: 0 }}>
                      {app.change}
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', marginTop: 12, textAlign: 'right' }}>
                * % пользователей, у которых добавлен данный сервис. Данные анонимизированы.
              </p>
            </section>
          ))}

          {/* Info block */}
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 16, padding: '24px 28px', marginBottom: 40 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Как считается рейтинг</h3>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.75, margin: 0 }}>
              Рейтинг основан на агрегированной анонимной статистике: процент пользователей Centrio, у которых добавлен тот или иной сервис. Персональные данные не собираются и не передаются третьим лицам. Статистика обновляется в начале каждого месяца.
            </p>
          </div>

          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Добавьте все эти сервисы в Centrio</h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', marginBottom: 24 }}>100+ сервисов в одном окне. Бесплатно для первых 5.</p>
            <a href="https://download.centrio.me/Centrio%20Setup%202.5.2.exe"
              style={{ display: 'inline-block', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 12, padding: '13px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
              ⬇ Скачать Centrio бесплатно
            </a>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
