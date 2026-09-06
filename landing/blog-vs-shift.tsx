import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Centrio vs Shift: сравнение агрегаторов мессенджеров 2026',
  description: 'Centrio против Shift — сравниваем цену, лимиты бесплатной версии, встроенный VPN и поддержку российских сервисов. Что выбрать для мессенджеров и почты в 2026 году?',
  alternates: { canonical: 'https://centrio.me/blog/vs-shift' },
  openGraph: {
    title: 'Centrio vs Shift: полное сравнение',
    description: 'Сравниваем цену, лимиты бесплатной версии и VPN — Shift против Centrio.',
    url: 'https://centrio.me/blog/vs-shift',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const ROWS = [
  { feature: 'Бесплатная версия', centrio: '✅ Полноценная, без ограничения по числу вкладок', shift: '⚠️ Сильно урезана — лимит на количество приложений' },
  { feature: 'Платная подписка', centrio: 'От 199 ₽/мес', shift: 'От ~$99/год (Advanced)' },
  { feature: 'Встроенный VPN', centrio: '✅ VLESS, VMess, Trojan, SS, Hysteria2', shift: '❌ Нет' },
  { feature: 'Российские сервисы (VK, Яндекс)', centrio: '✅ Из коробки', shift: '⚠️ Добавляются вручную как произвольный сайт' },
  { feature: 'Русскоязычный интерфейс и поддержка', centrio: '✅', shift: '❌ Только английский' },
  { feature: 'Облачная синхронизация настроек', centrio: '✅ Pro', shift: '✅ В платных тарифах' },
  { feature: 'Windows / macOS / Linux', centrio: '✅', shift: '⚠️ Исторически сильнее ориентирован на macOS' },
  { feature: 'Показ рекламы в бесплатной версии', centrio: '❌ Нет', shift: '⚠️ Ограничения без покупки' },
];

const FAQ = [
  { q: 'Чем Shift отличается от обычного браузера с вкладками?', a: 'Shift даёт единое окно для нескольких аккаунтов почты и веб-сервисов с отдельными уведомлениями для каждого — похоже на Centrio, но без встроенного VPN и с более ограниченной бесплатной версией.' },
  { q: 'Почему Shift дороже Centrio?', a: 'Shift — давний игрок на рынке, ориентированный в основном на англоязычный корпоративный сегмент; ценообразование и позиционирование у него другие. Centrio ориентирован на массового пользователя и держит цену ниже при сравнимом наборе функций плюс встроенном VPN.' },
  { q: 'Есть ли у Shift встроенный VPN как в Centrio?', a: 'Нет, у Shift нет встроенного VPN — если сервис заблокирован или недоступен в вашей сети, потребуется отдельное VPN-приложение. В Centrio VPN уже встроен в клиент.' },
  { q: 'Поддерживает ли Shift VK и другие российские сервисы?', a: 'Нативной интеграции нет — VK и подобные сервисы можно добавить только как произвольный сайт по URL, без специальных настроек уведомлений, которые есть в Centrio.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Centrio vs Shift: сравнение агрегаторов мессенджеров 2026', item: 'https://centrio.me/blog/vs-shift' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Centrio vs Shift: сравнение агрегаторов мессенджеров 2026',
  description: 'Centrio против Shift — сравниваем цену, лимиты бесплатной версии, встроенный VPN и поддержку российских сервисов. Что выбрать для мессенджеров и почты в 2026 году?',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-13',
  dateModified: '2026-08-13',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/vs-shift' },
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

export default function VsShiftPage() {
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
          <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Centrio vs Shift:<br />
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>какой агрегатор выбрать?</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Shift — заметный игрок на macOS с богатым набором приложений, но самый дорогой в подборке и без встроенного VPN. Сравниваем с Centrio.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Обзор</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Shift</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Известный агрегатор почты и веб-сервисов, исторически сильнее ориентированный на macOS. Богатый набор интеграций, но самый дорогой вариант в этой категории, а бесплатная версия сильно урезана по числу приложений.
                </p>
              </div>
              <div style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.1),rgba(139,92,246,0.1))', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: '24px' }}>
                <div style={{ fontSize: 13, color: '#a5b4fc', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Centrio</div>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
                  Дешевле, с полноценной бесплатной версией без лимита на число вкладок, встроенным VPN и готовой интеграцией VK и других российских сервисов «из коробки», с интерфейсом и поддержкой на русском языке.
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
                    <th style={{ padding: '14px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>Shift</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row, i) => (
                    <tr key={row.feature} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                      <td style={{ padding: '13px 20px', color: 'rgba(255,255,255,0.7)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.feature}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.05)', fontWeight: 500 }}>{row.centrio}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{row.shift}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 26, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Когда выбрать Shift, а когда Centrio</h2>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.8, marginBottom: 14 }}>
                <strong style={{ color: '#e2e8f0' }}>Shift подойдёт</strong>, если вы уже привыкли к его интерфейсу, работаете преимущественно на macOS и цена не критична.
              </p>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.8, margin: 0 }}>
                <strong style={{ color: '#a5b4fc' }}>Centrio подойдёт</strong>, если важны более низкая цена, полноценная бесплатная версия без строгого лимита на приложения, встроенный VPN и нативная поддержка VK и других российских сервисов с интерфейсом на русском языке.
              </p>
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
              <Link href="/blog/vs-wavebox" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Wavebox →</Link>
              <Link href="/blog/vs-station" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Station →</Link>
              <Link href="/blog/best-messenger-aggregators" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Топ-7 агрегаторов мессенджеров →</Link>
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
