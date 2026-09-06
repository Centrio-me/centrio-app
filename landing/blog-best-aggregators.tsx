import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Лучшие агрегаторы мессенджеров в 2026 году: топ-7 с плюсами и минусами',
  description: 'Сравнение лучших программ для объединения мессенджеров в одном окне: Centrio, Rambox, Franz, Ferdium, Wavebox, Station, Shift. Цены, поддержка русского языка, VPN, лимиты вкладок.',
  alternates: { canonical: 'https://centrio.me/blog/best-messenger-aggregators' },
  openGraph: {
    title: 'Топ-7 агрегаторов мессенджеров 2026',
    description: 'Centrio, Rambox, Franz, Ferdium, Wavebox, Station, Shift — сравнение в одной таблице.',
    url: 'https://centrio.me/blog/best-messenger-aggregators',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const APPS = [
  {
    name: '1. Centrio', color: '#f472b6',
    text: 'Изолированные сессии для каждой вкладки (можно добавить один сервис несколько раз под разными аккаунтами), встроенный VPN с VLESS/VMess/Trojan/Shadowsocks/Hysteria2 без отдельного приложения, поддержка русского языка из коробки. Бесплатный тариф без ограничения по времени.',
    best: 'тем, кому нужны несколько аккаунтов одного мессенджера + VPN без танцев с бубном',
  },
  {
    name: '2. Rambox', color: '#a5b4fc',
    text: 'Один из старейших игроков рынка, более 700 готовых интеграций сервисов. Богатый функционал, но интерфейс перегружен, а бесплатная версия ограничивает число одновременных сервисов.',
    best: 'тем, кому нужна экзотика — редкие корпоративные сервисы из большого каталога',
  },
  {
    name: '3. Franz', color: '#a5b4fc',
    text: 'Один из первопроходцев категории. Простой и лёгкий, но бесплатный тариф урезан до 3 сервисов, а разработка после перехода в Ferdium заметно замедлилась.',
    best: 'тем, кто хочет минимальный набор из 2-3 сервисов и не готов платить',
  },
  {
    name: '4. Ferdium', color: '#a5b4fc',
    text: 'Открытый форк Franz без искусственных лимитов и платных подписок. Полностью бесплатен, но нет встроенного VPN и требует ручной настройки прокси при проблемах с доступом.',
    best: 'тем, кто ценит open-source и готов сам разбираться с сетевыми проблемами',
  },
  {
    name: '5. Wavebox', color: '#a5b4fc',
    text: 'Заточен под команды и Google Workspace — сильная интеграция с почтой и календарём. Дороже конкурентов на командном тарифе и менее удобен для личного использования.',
    best: 'командам, которые уже живут в экосистеме Google Workspace',
  },
  {
    name: '6. Station', color: '#93c5fd',
    text: 'Была популярна как лёгкий агрегатор для стартапов, но проект закрыт разработчиком в 2023 году — обновлений и поддержки больше нет.',
    best: 'никого не стоит — проект не поддерживается, риски накапливаются',
  },
  {
    name: '7. Shift', color: '#93c5fd',
    text: 'Заметный игрок на Mac, доступен и на Windows. Богатый набор приложений, но самый дорогой в подборке, а бесплатная версия сильно урезана.',
    best: 'тем, для кого цена не главный критерий, а привычен интерфейс Shift',
  },
];

const CRITERIA = [
  { title: 'Изоляция сессий', text: 'Может ли приложение держать два аккаунта одного и того же сервиса одновременно, не путая сессии и куки между вкладками.' },
  { title: 'VPN из коробки', text: 'Нужно ли ставить и настраивать отдельный VPN-клиент, чтобы сервисы вроде Telegram стабильно работали, или это встроено.' },
  { title: 'Русский язык', text: 'Локализован ли интерфейс, или придётся работать в англоязычном приложении.' },
  { title: 'Честный бесплатный тариф', text: 'Ограничивает ли бесплатная версия число сервисов или время использования, или это маркетинговый триал.' },
  { title: 'Поддержка и обновления', text: 'Развивается ли проект активно — история знает случаи (Station), когда популярный агрегатор просто переставал обновляться.' },
];

const FAQ = [
  { q: 'Чем агрегатор мессенджеров отличается от простого набора вкладок в браузере?', a: 'Агрегатор даёт единые уведомления, бейджи непрочитанных на иконке в трее, отдельные изолированные сессии для каждого аккаунта и не сбрасывает вкладки при перезапуске компьютера — обычные вкладки браузера это не гарантируют.' },
  { q: 'Какой агрегатор лучше для нескольких аккаунтов Telegram или WhatsApp?', a: 'Нужна программа с полной изоляцией сессий на уровне каждой вкладки, а не общим профилем браузера — из перечисленных в статье этому критерию наиболее полно отвечает Centrio.' },
  { q: 'Есть ли бесплатные агрегаторы без ограничений?', a: 'Ferdium полностью бесплатен как open-source проект. Centrio также предлагает бесплатный тариф без ограничения по времени использования, но с урезанным набором функций по сравнению с платным.' },
  { q: 'Нужен ли отдельно VPN-клиент при использовании агрегатора?', a: 'Зависит от приложения. Rambox, Franz, Ferdium, Wavebox и Shift не имеют встроенного VPN — при проблемах с доступом к сервисам нужен отдельный VPN-клиент. Centrio включает VPN с несколькими протоколами прямо в приложение.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Лучшие агрегаторы мессенджеров в 2026 году: топ-7 с плюсами и минусами', item: 'https://centrio.me/blog/best-messenger-aggregators' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Лучшие агрегаторы мессенджеров в 2026 году: топ-7 с плюсами и минусами',
  description: 'Сравнение лучших программ для объединения мессенджеров в одном окне: Centrio, Rambox, Franz, Ferdium, Wavebox, Station, Shift. Цены, поддержка русского языка, VPN, лимиты вкладок.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/best-messenger-aggregators' },
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

export default function BestAggregatorsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(244,114,182,0.15)', color: '#f472b6', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Подборка · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Лучшие агрегаторы мессенджеров{' '}
            <span style={{ background: 'linear-gradient(90deg,#f472b6,#a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>в 2026 году</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Топ-7 программ для объединения WhatsApp, Telegram, VK и других сервисов в одном окне — с честными плюсами и минусами каждой.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~6 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>По каким критериям сравнивали</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CRITERIA.map((c) => (
                <div key={c.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{c.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{c.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Топ-7 агрегаторов</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {APPS.map((a) => (
                <div key={a.name} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: a.color }}>{a.name}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: '0 0 10px' }}>{a.text}</p>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13.5, lineHeight: 1.6, margin: 0 }}><strong style={{ color: 'rgba(255,255,255,0.6)' }}>Кому подойдёт:</strong> {a.best}</p>
                </div>
              ))}
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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Подробные сравнения</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/vs-rambox" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Rambox →</Link>
              <Link href="/blog/vs-franz" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Franz →</Link>
              <Link href="/blog/vs-ferdium" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Ferdium →</Link>
              <Link href="/blog/vs-wavebox" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Wavebox →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте Centrio бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Изолированные сессии, встроенный VPN и русский интерфейс — без ограничения по времени на бесплатном тарифе.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#4ade80,#22d3ee)', color: '#06060f', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(74,222,128,0.35)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Версия 2.5.2 · Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
