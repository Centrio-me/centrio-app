import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Несколько аккаунтов WhatsApp и Telegram на одном компьютере',
  description: 'Как открыть 2, 3 и больше аккаунтов WhatsApp и Telegram одновременно на одном компьютере — без телефона-эмулятора и без потери уведомлений. Рабочий способ для Windows, macOS и Linux.',
  alternates: { canonical: 'https://centrio.me/blog/multiple-accounts' },
  openGraph: {
    title: 'Несколько аккаунтов WhatsApp и Telegram на одном ПК',
    description: 'Рабочий способ держать 2+ аккаунта WhatsApp и Telegram одновременно на компьютере.',
    url: 'https://centrio.me/blog/multiple-accounts',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const PROBLEMS = [
  { title: 'Telegram Desktop', text: 'Официальный клиент позволяет переключаться между аккаунтами, но ограничивает их число (до 3 на бесплатном тарифе) и не показывает уведомления сразу со всех аккаунтов — только с активного.' },
  { title: 'WhatsApp Desktop', text: 'У WhatsApp вообще нет встроенной поддержки нескольких аккаунтов в одном окне приложения. Один установленный клиент — один активный аккаунт. Второй обычно открывают через веб-версию в приватной вкладке браузера, что неудобно и сбрасывается при перезапуске.' },
  { title: 'Костыли, которыми пользуются сейчас', text: 'Второй браузерный профиль, режим инкогнито, второй Telegram из Microsoft Store параллельно с обычным — рабочие, но хрупкие способы: уведомления теряются, вкладки путаются, при перезагрузке компьютера сессии часто слетают.' },
];

const STEPS = [
  { n: 1, title: 'Установите Centrio', text: 'Скачайте и установите бесплатный установщик для вашей ОС — Windows, macOS или Linux.' },
  { n: 2, title: 'Добавьте первый мессенджер', text: 'Нажмите «+» и выберите Telegram или WhatsApp — откроется отдельная вкладка с чистой сессией входа.' },
  { n: 3, title: 'Добавьте тот же мессенджер ещё раз', text: 'Добавьте Telegram (или WhatsApp) второй раз через тот же «+» — Centrio создаст для новой вкладки полностью изолированную сессию, никак не связанную с первой. Войдите в неё под вторым аккаунтом.' },
  { n: 4, title: 'Повторите для третьего, четвёртого аккаунта', text: 'Ограничения на число вкладок нет — можно держать личный, рабочий и, например, аккаунт для канала одновременно.' },
  { n: 5, title: 'Настройте уведомления отдельно', text: 'Каждая вкладка получает собственные настройки уведомлений: звук, бейдж, режим «Не беспокоить» — можно приглушить рабочий аккаунт вечером, оставив личный активным.' },
];

const FAQ = [
  { q: 'Это официально разрешено правилами WhatsApp и Telegram?', a: 'Да — оба сервиса разрешают вход с нескольких устройств/сессий на разные номера. Centrio технически открывает веб-версию каждого сервиса в изолированной сессии, как отдельный профиль браузера — это тот же механизм, что использует официальная многосессионность.' },
  { q: 'Нужен ли отдельный номер телефона для каждого аккаунта?', a: 'Да, и WhatsApp, и Telegram привязывают аккаунт к номеру телефона — это требование самих сервисов, а не Centrio.' },
  { q: 'Слетят ли сессии при перезапуске компьютера?', a: 'Нет — в отличие от приватных вкладок браузера, сессии в Centrio сохраняются между перезапусками, пока вы явно не выйдете из аккаунта.' },
  { q: 'Можно ли так же держать несколько аккаунтов VK или Instagram?', a: 'Да, принцип одинаковый для любого сервиса — каждая добавленная вкладка получает собственную изолированную сессию, независимо от того, сколько раз вы добавили один и тот же сайт.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Несколько аккаунтов WhatsApp и Telegram на одном компьютере', item: 'https://centrio.me/blog/multiple-accounts' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Несколько аккаунтов WhatsApp и Telegram на одном компьютере',
  description: 'Как открыть 2, 3 и больше аккаунтов WhatsApp и Telegram одновременно на одном компьютере — без телефона-эмулятора и без потери уведомлений. Рабочий способ для Windows, macOS и Linux.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/multiple-accounts' },
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

export default function MultipleAccountsPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(74,222,128,0.15)', color: '#4ade80', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Инструкция · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Несколько аккаунтов WhatsApp и Telegram{' '}
            <span style={{ background: 'linear-gradient(90deg,#4ade80,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>на одном компьютере</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Личный, рабочий и ещё один аккаунт — одновременно, с уведомлениями от каждого, без телефона под рукой и без сброса сессий при перезагрузке.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Почему это сложнее, чем кажется</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {PROBLEMS.map((p) => (
                <div key={p.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{p.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{p.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как настроить в Centrio за 5 шагов</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'rgba(74,222,128,0.15)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
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
              <Link href="/blog/how-to-combine-messengers" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как объединить мессенджеры →</Link>
              <Link href="/blog/is-it-safe" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Безопасно ли это? →</Link>
              <Link href="/blog/remote-team-messengers" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Мессенджеры для команды →</Link>
              <Link href="/blog/max-transition" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>MAX и Telegram/WhatsApp вместе →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Несколько аккаунтов любого сервиса — без ограничения по времени на бесплатном тарифе.</p>
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
