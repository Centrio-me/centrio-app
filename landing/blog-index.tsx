import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Блог Centrio — гиды, сравнения и советы про мессенджеры',
  description: 'Статьи о том, как объединить мессенджеры в одном окне, сравнения Centrio с Rambox, Franz, Wavebox и Ferdium, гид по встроенному VPN и советы по продуктивности.',
  alternates: { canonical: 'https://centrio.me/blog' },
  openGraph: {
    title: 'Блог Centrio',
    description: 'Гиды, сравнения и советы про мессенджеры и Centrio.',
    url: 'https://centrio.me/blog',
    type: 'website',
    images: [DEFAULT_OG_IMAGE],
  },
};

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
  ],
};

const POSTS = [
  { slug: 'who-needs-it', tag: 'Гид', color: '#7dd3fc', title: 'Кому нужна программа для мессенджеров в одном окне: 7 сценариев', desc: 'Фрилансеры, SMM, поддержка, удалённые команды — разбираем 7 реальных случаев, где агрегатор мессенджеров экономит часы каждую неделю.' },
  { slug: 'how-to-combine-messengers', tag: 'Инструкция', color: '#4ade80', title: 'Как объединить Telegram, WhatsApp и VK в одном приложении', desc: 'Пошаговая инструкция на 5 шагов для Windows, macOS и Linux.' },
  { slug: 'vs-ferdium', tag: 'Сравнение', color: '#a5b4fc', title: 'Centrio vs Ferdium: сравнение агрегаторов мессенджеров 2026', desc: 'Открытый форк Franz против Centrio с VPN и поддержкой VK «из коробки».' },
  { slug: 'messenger-vpn-guide', tag: 'Гид', color: '#d8b4fe', title: 'Зачем нужен VPN для мессенджеров и как настроить его в Centrio', desc: 'Протоколы VLESS, VMess, Trojan, Shadowsocks, Hysteria2 и встроенный VPN Centrio без отдельных приложений.' },
  { slug: 'stop-switching-tabs', tag: 'Продуктивность', color: '#fdba74', title: 'Как перестать переключаться между вкладками мессенджеров', desc: 'Реальная цена переключения контекста и как собрать все мессенджеры в одном окне.' },
  { slug: 'is-it-safe', tag: 'Безопасность', color: '#67e8f9', title: 'Безопасно ли использовать агрегаторы мессенджеров вроде Centrio?', desc: 'Как устроена изоляция сессий, подписанный установщик и чек-лист при выборе агрегатора.' },
  { slug: 'remote-team-messengers', tag: 'Удалённая работа', color: '#6ee7b7', title: 'Мессенджеры для удалённой команды: как свести всё в одно окно', desc: 'Slack, Telegram, Notion, Zoom в одном приложении по папкам, без потери сообщений между проектами.' },
  { slug: 'vs-rambox', tag: 'Сравнение', color: '#a5b4fc', title: 'Centrio vs Rambox: подробное сравнение 2026', desc: 'Что выбрать между Rambox и Centrio — функции, цены, поддержка русского языка.' },
  { slug: 'vs-franz', tag: 'Сравнение', color: '#a5b4fc', title: 'Centrio vs Franz: что лучше в 2026 году', desc: 'Сравниваем Centrio с одним из первых агрегаторов мессенджеров — Franz.' },
  { slug: 'vs-wavebox', tag: 'Сравнение', color: '#a5b4fc', title: 'Centrio vs Wavebox: сравнение для команд и бизнеса', desc: 'Wavebox против Centrio — что выбрать для рабочих и личных мессенджеров.' },
  { slug: 'top-apps', tag: 'Статистика', color: '#facc15', title: 'Топ-10 приложений в Centrio — апрель 2026', desc: 'Самые популярные мессенджеры и сервисы среди пользователей Centrio.' },
  { slug: 'multiple-accounts', tag: 'Инструкция', color: '#4ade80', title: 'Несколько аккаунтов WhatsApp и Telegram на одном компьютере', desc: 'Как открыть 2, 3 и больше аккаунтов WhatsApp и Telegram одновременно — без телефона-эмулятора и сброса сессий.' },
  { slug: 'telegram-vpn-block', tag: 'VPN', color: '#d8b4fe', title: 'Telegram не работает даже с VPN: почему и что реально помогает в 2026', desc: 'Почему обычный VPN не спасает от блокировок Telegram и какие протоколы реально работают.' },
  { slug: 'best-messenger-aggregators', tag: 'Подборка', color: '#f472b6', title: 'Лучшие агрегаторы мессенджеров в 2026 году: топ-7', desc: 'Centrio, Rambox, Franz, Ferdium, Wavebox, Station, Shift — сравнение в одной таблице.' },
  { slug: 'all-social-media-one-place', tag: 'Гид', color: '#7dd3fc', title: 'Как собрать ВКонтакте, Telegram, Instagram и другие соцсети в одном месте', desc: 'Рабочий способ для SMM-менеджеров и владельцев нескольких аккаунтов держать все соцсети в одном окне.' },
  { slug: 'max-transition', tag: 'Гид', color: '#5eead4', title: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты в 2026', desc: 'Как пользоваться MAX вместе с Telegram и WhatsApp в одном окне, не переустанавливая приложения и не теряя старые чаты.' },
  { slug: 'whatsapp-telegram-ban-risk', tag: 'Безопасность', color: '#67e8f9', title: 'Забанят ли WhatsApp или Telegram за использование в Centrio? Разбираем риски', desc: 'Что реально приводит к бану мессенджеров и почему официальные веб-версии в отдельном окне не входят в зону риска.' },
  { slug: 'vs-station', tag: 'Сравнение', color: '#a5b4fc', title: 'Station больше не работает? Лучшая альтернатива в 2026 — сравнение с Centrio', desc: 'Station закрыт разработчиком в 2023 году. Сравниваем с активно поддерживаемым Centrio.' },
  { slug: 'vs-shift', tag: 'Сравнение', color: '#a5b4fc', title: 'Centrio vs Shift: сравнение агрегаторов мессенджеров 2026', desc: 'Shift против Centrio — цена, лимиты бесплатной версии, VPN и поддержка российских сервисов.' },
];

export default function BlogIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 24px 40px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Блог Centrio
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Гиды, сравнения{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>и советы про мессенджеры</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}>
            Как объединить мессенджеры, сравнения с Rambox, Franz и Wavebox, гид по встроенному VPN и советы по продуктивности.
          </p>
        </section>

        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 90px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                style={{
                  display: 'block',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16,
                  padding: '24px',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'border-color .2s, transform .2s',
                }}
              >
                <div style={{ display: 'inline-block', background: `${post.color}22`, color: post.color, borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
                  {post.tag}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, color: '#e2e8f0', lineHeight: 1.4 }}>{post.title}</h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, lineHeight: 1.6, margin: 0 }}>{post.desc}</p>
                <div style={{ marginTop: 16, color: post.color, fontSize: 13.5, fontWeight: 600 }}>Читать →</div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
