import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Малый бизнес и мессенджеры: как не терять заявки от клиентов в WhatsApp и Telegram',
  description: 'Почему малый бизнес теряет заявки, разбросанные по WhatsApp, Telegram и Instagram, и как объединить все каналы продаж в одном окне, не покупая дорогую CRM.',
  alternates: { canonical: 'https://centrio.me/blog/small-business-messengers' },
  openGraph: {
    title: 'Малый бизнес и мессенджеры',
    description: 'Как объединить все каналы продаж — WhatsApp, Telegram, Instagram — в одном окне.',
    url: 'https://centrio.me/blog/small-business-messengers',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const PROBLEMS = [
  { title: 'Заявки приходят с разных площадок', text: 'Клиент может написать после рекламы в Instagram, найти номер на сайте и написать в WhatsApp, а постоянный покупатель — привычно в Telegram. Без единой точки контроля часть заявок неизбежно теряется между площадками.' },
  { title: 'За переписку отвечают разные сотрудники', text: 'В маленькой команде один и тот же человек часто ведёт сразу несколько каналов продаж — переключение между приложениями занимает время, которое можно было потратить на ответ клиенту.' },
  { title: 'Нет истории обращений в одном месте', text: 'Без CRM трудно быстро вспомнить, обращался ли этот клиент раньше и в каком канале — переписка разбросана по разным приложениям на разных устройствах.' },
];

const HOW_TO_ORGANIZE = [
  { title: 'Все каналы продаж в одном окне', text: 'WhatsApp Business, Telegram, Instagram Direct — все открываются как отдельные вкладки в одном приложении, с общим бейджем непрочитанных сообщений.' },
  { title: 'Отдельная вкладка для каждого сотрудника или направления', text: 'Если заявки распределены по менеджерам или направлениям бизнеса, для каждого можно завести собственный набор вкладок и папку с понятным названием.' },
  { title: 'Единый список уведомлений, чтобы не пропустить заявку', text: 'Общий счётчик непрочитанных на иконке в трее — сразу видно, есть ли новое обращение, не открывая по очереди каждый мессенджер.' },
  { title: '«Чат для сайта» как дополнительный канал', text: 'Если у бизнеса есть собственный сайт, встроенный виджет чата добавляет ещё один канал связи с посетителями — сообщения приходят в то же приложение, что и остальные мессенджеры.' },
];

const FAQ = [
  { q: 'Заменяет ли агрегатор мессенджеров полноценную CRM?', a: 'Нет, агрегатор не ведёт карточки клиентов и воронку продаж — он решает более узкую задачу: собрать переписку из разных мессенджеров в одном окне. Для полноценного учёта сделок отдельная CRM остаётся более подходящим инструментом.' },
  { q: 'Можно ли вести WhatsApp Business через Centrio?', a: 'Да, WhatsApp Business доступен через веб-версию так же, как обычный WhatsApp, и добавляется как отдельная вкладка с изолированной сессией.' },
  { q: 'Подходит ли это решение для одного человека, который сам ведёт весь бизнес?', a: 'Да, для одного человека, ведущего продажи сразу в нескольких каналах, агрегатор экономит именно то время, которое иначе уходит на переключение между приложениями и поиск, где именно писал конкретный клиент.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Малый бизнес и мессенджеры', item: 'https://centrio.me/blog/small-business-messengers' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Малый бизнес и мессенджеры: как не терять заявки от клиентов в WhatsApp и Telegram',
  description: 'Почему малый бизнес теряет заявки, разбросанные по разным мессенджерам, и как объединить каналы продаж в одном окне.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/small-business-messengers' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function SmallBusinessMessengersPage() {
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
            Малый бизнес:{' '}
            <span style={{ background: 'linear-gradient(90deg,#5eead4,#4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>не теряйте заявки клиентов</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            WhatsApp, Telegram, Instagram и сайт — как собрать все каналы продаж в одном окне без дорогой CRM.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Почему заявки теряются</> },
          { id: 'section-2', title: <>Как навести порядок</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              У малого бизнеса редко есть отдельный человек для каждого канала связи с клиентами — чаще один и тот же владелец или менеджер отвечает и в WhatsApp, и в Telegram, и в директе Instagram. Без единой точки контроля часть обращений неизбежно теряется, а клиент, не дождавшийся ответа, уходит к конкуренту.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Почему заявки теряются</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PROBLEMS.map((item) => (
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

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Читайте также</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/chat-widget-guide" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Чат для сайта →</Link>
              <Link href="/blog/remote-team-messengers" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Мессенджеры для удалённой команды →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Соберите все каналы продаж в одном окне</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Бесплатно для трёх мессенджеров, без ограничения по времени.</p>
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
