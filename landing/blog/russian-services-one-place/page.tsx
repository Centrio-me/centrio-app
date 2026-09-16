import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'ВКонтакте, MAX, Яндекс и другие русские сервисы в одном окне — гид 2026',
  description: 'Как собрать ВКонтакте, MAX, Яндекс.Почту и другие российские сервисы в одном приложении вместо десятка открытых вкладок браузера.',
  alternates: { canonical: 'https://centrio.me/blog/russian-services-one-place' },
  openGraph: {
    title: 'Русские сервисы в одном окне',
    description: 'ВКонтакте, MAX, Яндекс и другие российские сервисы — гид по объединению в одном приложении.',
    url: 'https://centrio.me/blog/russian-services-one-place',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const SERVICES = [
  { title: 'ВКонтакте', text: 'Личные сообщения и рабочие сообщества ВКонтакте открываются как отдельная вкладка с собственной, изолированной от остальных сервисов сессией и авторизацией.' },
  { title: 'MAX', text: 'Национальный мессенджер MAX, который многие организации сделали основным каналом связи в 2025–2026 годах, подключается так же, как и остальные веб-сервисы — без установки отдельного приложения.' },
  { title: 'Яндекс.Почта и Яндекс.Диск', text: 'Рабочая почта на Яндексе и файлы на Яндекс.Диске остаются под рукой рядом с мессенджерами, а не в отдельном окне браузера.' },
  { title: 'Одноклассники', text: 'Для тех, кто ведёт сообщества или переписку в Одноклассниках, сервис добавляется тем же способом — по прямой ссылке на веб-версию.' },
];

const WHY_SEPARATE = [
  { title: 'Российские сервисы редко есть в западных агрегаторах', text: 'Большинство зарубежных приложений-агрегаторов (Franz, Rambox, Station) ориентированы на международный рынок и не включают ВКонтакте, MAX или Яндекс.Почту в список готовых интеграций.' },
  { title: 'Любой сайт можно добавить вручную', text: 'Centrio не ограничивается заранее заданным списком — «Добавить свой сервис» принимает любой URL, поэтому русские сервисы подключаются так же просто, как WhatsApp или Telegram.' },
  { title: 'Общие уведомления для всех сервисов сразу', text: 'Бейдж непрочитанных на иконке в трее считает сообщения из ВКонтакте, MAX и остальных сервисов вместе — не нужно по очереди проверять каждую вкладку браузера.' },
];

const FAQ = [
  { q: 'Есть ли MAX в списке готовых мессенджеров или его нужно добавлять вручную?', a: 'MAX добавляется через функцию «Добавить свой сервис» по прямой ссылке на веб-версию — так же, как и любой другой сайт, не входящий в список популярных мессенджеров.' },
  { q: 'Безопасно ли входить в ВКонтакте и MAX в одном приложении с рабочими мессенджерами?', a: 'Да, каждый сервис в Centrio получает собственную изолированную сессию (cookies, кэш, вход) — личные и рабочие аккаунты не пересекаются, даже если это одна и та же платформа.' },
  { q: 'Можно ли одновременно пользоваться и зарубежными, и российскими сервисами?', a: 'Да, ограничений по сочетанию сервисов нет — WhatsApp, Telegram, ВКонтакте, MAX и Яндекс.Почта могут находиться в одном приложении одновременно, при необходимости сгруппированные по папкам.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Русские сервисы в одном окне', item: 'https://centrio.me/blog/russian-services-one-place' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'ВКонтакте, MAX, Яндекс и другие русские сервисы в одном окне — гид 2026',
  description: 'Как собрать российские сервисы в одном приложении вместо десятка открытых вкладок браузера.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/russian-services-one-place' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function RussianServicesOnePlacePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(148,163,255,0.15)', color: '#94a3ff', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Русские сервисы{' '}
            <span style={{ background: 'linear-gradient(90deg,#94a3ff,#5eead4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>в одном окне</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            ВКонтакте, MAX, Яндекс.Почта и другие российские сервисы — как собрать их в одном приложении вместо десятка вкладок браузера.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Какие сервисы можно объединить</> },
          { id: 'section-2', title: <>Зачем это отдельный сценарий</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Большинство приложений-агрегаторов мессенджеров создавались с расчётом на международный рынок и включают в список готовых интеграций WhatsApp, Telegram, Slack — но не ВКонтакте, MAX или Яндекс.Почту. При этом именно эти сервисы у многих пользователей в России и СНГ занимают основную часть рабочей и личной переписки. Разбираем, как собрать их вместе.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Какие сервисы можно объединить</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {SERVICES.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Зачем это отдельный сценарий</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHY_SEPARATE.map((item) => (
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
              <Link href="/blog/what-is-max" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Что такое MAX →</Link>
              <Link href="/blog/add-custom-service" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как добавить любой сервис →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Соберите все сервисы в одном окне</h2>
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
