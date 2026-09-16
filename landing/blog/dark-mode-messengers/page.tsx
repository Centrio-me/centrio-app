import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Тёмная тема для мессенджеров без встроенной поддержки: как включить в Centrio',
  description: 'Как принудительно включить тёмную тему для любого сайта или мессенджера, у которого нет собственного тёмного режима, и почему это не только про эстетику.',
  alternates: { canonical: 'https://centrio.me/blog/dark-mode-messengers' },
  openGraph: {
    title: 'Тёмная тема для мессенджеров',
    description: 'Как включить тёмную тему для любого мессенджера в Centrio, даже если сервис не поддерживает её сам.',
    url: 'https://centrio.me/blog/dark-mode-messengers',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const WHY_IT_MATTERS = [
  { title: 'Меньше нагрузка на глаза вечером', text: 'Яркий белый фон в тёмной комнате создаёт сильный контраст, из-за которого глазам приходится постоянно адаптироваться — особенно заметно при работе допоздна.' },
  { title: 'Экономия заряда на OLED-экранах', text: 'На экранах с OLED-матрицей тёмные пиксели физически потребляют меньше энергии, чем светлые — на ноутбуках с OLED-дисплеем это отражается на автономности.' },
  { title: 'Меньше синего света перед сном', text: 'Тёмный интерфейс снижает общую яркость экрана вечером, что часть исследований сна связывает с более лёгким засыпанием — хотя это не заменяет общие рекомендации сократить экранное время перед сном.' },
];

const STEPS = [
  { n: '1', title: 'Включите расширение', text: 'Настройки → Расширения → «Тёмная тема» — переключатель включает саму возможность применять принудительную инверсию цветов к сервисам.' },
  { n: '2', title: 'Кликните правой кнопкой по нужной вкладке', text: 'В контекстном меню появится пункт «Тёмная тема» — применяется индивидуально к каждому мессенджеру, а не глобально ко всем сразу.' },
  { n: '3', title: 'Отключите там, где не нужно', text: 'Некоторые сервисы уже имеют собственную качественную тёмную тему (например, Telegram) — для них принудительная инверсия обычно не нужна, достаточно переключить тему в настройках самого сервиса.' },
];

const FAQ = [
  { q: 'Чем принудительная тёмная тема отличается от встроенной?', a: 'Встроенная тёмная тема разработана самим сервисом и учитывает все элементы интерфейса. Принудительная — это программная инверсия цветов на уровне страницы, которая работает для любого сайта без собственной тёмной темы, но иногда не идеально «попадает» в отдельные элементы вроде изображений.' },
  { q: 'Работает ли тёмная тема для всех сервисов одинаково хорошо?', a: 'Качество зависит от структуры конкретного сайта. Для большинства текстовых интерфейсов результат выглядит естественно, но страницы с большим числом встроенных изображений на светлом фоне иногда требуют доработки восприятия — это ограничение принудительной инверсии в целом, а не конкретной реализации.' },
  { q: 'Нужна ли Pro-подписка для тёмной темы?', a: 'Да, «Тёмная тема» — часть набора Pro-расширений Centrio.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Тёмная тема для мессенджеров', item: 'https://centrio.me/blog/dark-mode-messengers' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Тёмная тема для мессенджеров без встроенной поддержки: как включить в Centrio',
  description: 'Как принудительно включить тёмную тему для любого сайта или мессенджера, у которого нет собственного тёмного режима.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/dark-mode-messengers' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function DarkModeMessengersPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(139,92,246,0.15)', color: '#c4b5fd', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Плагины
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Тёмная тема{' '}
            <span style={{ background: 'linear-gradient(90deg,#c4b5fd,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>для любого мессенджера</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Не у каждого сервиса есть собственная тёмная тема. Расширение Centrio включает её принудительно — на уровне страницы, для любого сайта.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~4 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Почему это не только про эстетику</> },
          { id: 'section-2', title: <>Как включить</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Далеко не все сайты и веб-сервисы предлагают собственную тёмную тему — многие корпоративные почтовые клиенты, CRM-системы и нишевые мессенджеры так и остаются ярко-белыми, даже когда операционная система и весь остальной софт на компьютере работает в тёмном режиме. Централизованное решение этой проблемы в Centrio — расширение, которое инвертирует цвета страницы на лету, без необходимости ждать, когда разработчик сервиса добавит тёмный режим сам.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Почему это не только про эстетику</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHY_IT_MATTERS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как включить</h2>
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
            <h2 id="section-3" style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Частые вопросы</h2>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Включите тёмную тему везде</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Доступно на Pro-тарифе Centrio.</p>
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
