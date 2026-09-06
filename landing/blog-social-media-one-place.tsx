import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Как собрать ВКонтакте, Telegram, Instagram и другие соцсети в одном месте',
  description: 'Рабочий способ держать все соцсети и мессенджеры — ВКонтакте, Telegram, Instagram, WhatsApp — в одном приложении с общими уведомлениями. Актуально для SMM-менеджеров и владельцев нескольких аккаунтов.',
  alternates: { canonical: 'https://centrio.me/blog/all-social-media-one-place' },
  openGraph: {
    title: 'Все соцсети в одном месте: рабочий способ',
    description: 'ВКонтакте, Telegram, Instagram, WhatsApp — в одном окне с общими уведомлениями.',
    url: 'https://centrio.me/blog/all-social-media-one-place',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const AUDIENCE = [
  { title: 'SMM-менеджер', text: 'Ведёт группы ВКонтакте, каналы Telegram и аккаунты Instagram нескольких клиентов одновременно — каждый требует отдельного логина и постоянного переключения между вкладками браузера.' },
  { title: 'Владелец бизнес-страниц', text: 'Личный аккаунт и рабочая страница бренда в одной и той же соцсети — вход под двумя разными профилями одновременно штатными средствами сайта обычно не предусмотрен.' },
  { title: 'Контент-мейкер', text: 'Публикует в ВКонтакте, Telegram-канал и Instagram параллельно, а отвечает подписчикам сразу во всех — важно не пропустить сообщение просто потому, что вкладка была свёрнута.' },
];

const STEPS = [
  { n: 1, title: 'Установите Centrio', text: 'Бесплатный установщик для Windows, macOS или Linux — без ограничения по времени использования.' },
  { n: 2, title: 'Добавьте нужные соцсети', text: 'ВКонтакте, Telegram, Instagram, WhatsApp, X (Twitter) — через «+» добавляется любой сайт по ссылке, не только мессенджеры из готового каталога.' },
  { n: 3, title: 'Добавьте второй аккаунт той же сети при необходимости', text: 'Личный ВКонтакте и страницу бренда, два разных Telegram-канала — каждая добавленная вкладка получает свою изолированную сессию входа.' },
  { n: 4, title: 'Организуйте вкладки по папкам', text: 'Сгруппируйте личное и рабочее в отдельные папки — переключение между контекстами занимает один клик, а не поиск нужной вкладки браузера.' },
  { n: 5, title: 'Настройте уведомления', text: 'Общий бейдж непрочитанных на иконке в трее по всем соцсетям сразу, плюс отдельные настройки звука для каждой вкладки.' },
];

const FAQ = [
  { q: 'Можно ли вести несколько аккаунтов ВКонтакте одновременно?', a: 'Да — если добавить ВКонтакте в Centrio дважды (или больше), каждая вкладка получит собственную изолированную сессию, независимую от остальных, и можно войти в каждую под своим аккаунтом.' },
  { q: 'Это замена официальным приложениям соцсетей?', a: 'Centrio открывает веб-версию каждой соцсети в изолированной вкладке — по функциональности это тот же сайт, что вы открываете в браузере, просто с общими уведомлениями и без необходимости держать открытым сам браузер.' },
  { q: 'Слетают ли пароли и сессии при перезапуске компьютера?', a: 'Нет, сессии сохраняются между перезапусками — в отличие от приватных вкладок браузера, где вход приходится повторять каждый раз заново.' },
  { q: 'Подходит ли это для мессенджеров и соцсетей вместе, в одном приложении?', a: 'Да, разделения на «отдельно для мессенджеров, отдельно для соцсетей» нет — все добавленные вкладки живут в одном окне независимо от типа сервиса.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Как собрать ВКонтакте, Telegram, Instagram и другие соцсети в одном месте', item: 'https://centrio.me/blog/all-social-media-one-place' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Как собрать ВКонтакте, Telegram, Instagram и другие соцсети в одном месте',
  description: 'Рабочий способ держать все соцсети и мессенджеры — ВКонтакте, Telegram, Instagram, WhatsApp — в одном приложении с общими уведомлениями. Актуально для SMM-менеджеров и владельцев нескольких аккаунтов.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/all-social-media-one-place' },
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

export default function SocialMediaOnePlacePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(125,211,252,0.15)', color: '#7dd3fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Как собрать ВКонтакте, Telegram и Instagram{' '}
            <span style={{ background: 'linear-gradient(90deg,#7dd3fc,#4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>в одном месте</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Рабочий способ держать все соцсети и мессенджеры в одном окне с общими уведомлениями — без десятка открытых вкладок браузера.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Кому это особенно нужно</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {AUDIENCE.map((a) => (
                <div key={a.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{a.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{a.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как настроить за 5 шагов</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'rgba(125,211,252,0.15)', color: '#7dd3fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                    {s.n}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>{s.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{s.text}</p>
                  </div>
                </div>
              ))}
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
              <Link href="/blog/multiple-accounts" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Несколько аккаунтов на одном ПК →</Link>
              <Link href="/blog/who-needs-it" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Кому нужен агрегатор →</Link>
              <Link href="/blog/how-to-combine-messengers" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как объединить мессенджеры →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Все соцсети и мессенджеры в одном окне — без ограничения по времени на бесплатном тарифе.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#4ade80,#22d3ee)', color: '#06060f', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(74,222,128,0.35)' }}>
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
