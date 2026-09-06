import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Мессенджеры для удалённой команды: как свести всё в одно окно',
  description: 'Slack, Telegram, Notion, Zoom и почта — типичный набор инструментов удалённой команды. Разбираем, как организовать их в одном приложении по папкам и не терять сообщения между проектами.',
  alternates: { canonical: 'https://centrio.me/blog/remote-team-messengers' },
  openGraph: {
    title: 'Мессенджеры для удалённой команды в одном окне',
    description: 'Как организовать Slack, Telegram, Notion и Zoom в одном приложении по проектам.',
    url: 'https://centrio.me/blog/remote-team-messengers',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const CHALLENGES = [
  { title: 'Разные инструменты для разных задач', text: 'Команда общается в Slack, клиенты пишут в Telegram, задачи живут в Notion, созвоны идут в Zoom — переключение между всем этим за день накапливает десятки мелких пауз.' },
  { title: 'Несколько проектов одновременно', text: 'Фрилансеры и агентства часто ведут 3-5 проектов параллельно, у каждого свой рабочий чат и свои клиентские каналы — без структуры легко перепутать, где какое сообщение.' },
  { title: 'Асинхронная работа в разных часовых поясах', text: 'Уведомления приходят в течение всего дня из разных источников — важно не пропустить сообщение по проекту, даже если оно пришло не в Slack, а в почте или Telegram.' },
];

const SETUP = [
  { n: 1, title: 'Создайте папку под каждый проект или клиента', text: 'В Centrio можно сгруппировать сервисы по папкам — например, отдельная папка на каждого клиента с его Slack-каналом, Telegram-чатом и Notion-базой.' },
  { n: 2, title: 'Добавьте несколько аккаунтов одного сервиса', text: 'Если для разных проектов используются разные рабочие пространства Slack или разные Telegram-аккаунты, добавьте их как отдельные вкладки — каждая работает независимо.' },
  { n: 3, title: 'Настройте уведомления по важности', text: 'Оставьте звук и всплывающие оповещения только для действительно срочных каналов, остальное проверяйте по расписанию — так меньше отвлечений в течение дня.' },
  { n: 4, title: 'Используйте единый поиск', text: 'Поиск сразу по всем открытым сервисам экономит время, когда нужно найти сообщение, но вы не помните, в каком именно чате оно было.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Мессенджеры для удалённой команды: как свести всё в одно окно', item: 'https://centrio.me/blog/remote-team-messengers' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Мессенджеры для удалённой команды: как свести всё в одно окно',
  description: 'Slack, Telegram, Notion, Zoom и почта — типичный набор инструментов удалённой команды. Разбираем, как организовать их в одном приложении по папкам и не терять сообщения между проектами.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/remote-team-messengers' },
};

export default function RemoteTeamMessengersPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(52,211,153,0.15)', color: '#6ee7b7', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Удалённая работа · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Мессенджеры для удалённой команды:{' '}
            <span style={{ background: 'linear-gradient(90deg,#34d399,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>как свести всё в одно окно</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Slack для команды, Telegram для клиентов, Notion для задач, Zoom для созвонов — у распределённой команды легко набирается 5+ инструментов. Разбираем, как навести в этом порядок.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Проблемы удалённой команды</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {CHALLENGES.map((c) => (
                <div key={c.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{c.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{c.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как настроить рабочее пространство</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SETUP.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#6ee7b7', flexShrink: 0 }}>{s.n}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{s.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Для команд с несколькими устройствами</h2>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '24px' }}>
              <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15, lineHeight: 1.8, margin: 0 }}>
                Если вы работаете с разных компьютеров — например, ноутбук в дороге и рабочая станция в офисе — Pro-подписка Centrio добавляет облачную синхронизацию настроек: папки, добавленные сервисы и параметры переносятся между устройствами автоматически, без ручной перенастройки каждый раз.
              </p>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/who-needs-it" style={{ color: '#6ee7b7', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(110,231,183,0.25)', borderRadius: 10, padding: '8px 16px' }}>Кому нужна такая программа →</Link>
              <Link href="/blog/stop-switching-tabs" style={{ color: '#6ee7b7', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(110,231,183,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как перестать переключаться между вкладками →</Link>
              <Link href="/blog/how-to-combine-messengers" style={{ color: '#6ee7b7', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(110,231,183,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как объединить мессенджеры →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Организуйте команду в Centrio</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Бесплатно для старта, с Pro-синхронизацией между устройствами при необходимости.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#34d399,#3b82f6)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(52,211,153,0.4)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Версия 2.5.2 · Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link> · <Link href="/pricing" style={{ color: 'inherit' }}>Тарифы Pro</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
