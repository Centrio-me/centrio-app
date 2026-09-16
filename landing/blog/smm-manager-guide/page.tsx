import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'SMM-менеджер и десяток соцсетей: как организовать рабочий день в одном окне',
  description: 'Как SMM-менеджеру, ведущему несколько групп в разных соцсетях, организовать переписку с подписчиками и клиентами в одном приложении вместо десятка открытых вкладок.',
  alternates: { canonical: 'https://centrio.me/blog/smm-manager-guide' },
  openGraph: {
    title: 'Агрегатор мессенджеров для SMM-менеджера',
    description: 'Как организовать рабочий день с несколькими соцсетями и группами клиентов в одном окне.',
    url: 'https://centrio.me/blog/smm-manager-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const PAIN_POINTS = [
  { title: 'Несколько групп ВКонтакте под разными клиентами', text: 'Каждая требует отдельного входа под администраторским аккаунтом сообщества — держать пять вкладок браузера с разными группами одновременно неудобно и легко перепутать, из какого аккаунта отвечаешь.' },
  { title: 'Комментарии и личные сообщения приходят одновременно из разных мест', text: 'Instagram Direct, комментарии в Telegram-канале, вопросы во ВКонтакте — всё это требует быстрой реакции, а переключение между вкладками браузера съедает время между ответами.' },
  { title: 'Личный и рабочий аккаунт одной и той же соцсети', text: 'SMM-менеджер часто ведёт рабочие страницы под отдельным логином, но при этом продолжает пользоваться личным аккаунтом — держать оба открытыми одновременно в одном браузере без путаницы сессий не всегда получается.' },
];

const HOW_TO_ORGANIZE = [
  { title: 'Папка на каждого клиента или бренд', text: 'Все соцсети одного клиента — ВКонтакте, Telegram-канал, Instagram — группируются в одну папку с названием клиента, а не разбросаны по общему списку вкладок.' },
  { title: 'Изолированные сессии для рабочих и личных аккаунтов', text: 'Рабочий и личный ВКонтакте — два разных аккаунта в двух вкладках одновременно, без выхода из одного при входе в другой.' },
  { title: 'Общий бейдж непрочитанных на все площадки сразу', text: 'Не нужно поочерёдно открывать каждую соцсеть, чтобы проверить, есть ли новые сообщения или комментарии — общий счётчик в трее показывает это сразу.' },
  { title: 'Отключение рекламы на самих площадках', text: 'Встроенный блокировщик рекламы избавляет рабочий интерфейс ВКонтакте и Одноклассников от посторонних баннеров, которые отвлекают при работе с лентой сообщества.' },
];

const FAQ = [
  { q: 'Можно ли вести несколько сообществ ВКонтакте одновременно в одном окне?', a: 'Да, каждая вкладка в Centrio — изолированная сессия, поэтому можно держать открытыми несколько аккаунтов ВКонтакте, назначенных на разные сообщества, без выхода из одного при работе с другим.' },
  { q: 'Подходит ли агрегатор для мониторинга комментариев в реальном времени?', a: 'Агрегатор показывает то же самое, что и обычный браузер — обновление ленты и комментариев зависит от самой соцсети. Преимущество в том, что не нужно постоянно переключаться между вкладками, чтобы отслеживать несколько площадок одновременно.' },
  { q: 'Стоит ли использовать агрегатор, если веду только одну группу?', a: 'Для одной площадки выгода минимальна. Агрегатор оправдывает себя начиная с двух-трёх параллельных проектов или соцсетей, когда переключение между вкладками само по себе становится заметной тратой времени.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'SMM-менеджер и соцсети в одном окне', item: 'https://centrio.me/blog/smm-manager-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'SMM-менеджер и десяток соцсетей: как организовать рабочий день в одном окне',
  description: 'Как SMM-менеджеру, ведущему несколько групп в разных соцсетях, организовать переписку в одном приложении.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/smm-manager-guide' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function SmmManagerGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(94,234,212,0.15)', color: '#5eead4', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Для бизнеса
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            SMM-менеджер:{' '}
            <span style={{ background: 'linear-gradient(90deg,#5eead4,#7dd3fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>все соцсети в одном окне</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Несколько клиентов, несколько площадок, постоянные переключения между вкладками. Разбираем, как навести порядок в рабочем дне SMM-специалиста.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Типичные проблемы SMM-менеджера</> },
          { id: 'section-2', title: <>Как навести порядок</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Работа SMM-менеджера редко ограничивается одной соцсетью и одним клиентом. Обычный рабочий день — это несколько сообществ ВКонтакте, аккаунты в Telegram, комментарии в Instagram и постоянный поток личных сообщений от подписчиков и клиентов, которые нужно обработать быстро. Все эти каналы легко потерять между открытыми вкладками браузера.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Типичные проблемы SMM-менеджера</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PAIN_POINTS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как навести порядок с помощью Centrio</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HOW_TO_ORGANIZE.map((item) => (
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
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Соберите все соцсети в одном окне</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Бесплатно для трёх соцсетей, без ограничения по времени.</p>
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
