'use client'
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { useLang } from '@/lib/i18n';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

const tableData = [
  { feature: 'Бесплатный тариф', centrio: '✅ До 5 сервисов', rambox: '❌ Только пробный период' },
  { feature: 'Цена Pro/месяц', centrio: '✅ 199 ₽ (~2.2$)', rambox: '❌ $7 (650+ ₽)' },
  { feature: 'Цена Pro/год', centrio: '✅ 1 590 ₽ (~17.5$)', rambox: '❌ $84 (7 700+ ₽)' },
  { feature: 'Количество сервисов', centrio: '✅ 100+', rambox: '⚠️ 100+ (многие устарели)' },
  { feature: 'Windows', centrio: '✅', rambox: '✅' },
  { feature: 'macOS', centrio: '✅', rambox: '✅' },
  { feature: 'Linux', centrio: '✅', rambox: '✅' },
  { feature: 'Встроенный VPN', centrio: '✅ (VLESS, VMess, Trojan, SS, Hysteria2)', rambox: '❌ Нет' },
  { feature: 'Производительность (RAM)', centrio: '✅ ~180 МБ', rambox: '❌ ~350 МБ' },
  { feature: 'Время запуска', centrio: '✅ ~2 сек', rambox: '❌ ~5–8 сек' },
  { feature: 'Российские сервисы (VK, OK)', centrio: '✅', rambox: '⚠️ Частично' },
  { feature: 'Прокси на сервис', centrio: '✅', rambox: '✅ (только Pro)' },
  { feature: 'Облачная синхронизация', centrio: '✅ Pro', rambox: '✅ Pro' },
  { feature: 'Автообновление', centrio: '✅', rambox: '✅' },
  { feature: 'Русскоязычная поддержка', centrio: '✅', rambox: '❌' },
  { feature: 'Интерфейс на русском', centrio: '✅', rambox: '❌' },
];

const diffs = [
  { title: '💰 Цена — главное преимущество Centrio', text: 'Rambox Pro стоит от $7 в месяц или $84 в год — это более 650 ₽ и 7 700 ₽ соответственно по текущему курсу. Centrio Pro обходится всего в 199 ₽/месяц или 1 590 ₽/год. Разница в 3–5 раз делает Centrio очевидным выбором для пользователей, которые ценят соотношение цены и качества.' },
  { title: '🔒 Встроенный VPN — уникальная функция Centrio', text: 'Centrio — единственный агрегатор мессенджеров со встроенным VPN. Поддерживаются протоколы VLESS, VMess, Trojan, Shadowsocks и Hysteria2. В Rambox встроенного VPN нет.' },
  { title: '⚡ Производительность — Centrio быстрее', text: 'В тестах Centrio потребляет около 180 МБ ОЗУ при 5 открытых сервисах, тогда как Rambox — около 350 МБ. Время запуска Centrio ~2 сек против 5–8 сек у Rambox.' },
  { title: '🇷🇺 Поддержка российских сервисов', text: 'Centrio создавался с акцентом на русскоязычных пользователей. Встроена поддержка ВКонтакте, Одноклассников, Яндекс.Мессенджера. В Rambox эти сервисы отсутствуют или нестабильны.' },
  { title: '🆓 Бесплатный тариф', text: 'Centrio предлагает полноценный бесплатный тариф с поддержкой до 5 сервисов. Rambox не имеет бесплатного тарифа — только пробный период.' },
];

