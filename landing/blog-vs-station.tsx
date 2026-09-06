import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Station больше не работает? Лучшая альтернатива в 2026 — сравнение с Centrio',
  description: 'Проект Station закрыт разработчиком в 2023 году — обновлений и поддержки больше нет. Разбираем, что выбрать вместо него, и сравниваем с Centrio: встроенный VPN, поддержка VK, активная разработка.',
  alternates: { canonical: 'https://centrio.me/blog/vs-station' },
  openGraph: {
    title: 'Station закрыт — что выбрать вместо него в 2026',
    description: 'Station больше не поддерживается. Сравниваем актуальную альтернативу Centrio — VPN, VK, активная разработка.',
    url: 'https://centrio.me/blog/vs-station',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const ROWS = [
  { feature: 'Статус проекта', centrio: '✅ Активно развивается', station: '❌ Закрыт разработчиком в 2023 году' },
  { feature: 'Обновления и патчи безопасности', centrio: '✅ Регулярные', station: '❌ Не выходят' },
  { feature: 'Поддержка пользователей', centrio: '✅ Официальная, на русском', station: '❌ Отсутствует' },
  { feature: 'Встроенный VPN', centrio: '✅ VLESS, VMess, Trojan, SS, Hysteria2', station: '❌ Не было' },
  { feature: 'Российские сервисы (VK, Яндекс)', centrio: '✅ Из коробки', station: '⚠️ Не было нативной поддержки' },
  { feature: 'Облачная синхронизация настроек', centrio: '✅ Pro', station: '⚠️ Была на своей инфраструктуре, статус неизвестен' },
  { feature: 'Windows / macOS / Linux', centrio: '✅', station: '✅ (последняя доступная версия)' },
  { feature: 'Риски использования сейчас', centrio: '✅ Минимальны', station: '⚠️ Без патчей безопасности и без гарантии работы сервисов' },
];

const FAQ = [
  { q: 'Почему Station перестал работать или обновляться?', a: 'Разработчик Station объявил о закрытии проекта в 2023 году. С тех пор приложение не получает обновлений, патчей безопасности и поддержки — многие интеграции с сервисами могли перестать работать из-за изменений на стороне самих сервисов.' },
  { q: 'Можно ли ещё пользоваться Station?', a: 'Технически последняя версия может запускаться, но без обновлений это связано с рисками: непропатченные уязвимости и вероятность, что отдельные сервисы со временем перестанут открываться из-за изменений в их веб-версиях.' },
  { q: 'Перенесутся ли мои сервисы и настройки при переходе на Centrio?', a: 'Автоматического переноса из Station нет, но добавление сервисов в Centrio занимает пару минут — большинство мессенджеров и веб-сервисов авторизуются заново через QR-код или логин, как при первой настройке.' },
  { q: 'Чем Centrio отличается от Station, кроме факта поддержки?', a: 'Centrio дополнительно включает встроенный VPN с несколькими протоколами, готовую интеграцию VK и других российских сервисов «из коробки» и официальную поддержку на русском языке.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Station больше не работает? Лучшая альтернатива в 2026 — сравнение с Centrio', item: 'https://centrio.me/blog/vs-station' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Station больше не работает? Лучшая альтернатива в 2026 — сравнение с Centrio',
  description: 'Проект Station закрыт разработчиком в 2023 году — обновлений и поддержки больше нет. Разбираем, что выбрать вместо него, и сравниваем с Centrio: встроенный VPN, поддержка VK, активная разработка.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-13',
  dateModified: '2026-08-13',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/vs-station' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};

export default function VsStationPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 50px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Сравнение · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Station больше не работает?{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Актуальная альтернатива</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Разработчик Station закрыл проект в 2023 году. Разбираем, почему не стоит на него полагаться сейчас, и сравниваем с активно поддерживаемым Centrio.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~5 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 16, padding: '20px 24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                <strong style={{ color: '#f87171' }}>Важно:</strong> Station — один из самых узнаваемых ранних агрегаторов веб-сервисов, но его разработчик официально закрыл проект в 2023 году. Приложение больше не обновляется, патчи безопасности не выходят, а работа отдельных интеграций со временем может нарушаться из-за изменений на стороне самих сервисов.
              </p>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Обзор</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Station</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Был лёгким и удобным агрегатором для стартапов и фрилансеров, но с 2023 года не развивается — новые пользователи наследуют все риски неподдерживаемого софта.
                </p>
              </div>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Centrio</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Активно развивающийся агрегатор с официальной поддержкой на русском языке, встроенным VPN и готовой интеграцией VK и других российских сервисов «из коробки».
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
                    <th style={{ padding: '14px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Station</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '13px 20px', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.feature}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>{row.centrio}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.station}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Частые вопросы</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FAQ.map((item) => (
                <div key={item.q} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.q}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/vs-rambox" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Rambox →</Link>
              <Link href="/blog/vs-ferdium" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Ferdium →</Link>
              <Link href="/blog/best-messenger-aggregators" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Топ-7 агрегаторов мессенджеров →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Перейдите на активно поддерживаемый агрегатор</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Скачайте Centrio и настройте сервисы заново за пару минут — бесплатный тариф без ограничений по времени.</p>
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
