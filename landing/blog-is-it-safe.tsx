import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Безопасно ли использовать агрегаторы мессенджеров вроде Centrio?',
  description: 'Разбираем, как устроена безопасность приложений-агрегаторов мессенджеров: где хранятся сессии, что видит и не видит разработчик, подписанные установщики и на что обращать внимание при выборе.',
  alternates: { canonical: 'https://centrio.me/blog/is-it-safe' },
  openGraph: {
    title: 'Безопасно ли использовать агрегаторы мессенджеров?',
    description: 'Как устроена безопасность Centrio и на что обращать внимание при выборе агрегатора мессенджеров.',
    url: 'https://centrio.me/blog/is-it-safe',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const POINTS = [
  { title: 'Где хранятся сессии входа', text: 'Каждый мессенджер в Centrio работает в отдельной изолированной сессии на вашем устройстве — так же, как если бы вы открыли его в отдельном профиле браузера. Данные для входа хранятся локально, а не на серверах разработчика приложения.' },
  { title: 'Что видит разработчик агрегатора', text: 'Агрегатор технически отображает веб-версии сервисов внутри приложения — переписка идёт напрямую между вами и серверами Telegram, WhatsApp или VK, так же как при использовании официального сайта или приложения.' },
  { title: 'Подписанный установщик', text: 'Официальный установщик Centrio подписан цифровой подписью, что подтверждает подлинность файла и защищает от подмены при скачивании с официального сайта.' },
  { title: 'Разделение аккаунтов', text: 'Изоляция сессий между сервисами и между несколькими аккаунтами одного мессенджера построена так, чтобы один сервис не мог получить доступ к данным другого.' },
];

const CHECKLIST = [
  'Скачивайте установщик только с официального сайта разработчика, а не со сторонних площадок',
  'Проверяйте, что установщик подписан и не запрашивает лишних системных разрешений',
  'Убедитесь, что у приложения есть открытая политика конфиденциальности',
  'Отдавайте предпочтение приложениям с активной поддержкой и регулярными обновлениями',
  'Для чувствительных аккаунтов используйте двухфакторную аутентификацию — она работает и внутри агрегатора так же, как в браузере',
];

const FAQ = [
  { q: 'Может ли Centrio читать мою переписку?', a: 'Приложение отображает веб-интерфейс сервиса внутри изолированной сессии — переписка идёт напрямую между вами и сервером мессенджера, как при использовании обычного браузера.' },
  { q: 'Что если я использую несколько мессенджеров с разными паролями?', a: 'Каждая сессия изолирована по своему сервису — данные одного мессенджера недоступны другому в рамках приложения.' },
  { q: 'Безопасно ли скачивать установщик не из официального магазина приложений?', a: 'Скачивайте установщик исключительно с официального сайта разработчика (для Centrio — centrio.me) и проверяйте цифровую подпись файла перед запуском.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Безопасно ли использовать агрегаторы мессенджеров вроде Centrio?', item: 'https://centrio.me/blog/is-it-safe' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Безопасно ли использовать агрегаторы мессенджеров вроде Centrio?',
  description: 'Разбираем, как устроена безопасность приложений-агрегаторов мессенджеров: где хранятся сессии, что видит и не видит разработчик, подписанные установщики и на что обращать внимание при выборе.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/is-it-safe' },
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

export default function IsItSafePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(34,211,238,0.15)', color: '#67e8f9', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Безопасность · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Безопасно ли использовать{' '}
            <span style={{ background: 'linear-gradient(90deg,#22d3ee,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>агрегаторы мессенджеров?</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Логичный вопрос, если вы собираетесь держать Telegram, WhatsApp и VK в одном приложении. Разбираем, как устроена безопасность и на что обращать внимание при выборе.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как устроена безопасность</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {POINTS.map((p) => (
                <div key={p.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{p.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{p.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Чек-лист при выборе агрегатора</h2>
            <div style={{ background: 'linear-gradient(135deg,rgba(34,211,238,0.08),rgba(129,140,248,0.08))', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 20, padding: '28px 32px' }}>
              <ul style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 2 }}>
                {CHECKLIST.map((item) => (
                  <li key={item}>{item}</li>
                ))}
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
              <Link href="/blog/messenger-vpn-guide" style={{ color: '#67e8f9', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(103,232,249,0.25)', borderRadius: 10, padding: '8px 16px' }}>VPN для мессенджеров →</Link>
              <Link href="/blog/vs-ferdium" style={{ color: '#67e8f9', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(103,232,249,0.25)', borderRadius: 10, padding: '8px 16px' }}>Centrio vs Ferdium →</Link>
              <Link href="/faq" style={{ color: '#67e8f9', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(103,232,249,0.25)', borderRadius: 10, padding: '8px 16px' }}>Все вопросы и ответы →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Скачайте Centrio с официального сайта</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Подписанный установщик, бесплатный тариф без ограничений по времени.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#22d3ee,#818cf8)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(34,211,238,0.4)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Версия 2.5.2 · Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link> · <Link href="/privacy" style={{ color: 'inherit' }}>Политика конфиденциальности</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
