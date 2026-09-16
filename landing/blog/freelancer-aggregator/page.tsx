import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Агрегатор мессенджеров для фрилансера: как не терять заказчиков между вкладками',
  description: 'Почему фрилансеру с несколькими заказчиками стоит завести агрегатор мессенджеров: изоляция переписки по клиентам, папки под проекты и единый список уведомлений.',
  alternates: { canonical: 'https://centrio.me/blog/freelancer-aggregator' },
  openGraph: {
    title: 'Агрегатор мессенджеров для фрилансера',
    description: 'Как организовать переписку с несколькими заказчиками в одном окне, не путая клиентов.',
    url: 'https://centrio.me/blog/freelancer-aggregator',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const PROBLEMS = [
  { title: 'Заказчики пишут в разных мессенджерах', text: 'Один клиент удобен в Telegram, другой принципиально пользуется только WhatsApp, третий — заказчик с биржи и пишет через встроенный чат площадки. Держать всё это открытым по отдельности — постоянные переключения между окнами.' },
  { title: 'Риск ответить не в тот чат', text: 'Когда переписка с пятью заказчиками идёт параллельно в одном мессенджере, легко перепутать окна и отправить деталь одного проекта другому клиенту.' },
  { title: 'Пропущенное сообщение = потерянный заказ', text: 'На фрилансе скорость ответа часто напрямую влияет на то, достанется ли заказ вам или конкуренту, который ответил на пять минут раньше.' },
];

const HOW_CENTRIO_HELPS = [
  { title: 'Папка на каждого крупного клиента', text: 'Если с заказчиком общение идёт сразу в нескольких мессенджерах — например, основной чат в Telegram и файлы на почте, — можно сгруппировать оба в одну папку с именем клиента.' },
  { title: 'Изолированные сессии для рабочих и личных аккаунтов', text: 'Рабочий WhatsApp и личный WhatsApp — два разных аккаунта в двух вкладках, без переключения между телефоном и компьютером и без риска перепутать переписку.' },
  { title: 'Общий бейдж непрочитанных на все проекты сразу', text: 'Одна иконка в трее показывает, есть ли вообще что-то новое — не нужно поочерёдно открывать каждый мессенджер, чтобы проверить.' },
  { title: 'AI-ассистент для быстрых типовых ответов', text: 'Встроенный ИИ-ассистент помогает быстро сформулировать ответ на типовой вопрос заказчика — сроки, стоимость, статус — не выходя из окна мессенджера.' },
];

const FAQ = [
  { q: 'Можно ли открыть два аккаунта Telegram или WhatsApp для рабочего и личного общения?', a: 'Да, каждая вкладка в Centrio — изолированная сессия, поэтому рабочий и личный аккаунт одного сервиса можно держать открытыми одновременно, не выходя из одного и не заходя в другой.' },
  { q: 'Стоит ли агрегатор денег для фрилансера с небольшим числом клиентов?', a: 'Базовые функции — до трёх мессенджеров, папки для группировки, единые уведомления — доступны бесплатно без ограничения по времени. Платный тариф нужен, если клиентов и сервисов становится больше или требуются папки и рабочие пространства.' },
  { q: 'Что делать, если заказчик пишет через чат биржи фриланса, а не в мессенджере?', a: 'Большинство агрегаторов, включая Centrio, позволяют добавить произвольный сайт как отдельную вкладку — в том числе внутренний чат биржи, если он доступен через браузер.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Агрегатор мессенджеров для фрилансера', item: 'https://centrio.me/blog/freelancer-aggregator' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Агрегатор мессенджеров для фрилансера: как не терять заказчиков между вкладками',
  description: 'Почему фрилансеру с несколькими заказчиками стоит завести агрегатор мессенджеров — изоляция переписки по клиентам, папки под проекты.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/freelancer-aggregator' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function FreelancerAggregatorPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(125,211,252,0.15)', color: '#7dd3fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Фриланс
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Агрегатор мессенджеров{' '}
            <span style={{ background: 'linear-gradient(90deg,#7dd3fc,#4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>для фрилансера</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Пять заказчиков, пять мессенджеров, один рабочий день. Разбираем, как навести порядок в переписке с клиентами и не потерять ни одного сообщения.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Типичные проблемы фрилансера с несколькими клиентами</> },
          { id: 'section-2', title: <>Как это решает Centrio</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              У фрилансера редко бывает один канал связи с заказчиками. Кто-то предпочитает Telegram, кто-то — WhatsApp, кто-то пишет прямо через чат биржи. К этому добавляется личная переписка, которая тоже требует внимания в течение дня. Держать всё это в отдельных окнах браузера — верный способ упустить важное сообщение или перепутать, кому из клиентов что отвечено.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Типичные проблемы фрилансера с несколькими клиентами</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PROBLEMS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как это решает Centrio</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HOW_CENTRIO_HELPS.map((item) => (
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

          <section style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Читайте также</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/who-needs-it" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Кому это нужно: 7 сценариев →</Link>
              <Link href="/blog/multiple-accounts" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Несколько аккаунтов на одном компьютере →</Link>
              <Link href="/blog/workspaces-folders-guide" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Папки и рабочие пространства →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Наведите порядок в переписке с заказчиками</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Бесплатно для трёх мессенджеров, без ограничения по времени.</p>
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
