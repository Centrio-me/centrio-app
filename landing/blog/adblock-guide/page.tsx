import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Блокировщик рекламы в мессенджерах: как включить в Centrio и что он убирает',
  description: 'Как работает встроенный блокировщик рекламы Centrio: что именно он убирает в VK, Одноклассниках и других сервисах с рекламой, как включить и почему это ускоряет загрузку страниц.',
  alternates: { canonical: 'https://centrio.me/blog/adblock-guide' },
  openGraph: {
    title: 'Блокировщик рекламы в Centrio',
    description: 'Как включить встроенный AdBlock и что он реально блокирует в мессенджерах и соцсетях.',
    url: 'https://centrio.me/blog/adblock-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const WHAT_IT_BLOCKS = [
  { title: 'Баннерная и видеореклама', text: 'Рекламные блоки на страницах соцсетей и почтовых сервисов — особенно заметно на сервисах вроде ВКонтакте и Одноклассников, где реклама встроена прямо в ленту и боковые панели.' },
  { title: 'Трекеры и аналитика третьих лиц', text: 'Скрипты, которые собирают данные о поведении на странице для рекламных сетей, — их загрузка блокируется до того, как они успевают отправить данные.' },
  { title: 'Всплывающие окна и оверлеи с призывом подписаться', text: 'Модальные окна, перекрывающие контент до тех пор, пока не согласишься на push-уведомления или не закроешь баннер вручную.' },
  { title: 'Автовоспроизводимые видеорекламные вставки', text: 'Видео, которое начинает проигрываться само при прокрутке страницы — частый источник неожиданного звука в фоновой вкладке.' },
];

const BENEFITS = [
  { title: 'Меньше отвлекающих элементов', text: 'Рекламные баннеры конкурируют за внимание с настоящим содержимым страницы — их отсутствие делает интерфейс визуально спокойнее.' },
  { title: 'Быстрее загрузка страниц', text: 'Часть времени загрузки уходит именно на рекламные скрипты и трекеры — блокировка на уровне сети экономит это время ещё до отрисовки страницы.' },
  { title: 'Меньше расход трафика', text: 'Рекламные баннеры и видео — не бесплатные мегабайты, особенно заметно при ограниченном или медленном интернет-соединении.' },
];

const STEPS = [
  { n: '1', title: 'Откройте Настройки → Расширения', text: 'Список расширений находится в боковом меню настроек Centrio.' },
  { n: '2', title: 'Включите «AdBlock»', text: 'Один переключатель включает блокировку сразу для всех подключённых мессенджеров и сервисов — отдельная настройка на каждую вкладку не нужна.' },
  { n: '3', title: 'Обновите открытые вкладки', text: 'Если сервис был открыт до включения блокировщика, обновите вкладку (Ctrl+R) — правило начинает применяться сразу для новых загрузок страницы.' },
];

const FAQ = [
  { q: 'Блокировщик рекламы работает во всех подключённых сервисах?', a: 'Да, правило применяется ко всем вкладкам сразу после включения — не нужно настраивать каждый мессенджер по отдельности.' },
  { q: 'Может ли блокировщик сломать работу сайта?', a: 'В редких случаях сайт, тесно завязанный на рекламные скрипты для части интерфейса, может отображаться иначе. Если сервис ведёт себя странно после включения, попробуйте временно отключить AdBlock именно для него через настройки.' },
  { q: 'AdBlock в Centrio — это то же самое, что расширение uBlock Origin?', a: 'Похожий принцип работы — блокировка по спискам известных рекламных и трекинговых доменов, — но встроенное решение работает на уровне всего приложения, а не отдельного браузера, и не требует установки стороннего расширения.' },
  { q: 'Нужна ли Pro-подписка для блокировщика рекламы?', a: 'Да, AdBlock — часть набора Pro-расширений Centrio, как и тёмная тема для любого сервиса, сплит-экран и папки.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Блокировщик рекламы в мессенджерах', item: 'https://centrio.me/blog/adblock-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Блокировщик рекламы в мессенджерах: как включить в Centrio и что он убирает',
  description: 'Как работает встроенный блокировщик рекламы Centrio и что именно он блокирует в соцсетях и почтовых сервисах.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/adblock-guide' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function AdblockGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(239,68,68,0.15)', color: '#fca5a5', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Плагины
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Блокировщик рекламы{' '}
            <span style={{ background: 'linear-gradient(90deg,#fca5a5,#f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>во всех мессенджерах сразу</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Один переключатель — и реклама, трекеры и автовоспроизводимое видео пропадают сразу во всех подключённых сервисах, без установки стороннего расширения.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Что блокируется</> },
          { id: 'section-2', title: <>Зачем это нужно, если реклама «просто есть»</> },
          { id: 'section-3', title: <>Как включить за 3 шага</> },
          { id: 'section-4', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Часть мессенджеров и соцсетей, доступных через веб-версию, показывает рекламу прямо в интерфейсе — так же, как это происходит в мобильном приложении. Встроенный блокировщик рекламы в Centrio избавляет от этого сразу во всех подключённых вкладках, без установки стороннего расширения для браузера и без риска, что расширение отвалится после очередного обновления.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Что блокируется</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHAT_IT_BLOCKS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Зачем это нужно, если реклама «просто есть»</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {BENEFITS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-3" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как включить за 3 шага</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS.map((step) => (
                <div key={step.n} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 16 }}>
                  <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{step.n}</div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{step.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-4" style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Частые вопросы</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FAQ.map((item) => (
                <div key={item.q} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.q}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Избавьтесь от рекламы во всех мессенджерах</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Встроенный AdBlock — часть Pro-подписки Centrio.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#4ade80,#22d3ee)', color: '#090d15', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(74,222,128,0.35)' }}>
              Скачать Centrio для Windows
             <ArrowDownToLine size={16} /></a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link>
            </p>
          </section>
              </EditorialArticle>
      <SiteFooter />
    </>
  );
}