const perfData = [
  { metric: 'RAM (5 сервисов)', centrio: '~180 МБ', rambox: '~350 МБ' },
  { metric: 'Запуск', centrio: '~2 сек', rambox: '5–8 сек' },
  { metric: 'CPU в простое', centrio: '< 1%', rambox: '2–4%' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Centrio vs Rambox: сравнение агрегаторов мессенджеров 2026', item: 'https://centrio.me/blog/vs-rambox' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Centrio vs Rambox: сравнение агрегаторов мессенджеров 2026',
  description: 'Подробное сравнение Centrio и Rambox — двух популярных агрегаторов мессенджеров. Цены, функции, производительность, поддерживаемые сервисы. Что выбрать в 2026 году?',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-04-01',
  dateModified: '2026-08-13',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/vs-rambox' },
};

export default function VsRamboxPage() {
  const { t } = useLang();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 50px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            {t.blog_badge_compare ?? 'Сравнение · 2026'}
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Centrio vs Rambox:<br />
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>какой агрегатор выбрать?</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Подробное сравнение двух популярных агрегаторов мессенджеров — по цене, производительности, функциям и поддержке российских сервисов.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>{t.blog_updated ?? 'Обновлено: август 2026 · Время чтения: ~5 мин'}</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>{t.blog_section_overview ?? 'Обзор'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rambox</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Rambox — один из пионеров жанра, существует с 2016 года. Поддерживает более 100 сервисов, работает на Windows, macOS и Linux. Высокая цена Pro ($7/мес) и отсутствие русскоязычного интерфейса делают его менее привлекательным для российской аудитории.
                </p>
              </div>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Centrio</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Centrio — современный агрегатор мессенджеров с фокусом на русскоязычных пользователей. Полностью русский интерфейс, встроенный VPN, поддержка VK и отечественных сервисов, доступная цена Pro (199 ₽/мес) и лучшая производительность.
                </p>
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>{t.blog_section_table ?? 'Сравнительная таблица'}</h2>
            <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{t.blog_table_param ?? 'Параметр'}</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center', color: '#a5b4fc', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Centrio</th>
                    <th style={{ padding: '14px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Rambox</th>
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, i) => (
                    <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '13px 20px', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.feature}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>{row.centrio}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.rambox}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>{t.blog_section_diffs ?? 'Ключевые отличия'}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {diffs.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>{t.blog_section_perf ?? 'Производительность'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
              {perfData.map((m) => (
                <div key={m.metric} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                  <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.metric}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                    <div><div style={{ fontSize: 11, color: '#a5b4fc', marginBottom: 4 }}>Centrio</div><div style={{ fontWeight: 700, color: '#4ade80' }}>{m.centrio}</div></div>
                    <div><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Rambox</div><div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>{m.rambox}</div></div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>{t.blog_section_prices ?? 'Сравнение цен'}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '28px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Rambox Pro</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#f87171', marginBottom: 4 }}>$7<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>/мес</span></div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 16 }}>или $84/год (~7 700 ₽)</div>
                <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Нет бесплатного тарифа</div>
              </div>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.12))', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 16, padding: '28px', textAlign: 'center' }}>
                <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Centrio Pro</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#4ade80', marginBottom: 4 }}>199 ₽<span style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>/мес</span></div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginBottom: 16 }}>или 1 590 ₽/год</div>
                <div style={{ color: '#4ade80', fontSize: 13, fontWeight: 600 }}>✅ Бесплатный тариф навсегда</div>
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>{t.blog_section_verdict ?? 'Вердикт'}</h2>
            <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20, padding: '32px' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 1.8, marginBottom: 16 }}>
                Rambox — зрелый продукт с длинной историей. Однако высокая цена, отсутствие русского интерфейса, повышенное потребление ресурсов и отсутствие встроенного VPN — серьёзные минусы для российских пользователей.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 16, lineHeight: 1.8, margin: 0 }}>
                <strong style={{ color: '#a5b4fc' }}>Centrio побеждает</strong> по цене (в 3–5 раз дешевле), производительности, встроенному VPN, поддержке российских сервисов и удобству для русскоязычных пользователей.
              </p>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/vs-franz" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Franz →</Link>
              <Link href="/blog/vs-wavebox" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Wavebox →</Link>
              <Link href="/blog/best-messenger-aggregators" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Топ-7 агрегаторов мессенджеров →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>{t.blog_cta_try_free ?? 'Попробуйте Centrio бесплатно'}</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>{t.blog_cta_try_free_desc ?? 'Скачайте и убедитесь сами — без ограничений по времени.'}</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
              {t.blog_cta_dl_win ?? '⬇ Скачать Centrio для Windows'}
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>{t.blog_cta_platforms ?? 'Версия 2.5.2 · Бесплатно · Windows · macOS · Linux'}</p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
