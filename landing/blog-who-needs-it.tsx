import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Кому нужна программа для мессенджеров в одном окне: 7 сценариев',
  description: 'Разбираем, кому реально пригодится агрегатор мессенджеров вроде Centrio: фрилансерам, SMM-менеджерам, службе поддержки, предпринимателям и удалённым командам. 7 сценариев с примерами.',
  alternates: { canonical: 'https://centrio.me/blog/who-needs-it' },
  openGraph: {
    title: 'Кому нужна программа для мессенджеров в одном окне',
    description: '7 реальных сценариев, когда агрегатор мессенджеров экономит часы в неделю.',
    url: 'https://centrio.me/blog/who-needs-it',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const SCENARIOS = [
  { icon: '💼', title: 'Фрилансер на 3–5 площадках', text: 'Клиенты пишут в Telegram, WhatsApp и на почту, заказчики с бирж — в свои чаты. Без единого окна половина дня уходит на переключение между вкладками и приложениями, а не на работу.' },
  { icon: '📱', title: 'SMM-менеджер и таргетолог', text: 'Instagram, VK, Telegram-каналы клиентов, рабочий чат в Slack — обычно 5-8 сервисов одновременно, часто по несколько аккаунтов одного и того же мессенджера для разных проектов.' },
  { icon: '🎧', title: 'Служба поддержки и продажи', text: 'Клиенты пишут туда, где им удобно — WhatsApp, VK, Telegram, Viber. Оператору важно не потерять ни одного диалога и отвечать из одного места, а не из пяти открытых окон браузера.' },
  { icon: '🚀', title: 'ИП и малый бизнес', text: 'Один человек одновременно ведёт переписку с клиентами, поставщиками, бухгалтером и курьерами — часто в разных мессенджерах. Папки и быстрый поиск по всем чатам экономят реальное время каждый день.' },
  { icon: '🌍', title: 'Удалённая команда', text: 'Slack для команды, Telegram для клиентов, Notion для задач, Zoom для созвонов — рабочий день распределённой команды проходит в 5+ сервисах. Единое окно с папками по проектам снимает хаос вкладок.' },
  { icon: '🎓', title: 'Студент и учёба', text: 'Учебные чаты в Telegram, группа в VK, задания в Notion или Google Classroom, переписка с преподавателями в почте — всё это удобнее держать под рукой в одном приложении, а не в десятке вкладок браузера.' },
  { icon: '👨‍👩‍👧', title: 'Просто много переписок', text: 'Даже без работы: семья в WhatsApp, друзья в Telegram, интересы в Discord, соцсеть в VK. Если вы одновременно активны в 3+ мессенджерах — единое окно с уведомлениями избавляет от привычки открывать десяток вкладок каждый раз.' },
];

const FAQ = [
  { q: 'А если у меня всего 2 мессенджера — мне это нужно?', a: 'Если вы используете 1-2 сервиса и не испытываете неудобств — вероятно, не критично. Эффект от единого окна становится заметен начиная с 3+ активных мессенджеров или при необходимости держать несколько аккаунтов одного сервиса.' },
  { q: 'Чем это лучше, чем просто открытые вкладки браузера?', a: 'Нативные уведомления Windows/macOS/Linux, работа в фоне без перезагрузки вкладок, папки для группировки по проектам, горячие клавиши, постоянная авторизация в каждом сервисе и заметно меньше потребления ресурсов, чем десятки вкладок Chrome.' },
  { q: 'Подходит ли это для командной работы?', a: 'Да — папки можно организовать по клиентам или проектам, а Pro-подписка добавляет облачную синхронизацию настроек между устройствами, что удобно, если вы работаете с разных компьютеров.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Кому нужна программа для мессенджеров в одном окне: 7 сценариев', item: 'https://centrio.me/blog/who-needs-it' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Кому нужна программа для мессенджеров в одном окне: 7 сценариев',
  description: 'Разбираем, кому реально пригодится агрегатор мессенджеров вроде Centrio: фрилансерам, SMM-менеджерам, службе поддержки, предпринимателям и удалённым командам. 7 сценариев с примерами.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/who-needs-it' },
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

export default function WhoNeedsItPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(56,189,248,0.15)', color: '#7dd3fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Кому нужна программа{' '}
            <span style={{ background: 'linear-gradient(90deg,#38bdf8,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>для мессенджеров в одном окне?</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Агрегатор мессенджеров вроде Centrio нужен не всем — но для некоторых сценариев он экономит часы каждую неделю. Разбираем 7 реальных случаев.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~5 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Проблема, которую решает единое окно</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15.5, lineHeight: 1.8 }}>
              Средний пользователь мессенджеров сегодня держит открытыми Telegram, WhatsApp, VK, а часто ещё Discord, Slack или Notion — каждый в своей вкладке или отдельном окне. Переключение между ними, потерянные уведомления и десятки вкладок в браузере — источник постоянных мелких потерь внимания. По отдельности каждое переключение занимает секунды, но за день их набирается сотни.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>7 сценариев, где это критично</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SCENARIOS.map((s) => (
                <div key={s.title} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{s.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{s.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Что конкретно даёт Centrio в этих сценариях</h2>
            <div style={{ background: 'linear-gradient(135deg,rgba(56,189,248,0.08),rgba(129,140,248,0.08))', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 20, padding: '28px 32px' }}>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 2 }}>
                <li>Папки — группировка сервисов по клиентам, проектам или сферам жизни</li>
                <li>Несколько аккаунтов одного мессенджера (например, личный и рабочий Telegram)</li>
                <li>Поиск сразу по всем открытым вкладкам, а не по одной за раз</li>
                <li>Встроенный VPN, если сервис работает нестабильно из вашего региона</li>
                <li>Облачная синхронизация настроек между рабочим и домашним компьютером (Pro)</li>
                <li>Нативные уведомления и работа в фоне без открытого браузера</li>
              </ul>
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
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/stop-switching-tabs" style={{ color: '#7dd3fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(125,211,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как перестать переключаться между вкладками →</Link>
              <Link href="/blog/remote-team-messengers" style={{ color: '#7dd3fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(125,211,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Мессенджеры для удалённой команды →</Link>
              <Link href="/blog/how-to-combine-messengers" style={{ color: '#7dd3fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(125,211,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как объединить мессенджеры →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте Centrio бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>До 5 сервисов бесплатно навсегда — без ограничений по времени.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(14,165,233,0.4)' }}>
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
