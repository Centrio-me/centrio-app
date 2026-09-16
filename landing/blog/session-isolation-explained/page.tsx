import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Изоляция сессий в мессенджерах: как работают вкладки и почему аккаунты не путаются',
  description: 'Как устроена изоляция сессий в агрегаторах мессенджеров: что такое отдельный контейнер cookie для каждой вкладки и почему это позволяет держать несколько аккаунтов одного сервиса одновременно.',
  alternates: { canonical: 'https://centrio.me/blog/session-isolation-explained' },
  openGraph: {
    title: 'Изоляция сессий в мессенджерах',
    description: 'Как работает изоляция сессий и почему несколько аккаунтов одного сервиса не путаются между собой.',
    url: 'https://centrio.me/blog/session-isolation-explained',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const HOW_IT_WORKS = [
  { title: 'Отдельное хранилище на каждую вкладку', text: 'Каждый мессенджер в Centrio получает собственный изолированный раздел для cookie, локального хранилища браузера и кэша — так же, как если бы каждый сервис открывался в отдельном профиле Chrome, только без ручной настройки.' },
  { title: 'Независимая авторизация', text: 'Вход в один аккаунт никак не влияет на остальные вкладки — можно быть одновременно авторизованным в личном и рабочем WhatsApp, и ни один из них не «увидит» данные другого.' },
  { title: 'Раздельное хранение на диске', text: 'Технически данные каждой вкладки физически лежат в разных подпапках на диске — при удалении одного мессенджера данные остальных не затрагиваются.' },
];

const WHY_IT_MATTERS = [
  { title: 'Несколько аккаунтов одного сервиса', text: 'Без изоляции сессий попытка открыть два аккаунта WhatsApp в одном окне браузера приведёт к тому, что второй вход разлогинит первый — сессии конкурируют за один и тот же общий профиль.' },
  { title: 'Безопасность рабочих и личных данных', text: 'Изоляция не позволяет скрипту одного сайта случайно получить доступ к cookie другого — каждая вкладка технически работает как отдельное приложение.' },
  { title: 'Стабильность при большом числе вкладок', text: 'Ошибка или сбой в одной вкладке не приводит к перезагрузке или обнулению сессии в соседних — процессы изолированы друг от друга.' },
];

const FAQ = [
  { q: 'Чем изоляция сессий отличается от режима инкогнито браузера?', a: 'Режим инкогнито создаёт временное хранилище, которое стирается при закрытии окна — авторизацию придётся повторять каждый раз. Изолированная сессия в агрегаторе постоянна и сохраняется между перезапусками приложения.' },
  { q: 'Может ли один мессенджер получить доступ к данным другого через изоляцию сессий?', a: 'Нет, именно в этом смысл изоляции — каждая вкладка технически не имеет доступа к хранилищу соседних, даже если оба сервиса открыты одновременно в одном приложении.' },
  { q: 'Работает ли изоляция сессий одинаково для всех сервисов?', a: 'Да, принцип применяется на уровне самого агрегатора — к любому добавленному сайту, включая произвольные сервисы, которых нет в стандартном каталоге.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Изоляция сессий в мессенджерах', item: 'https://centrio.me/blog/session-isolation-explained' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Изоляция сессий в мессенджерах: как работают вкладки и почему аккаунты не путаются',
  description: 'Как устроена изоляция сессий в агрегаторах мессенджеров и почему это позволяет держать несколько аккаунтов одного сервиса одновременно.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/session-isolation-explained' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function SessionIsolationExplainedPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(103,232,249,0.15)', color: '#67e8f9', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Безопасность
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Изоляция сессий:{' '}
            <span style={{ background: 'linear-gradient(90deg,#67e8f9,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>почему аккаунты не путаются</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Разбираем механизм, который позволяет держать несколько аккаунтов одного мессенджера одновременно, не выходя из одного при входе в другой.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Как это устроено технически</> },
          { id: 'section-2', title: <>Зачем это нужно</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Один из ключевых терминов, которые встречаются в описании любого агрегатора мессенджеров, — «изоляция сессий». От того, насколько качественно она реализована, зависит, можно ли держать несколько аккаунтов одного сервиса открытыми одновременно, не рискуя случайно выйти из одного при входе в другой.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как это устроено технически</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HOW_IT_WORKS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Зачем это нужно на практике</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHY_IT_MATTERS.map((item) => (
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
              <Link href="/blog/is-it-safe" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Насколько это безопасно →</Link>
              <Link href="/blog/multiple-accounts" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Несколько аккаунтов на одном компьютере →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Держите несколько аккаунтов одновременно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Изолированные сессии для каждой вкладки — стандартная функция Centrio, доступна бесплатно.</p>
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
