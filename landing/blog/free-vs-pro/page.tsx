import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Бесплатно или Pro в Centrio: что входит в каждый тариф и когда апгрейд оправдан',
  description: 'Разбираем, что доступно в бесплатной версии Centrio, что открывает Pro-подписка — папки, рабочие пространства, VPN, расширения — и в каких случаях платный тариф реально окупается.',
  alternates: { canonical: 'https://centrio.me/blog/free-vs-pro' },
  openGraph: {
    title: 'Бесплатно vs Pro в Centrio',
    description: 'Что входит в бесплатный тариф и что открывает Pro-подписка Centrio.',
    url: 'https://centrio.me/blog/free-vs-pro',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const FREE_FEATURES = [
  'До трёх мессенджеров одновременно, без ограничения по времени использования',
  'Изолированные сессии для каждой вкладки',
  'Единая система уведомлений и бейджи непрочитанных',
  'Базовые темы оформления',
  'Синхронизация настроек между устройствами',
];

const PRO_FEATURES = [
  'Неограниченное число подключённых мессенджеров',
  'Папки и рабочие пространства для группировки по проектам',
  'Встроенный VPN с протоколами VLESS, VMess, Trojan, Shadowsocks, Hysteria2',
  'Сплит-экран — до четырёх мессенджеров на экране одновременно',
  'Блокировщик рекламы, принудительная тёмная тема, «Чат для сайта»',
  'AI-ассистент, заметки и другие расширения',
  'Индивидуальные звуки уведомлений для каждого мессенджера',
];

const WHEN_TO_UPGRADE = [
  { title: 'Мессенджеров и сервисов больше трёх', text: 'Самое прямое ограничение бесплатного тарифа — если для работы нужно держать открытыми четыре и больше сервисов одновременно, Pro снимает лимит полностью.' },
  { title: 'Регулярные проблемы с доступом к сервисам', text: 'Встроенный VPN избавляет от необходимости устанавливать и настраивать отдельное приложение, если часть сервисов периодически становится недоступна без него.' },
  { title: 'Много мессенджеров, которые сложно найти в общем списке', text: 'Папки и рабочие пространства становятся заметно полезнее, когда список вкладок выходит за пределы одного экрана без прокрутки.' },
  { title: 'Нужно работать с двумя чатами одновременно', text: 'Сплит-экран экономит время именно тем, кому регулярно требуется следить за двумя источниками сразу, а не переключаться между ними по очереди.' },
];

const FAQ = [
  { q: 'Можно ли пользоваться Centrio бесплатно без ограничения по времени?', a: 'Да, бесплатный тариф не ограничен по сроку — это не триал, а постоянный план с фиксированным набором функций и лимитом в три мессенджера.' },
  { q: 'Что произойдёт с мессенджерами сверх лимита, если отменить Pro-подписку?', a: 'Приложение автоматически скрывает мессенджеры сверх лимита бесплатного тарифа — данные не удаляются, доступ восстанавливается сразу после повторной активации Pro.' },
  { q: 'Есть ли пробный период у Pro-подписки?', a: 'Да, при первом запуске приложения без входа в аккаунт доступен временный пробный доступ ко всем функциям Pro — подробности пробного периода отображаются прямо в приложении.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Бесплатно или Pro в Centrio', item: 'https://centrio.me/blog/free-vs-pro' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Бесплатно или Pro в Centrio: что входит в каждый тариф и когда апгрейд оправдан',
  description: 'Разбираем, что доступно в бесплатной версии Centrio и что открывает Pro-подписка.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/free-vs-pro' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function FreeVsProPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(152,186,255,0.15)', color: '#98baff', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Сравнение
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Бесплатно{' '}
            <span style={{ background: 'linear-gradient(90deg,#98baff,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>или Pro в Centrio</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Полный список того, что входит в каждый тариф, и честный разбор — в каких случаях платная подписка реально окупается, а в каких бесплатного тарифа достаточно.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Что входит в бесплатный тариф</> },
          { id: 'section-2', title: <>Что открывает Pro</> },
          { id: 'section-3', title: <>Когда апгрейд оправдан</> },
          { id: 'section-4', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Бесплатный тариф Centrio — не урезанный триал, а полноценный план без ограничения по времени: с ним можно пользоваться приложением сколько угодно долго, если хватает лимита в три мессенджера. Pro снимает этот лимит и открывает набор расширений для тех, кому нужно больше — от папок и VPN до сплит-экрана. Разбираем разницу подробно.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Что входит в бесплатный тариф</h2>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
              <ul style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14.5, lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
                {FREE_FEATURES.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Что открывает Pro</h2>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
              <ul style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14.5, lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
                {PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}
              </ul>
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-3" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Когда апгрейд реально оправдан</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHEN_TO_UPGRADE.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-4" style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Частые вопросы</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FAQ.map((item) => (
                <div key={item.q} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.q}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.a}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Начните с бесплатного тарифа</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Апгрейд до Pro доступен в любой момент прямо из приложения.</p>
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
