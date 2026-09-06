import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Как перестать переключаться между вкладками мессенджеров',
  description: 'Десятки вкладок браузера с Telegram, WhatsApp, VK и почтой — источник постоянной потери внимания. Разбираем, как перестать переключаться между вкладками и собрать всё в одном окне.',
  alternates: { canonical: 'https://centrio.me/blog/stop-switching-tabs' },
  openGraph: {
    title: 'Как перестать переключаться между вкладками мессенджеров',
    description: 'Считаем реальную цену переключения контекста и показываем решение — единое окно для всех мессенджеров.',
    url: 'https://centrio.me/blog/stop-switching-tabs',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const COSTS = [
  { title: 'Потеря фокуса', text: 'Возврат к задаче после переключения контекста занимает не секунды, а минуты — мозгу нужно время, чтобы восстановить нить рассуждений.' },
  { title: 'Пропущенные уведомления', text: 'Уведомление в свёрнутой вкладке браузера легко теряется среди десятков открытых окон — сообщение замечается с опозданием на часы.' },
  { title: 'Визуальный шум', text: 'Панель вкладок браузера, забитая иконками мессенджеров, затрудняет поиск нужной прямо здесь и сейчас — приходится вчитываться в подписи.' },
  { title: 'Перезагрузка сессий', text: 'Браузер выгружает неактивные вкладки при нехватке памяти — открывая их заново, вы теряете прокрутку и иногда получаете разлогин.' },
];

const SOLUTIONS = [
  { n: 1, title: 'Соберите все сервисы в одном окне', text: 'Приложение вроде Centrio держит каждый мессенджер в отдельной вкладке внутри одного окна — переключение по клику или горячей клавише, без потери сессии.' },
  { n: 2, title: 'Организуйте по папкам', text: 'Сгруппируйте сервисы по смыслу — «Работа», «Личное», «Проекты» — вместо плоского списка из десятка иконок.' },
  { n: 3, title: 'Настройте нативные уведомления', text: 'Уведомления операционной системы заметнее, чем значок в свёрнутой вкладке, и работают даже когда приложение свёрнуто в трей.' },
  { n: 4, title: 'Используйте горячие клавиши', text: 'Быстрое переключение между сервисами по сочетанию клавиш убирает необходимость искать нужную вкладку глазами.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Как перестать переключаться между вкладками мессенджеров', item: 'https://centrio.me/blog/stop-switching-tabs' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Как перестать переключаться между вкладками мессенджеров',
  description: 'Десятки вкладок браузера с Telegram, WhatsApp, VK и почтой — источник постоянной потери внимания. Разбираем, как перестать переключаться между вкладками и собрать всё в одном окне.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/stop-switching-tabs' },
};

export default function StopSwitchingTabsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(251,146,60,0.15)', color: '#fdba74', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Продуктивность · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Как перестать переключаться{' '}
            <span style={{ background: 'linear-gradient(90deg,#fb923c,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>между вкладками мессенджеров</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Десятки вкладок с Telegram, WhatsApp, VK и почтой — источник постоянных мелких потерь внимания. Разбираем, откуда берётся эта усталость и как от неё избавиться.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Реальная цена переключения вкладок</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {COSTS.map((c) => (
                <div key={c.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{c.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{c.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как решить проблему на практике</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SOLUTIONS.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#fdba74', flexShrink: 0 }}>{s.n}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{s.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/who-needs-it" style={{ color: '#fdba74', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(253,186,116,0.25)', borderRadius: 10, padding: '8px 16px' }}>Кому нужна такая программа →</Link>
              <Link href="/blog/how-to-combine-messengers" style={{ color: '#fdba74', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(253,186,116,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как объединить мессенджеры →</Link>
              <Link href="/blog/remote-team-messengers" style={{ color: '#fdba74', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(253,186,116,0.25)', borderRadius: 10, padding: '8px 16px' }}>Мессенджеры для удалённой команды →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Соберите все вкладки в одном окне</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Скачайте Centrio бесплатно и почувствуйте разницу уже сегодня.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#fb923c,#f472b6)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(251,146,60,0.4)' }}>
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
