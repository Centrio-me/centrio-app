import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.6.0.exe';

export const metadata: Metadata = {
  title: 'Как поставить PIN-код на мессенджеры в Centrio и защитить переписку',
  description: 'Пошаговый гид по PIN-коду в Centrio: блокировка при сворачивании окна, автоблокировка при бездействии и защита всей переписки одним кодом на весь агрегатор мессенджеров.',
  alternates: { canonical: 'https://centrio.me/blog/pin-lock-guide' },
  openGraph: {
    title: 'PIN-код на мессенджеры в Centrio',
    description: 'Защитите всю переписку одним кодом — блокировка при сворачивании и автоблокировка при бездействии.',
    url: 'https://centrio.me/blog/pin-lock-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const REASONS = [
  { icon: '👀', title: 'Общий компьютер', text: 'Рабочий ноутбук, семейный ПК или компьютер, к которому иногда подходят коллеги — PIN не даёт открыть переписку, просто взглянув на экран, пока вы отошли.' },
  { icon: '📴', title: 'Свернули — заблокировалось', text: 'Не нужно вручную нажимать «заблокировать» каждый раз — включите блокировку при сворачивании окна, и Centrio сам запросит код при следующем открытии.' },
  { icon: '⏱️', title: 'Отошли — заблокировалось само', text: 'Автоблокировка по таймеру бездействия страхует ситуацию, когда забыли свернуть или закрыть окно вручную — например, если внезапно отвлеклись и ушли из-за стола.' },
];

const FAQ = [
  { q: 'PIN закрывает каждый мессенджер отдельно или всё сразу?', a: 'Один PIN-код блокирует всё окно Centrio целиком — все открытые вкладки мессенджеров одновременно, а не каждую по отдельности.' },
  { q: 'Что если я забуду PIN?', a: 'Сброс PIN-кода выполняется через ваш аккаунт Centrio (email, к которому привязан вход) — сама переписка при этом никуда не пропадает, доступ восстанавливается после подтверждения владения аккаунтом.' },
  { q: 'PIN — это то же самое, что пароль от аккаунта Centrio?', a: 'Нет, это два разных уровня защиты. Пароль аккаунта нужен для входа в сам Centrio на новом устройстве, а PIN — короткий код для быстрой блокировки/разблокировки уже открытого приложения на этом устройстве.' },
  { q: 'Можно ли включить и блокировку при сворачивании, и автоблокировку по таймеру одновременно?', a: 'Да, обе настройки независимые и работают одновременно — «Блокировать при сворачивании» реагирует на конкретное действие, а «Автоблокировка при бездействии» — на время без активности, сколько бы окно ни было открыто.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'PIN-код на мессенджеры в Centrio', item: 'https://centrio.me/blog/pin-lock-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Как поставить PIN-код на мессенджеры в Centrio и защитить переписку',
  description: 'Пошаговый гид по PIN-коду в Centrio: блокировка при сворачивании окна, автоблокировка при бездействии и защита всей переписки одним кодом.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-08',
  dateModified: '2026-09-08',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/pin-lock-guide' },
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

export default function PinLockGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(103,232,249,0.15)', color: '#67e8f9', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Безопасность · Сентябрь 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            PIN-код на мессенджеры:{' '}
            <span style={{ background: 'linear-gradient(90deg,#67e8f9,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>вся переписка под одним замком</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Один короткий код закрывает доступ ко всем открытым мессенджерам в Centrio сразу — вручную или автоматически.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Опубликовано: сентябрь 2026 · Время чтения: ~3 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Зачем это нужно</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {REASONS.map((r) => (
                <div key={r.title} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{r.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{r.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{r.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Как настроить</h2>
            <div style={{ background: 'linear-gradient(135deg,rgba(103,232,249,0.08),rgba(129,140,248,0.08))', border: '1px solid rgba(103,232,249,0.2)', borderRadius: 20, padding: '28px 32px' }}>
              <ol style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 2 }}>
                <li>Настройки → раздел «Безопасность»</li>
                <li>Введите новый PIN дважды и нажмите «Установить PIN»</li>
                <li>При желании включите «Блокировать при сворачивании»</li>
                <li>Выберите интервал в «Автоблокировка при бездействии» — или оставьте «Выключено»</li>
              </ol>
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
              <Link href="/blog/is-it-safe" style={{ color: '#67e8f9', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(103,232,249,0.25)', borderRadius: 10, padding: '8px 16px' }}>Безопасно ли использовать Centrio? →</Link>
              <Link href="/blog/notes-plugin-guide" style={{ color: '#67e8f9', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(103,232,249,0.25)', borderRadius: 10, padding: '8px 16px' }}>Заметки и списки покупок в Centrio →</Link>
              <Link href="/blog/whatsapp-telegram-ban-risk" style={{ color: '#67e8f9', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(103,232,249,0.25)', borderRadius: 10, padding: '8px 16px' }}>Забанят ли WhatsApp за использование в Centrio? →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Защитите переписку в Centrio</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>PIN-код доступен на бесплатном плане — без ограничений по времени.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(14,165,233,0.4)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Версия 2.6.0 · Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link> · <Link href="/pricing" style={{ color: 'inherit' }}>Тарифы Pro</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
