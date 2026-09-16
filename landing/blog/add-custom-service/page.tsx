import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Свой сервис в Centrio: как добавить любой сайт как отдельную вкладку',
  description: 'Как добавить в Centrio любой сайт, которого нет в стандартном каталоге — CRM-систему, корпоративный портал или нишевый мессенджер — как полноценную вкладку с уведомлениями.',
  alternates: { canonical: 'https://centrio.me/blog/add-custom-service' },
  openGraph: {
    title: 'Свой сервис в Centrio',
    description: 'Как добавить произвольный сайт как отдельную вкладку в Centrio.',
    url: 'https://centrio.me/blog/add-custom-service',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const STEPS = [
  { n: '1', title: 'Откройте «Добавить мессенджер»', text: 'Кнопка находится в верхней части боковой панели — там же, где выбираются сервисы из готового каталога.' },
  { n: '2', title: 'Выберите «Добавить свой»', text: 'Внизу окна добавления сервисов есть отдельный пункт для произвольного адреса — не нужно искать сервис в списке, если его там нет.' },
  { n: '3', title: 'Введите адрес сайта', text: 'Укажите полный URL сервиса, включая протокол (https://) — так же, как вводили бы его в адресной строке браузера.' },
  { n: '4', title: 'Задайте имя и иконку', text: 'Название и иконка вкладки настраиваются произвольно — удобно, если сайт сам по себе не имеет запоминающейся иконки в браузере.' },
  { n: '5', title: 'Сохраните — вкладка готова', text: 'Новый сервис появляется в боковой панели наравне с остальными, с полной изоляцией сессии и общим бейджем уведомлений, если сайт их поддерживает.' },
];

const USE_CASES = [
  { title: 'Корпоративные CRM и внутренние порталы', text: 'Системы, разработанные для конкретной компании и недоступные в публичном каталоге сервисов, добавляются точно так же, как обычный мессенджер.' },
  { title: 'Нишевые мессенджеры и чаты бирж', text: 'Встроенные чаты фриланс-площадок, узкоспециализированные мессенджеры для конкретной отрасли — всё, что работает через браузер, можно превратить в отдельную вкладку.' },
  { title: 'Личные и локальные веб-приложения', text: 'Сервисы, размещённые на собственном сервере или доступные только по IP-адресу в локальной сети, тоже открываются как обычный адрес.' },
];

const FAQ = [
  { q: 'Любой ли сайт можно добавить как вкладку?', a: 'Практически любой сайт, который открывается в обычном браузере, можно добавить вручную. Исключение — сервисы, которые технически блокируют встраивание в сторонние приложения на уровне заголовков безопасности.' },
  { q: 'Будут ли уведомления работать для произвольного сайта?', a: 'Если сайт использует стандартные веб-уведомления браузера или обновляет заголовок вкладки при новых сообщениях, Centrio, как правило, распознаёт это так же, как для сервисов из готового каталога.' },
  { q: 'Можно ли добавить один и тот же произвольный сайт несколько раз под разными аккаунтами?', a: 'Да, каждая добавленная вкладка получает собственную изолированную сессию независимо от того, выбран сервис из каталога или введён вручную.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Свой сервис в Centrio', item: 'https://centrio.me/blog/add-custom-service' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Свой сервис в Centrio: как добавить любой сайт как отдельную вкладку',
  description: 'Как добавить в Centrio любой сайт, которого нет в стандартном каталоге, как полноценную вкладку с уведомлениями.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/add-custom-service' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

const HOWTO_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Как добавить произвольный сайт в Centrio',
  step: STEPS.map((s) => ({ '@type': 'HowToStep', name: s.title, text: s.text })),
};

export default function AddCustomServicePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HOWTO_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(74,222,128,0.15)', color: '#4ade80', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Инструкция
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Свой сервис:{' '}
            <span style={{ background: 'linear-gradient(90deg,#4ade80,#7dd3fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>любой сайт как отдельная вкладка</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Каталог Centrio не ограничивает список сервисов — практически любой сайт можно добавить вручную как полноценную вкладку с изолированной сессией.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~4 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Как добавить за 5 шагов</> },
          { id: 'section-2', title: <>Где это пригождается</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Готовый каталог мессенджеров и сервисов покрывает самые популярные варианты, но реальные потребности пользователей этим не ограничиваются — корпоративные CRM, внутренние порталы, нишевые чаты бирж фриланса. Для всего этого в Centrio есть возможность добавить произвольный сайт вручную, с теми же преимуществами, что и у сервисов из каталога.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как добавить за 5 шагов</h2>
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

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Где это реально пригождается</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {USE_CASES.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Добавьте любой сервис прямо сейчас</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Функция доступна на бесплатном тарифе Centrio.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#4ade80,#22d3ee)', color: '#090d15', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(74,222,128,0.35)' }}>
              Скачать Centrio для Windows <ArrowDownToLine size={16} />
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link>
            </p>
          </section>
      </EditorialArticle>
      <SiteFooter />
    </>
  );
}
