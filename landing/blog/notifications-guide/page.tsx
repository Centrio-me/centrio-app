import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Уведомления в Centrio: как настроить звук, бейджи и не пропустить важное',
  description: 'Гид по системе уведомлений Centrio: индивидуальные звуки для каждого мессенджера, отключение звука без отключения самих уведомлений, бейджи непрочитанных и общий центр уведомлений.',
  alternates: { canonical: 'https://centrio.me/blog/notifications-guide' },
  openGraph: {
    title: 'Уведомления в Centrio',
    description: 'Как настроить звук, бейджи непрочитанных и центр уведомлений, чтобы не пропустить важное сообщение.',
    url: 'https://centrio.me/blog/notifications-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const LEVELS = [
  { title: 'Полное отключение уведомлений для мессенджера', text: 'Правый клик по вкладке в боковой панели → «Отключить уведомления». Сообщения продолжают приходить и накапливаться, но не отвлекают ни звуком, ни бейджем — подходит для сервисов, которые нужны, но не требуют мгновенной реакции.' },
  { title: 'Отключение звука без отключения уведомлений', text: 'В панели уведомлений (иконка колокольчика) рядом с общим переключателем «Отключить уведомления» есть отдельная кнопка звука — сообщения продолжают приходить и показываться как обычно, просто без звукового сигнала.' },
  { title: 'Индивидуальный звук на каждый мессенджер', text: 'В настройках конкретного мессенджера можно назначить свой звук уведомления — удобно на слух отличать срочный рабочий чат от менее важного личного, не глядя на экран.' },
  { title: 'Общая тишина одной кнопкой', text: '«Отключить все уведомления» в панели уведомлений мгновенно глушит звук и бейджи для всех подключённых мессенджеров разом — быстрый способ не отвлекаться во время встречи или созвона.' },
];

const BADGE_INFO = [
  { title: 'Бейдж на иконке в трее', text: 'Общее число непрочитанных сообщений по всем мессенджерам сразу — видно даже когда окно Centrio свёрнуто.' },
  { title: 'Бейдж на каждой вкладке', text: 'Индивидуальный счётчик рядом с иконкой каждого мессенджера в боковой панели — сразу понятно, где именно копятся новые сообщения.' },
  { title: 'Бейдж на папке', text: 'Свёрнутая папка показывает суммарное число непрочитанных по всем мессенджерам внутри — не нужно разворачивать папку, чтобы понять, есть ли там что-то новое.' },
];

const FAQ = [
  { q: 'Можно ли получать уведомления без звука только для одного мессенджера?', a: 'Прямого переключателя «без звука для конкретного мессенджера» нет — но можно назначить ему пустой или тихий пользовательский звук в настройках, либо использовать общий переключатель звука, если тишина нужна для всех сразу.' },
  { q: 'Что происходит с непрочитанными, если отключить уведомления для мессенджера?', a: 'Счётчик непрочитанных для этого мессенджера просто не учитывается в общем бейдже — сами сообщения никуда не пропадают и остаются доступны при открытии вкладки.' },
  { q: 'Работают ли уведомления, если Centrio свёрнут в трей?', a: 'Да, приложение продолжает получать сообщения и показывать системные уведомления Windows, пока работает в фоне — закрывать окно необязательно.' },
  { q: 'Есть ли центр, где видно историю всех уведомлений сразу?', a: 'Да, отдельная панель уведомлений (иконка колокольчика в правой панели) хранит историю, позволяет искать по содержимому и отмечать всё как прочитанное одним кликом.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Уведомления в Centrio', item: 'https://centrio.me/blog/notifications-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Уведомления в Centrio: как настроить звук, бейджи и не пропустить важное',
  description: 'Гид по системе уведомлений Centrio: индивидуальные звуки, отключение звука без отключения уведомлений, бейджи непрочитанных.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/notifications-guide' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function NotificationsGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(250,204,21,0.15)', color: '#facc15', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Настройка
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Уведомления:{' '}
            <span style={{ background: 'linear-gradient(90deg,#facc15,#fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>звук, бейджи и тишина по требованию</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Четыре уровня контроля над уведомлениями — от полной тишины для одного мессенджера до звука без потери самих сообщений.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Четыре уровня контроля</> },
          { id: 'section-2', title: <>Где смотреть непрочитанные</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Чем больше мессенджеров подключено, тем важнее гибкая настройка уведомлений — не каждый чат одинаково срочный, и не в каждой ситуации нужен звук. В Centrio уведомления настраиваются на нескольких уровнях одновременно: от полного отключения для конкретного сервиса до общей тишины одной кнопкой во время созвона.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Четыре уровня контроля</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {LEVELS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Где смотреть непрочитанные</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {BADGE_INFO.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Настройте уведомления под себя</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Полный контроль над звуком и бейджами доступен в бесплатной версии Centrio.</p>
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
