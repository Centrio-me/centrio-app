import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'Как объединить Telegram, WhatsApp и VK в одном приложении',
  description: 'Пошаговая инструкция: как собрать Telegram, WhatsApp, VK и другие мессенджеры в одном окне на Windows, macOS или Linux с помощью Centrio. Установка за 5 минут.',
  alternates: { canonical: 'https://centrio.me/blog/how-to-combine-messengers' },
  openGraph: {
    title: 'Как объединить все мессенджеры в одном окне',
    description: 'Пошаговая инструкция для Windows, macOS и Linux.',
    url: 'https://centrio.me/blog/how-to-combine-messengers',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const STEPS = [
  { n: 1, title: 'Скачайте Centrio', text: 'Установщик доступен для Windows, macOS и Linux. Файл весит около 90 МБ, установка занимает меньше минуты.' },
  { n: 2, title: 'Добавьте нужные сервисы', text: 'При первом запуске выберите Telegram, WhatsApp, VK и любые другие из списка 100+ поддерживаемых сервисов — каждый откроется как отдельная вкладка со своей сессией.' },
  { n: 3, title: 'Войдите в каждый аккаунт как обычно', text: 'Telegram — через QR-код или номер телефона, WhatsApp Web — через сканирование QR в телефоне, VK — через логин и пароль. Сессии сохраняются локально, повторный вход не требуется.' },
  { n: 4, title: 'Организуйте сервисы по папкам', text: 'Сгруппируйте личные и рабочие чаты в отдельные папки — например, «Работа» (Slack, рабочий Telegram) и «Личное» (WhatsApp, VK, семейный Telegram).' },
  { n: 5, title: 'Настройте уведомления и горячие клавиши', text: 'В настройках каждого сервиса можно включить или отключить звук и всплывающие оповещения, а также задать горячие клавиши для быстрого переключения между вкладками.' },
];

const TIPS = [
  { title: 'Несколько аккаунтов одного мессенджера', text: 'Можно добавить Telegram дважды — для личного и рабочего аккаунта — и они будут работать независимо, с разными уведомлениями.' },
  { title: 'Проблемы со входом в WhatsApp Web', text: 'Если QR-код не сканируется, обновите вкладку WhatsApp внутри Centrio и убедитесь, что на телефоне последняя версия приложения.' },
  { title: 'Сервис работает нестабильно', text: 'Если сервис (например, Discord) периодически отваливается из вашего региона, включите встроенный VPN в настройках Centrio — отдельно устанавливать ничего не нужно.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Как объединить Telegram, WhatsApp и VK в одном приложении', item: 'https://centrio.me/blog/how-to-combine-messengers' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Как объединить Telegram, WhatsApp и VK в одном приложении',
  description: 'Пошаговая инструкция: как собрать Telegram, WhatsApp, VK и другие мессенджеры в одном окне на Windows, macOS или Linux с помощью Centrio. Установка за 5 минут.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/how-to-combine-messengers' },
};

export default function HowToCombinePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(34,197,94,0.15)', color: '#4ade80', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Инструкция · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Как объединить Telegram, WhatsApp{' '}
            <span style={{ background: 'linear-gradient(90deg,#4ade80,#38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>и VK в одном приложении</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            5 шагов, чтобы больше никогда не переключаться между вкладками браузера — весь день в одном окне, на Windows, macOS или Linux.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Пошаговая инструкция</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#4ade80', flexShrink: 0 }}>{s.n}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{s.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{s.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Полезные советы</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {TIPS.map((t) => (
                <div key={t.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{t.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{t.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Похожие статьи</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              <Link href="/blog/who-needs-it" style={{ color: '#4ade80', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '8px 16px' }}>Кому нужна такая программа →</Link>
              <Link href="/blog/messenger-vpn-guide" style={{ color: '#4ade80', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '8px 16px' }}>VPN для мессенджеров →</Link>
              <Link href="/faq" style={{ color: '#4ade80', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 10, padding: '8px 16px' }}>Все вопросы и ответы →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Начните за 5 минут</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Скачайте Centrio и объедините мессенджеры прямо сейчас.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#22c55e,#38bdf8)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(34,197,94,0.4)' }}>
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
