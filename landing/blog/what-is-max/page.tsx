import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Что такое MAX и нужно ли им пользоваться отдельно в 2026 году',
  description: 'Разбираем, что такое национальный мессенджер MAX, зачем он появился и как пользоваться им вместе с Telegram и WhatsApp в одном окне, не переустанавливая приложения.',
  alternates: { canonical: 'https://centrio.me/blog/what-is-max' },
  openGraph: {
    title: 'Что такое MAX',
    description: 'Национальный мессенджер MAX — что это, зачем нужен и как совмещать его с другими мессенджерами.',
    url: 'https://centrio.me/blog/what-is-max',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const WHAT_IS_MAX = [
  { title: 'Национальный мессенджер', text: 'MAX — российский мессенджер, разработанный VK, позиционируемый как основная платформа для общения с государственными сервисами, банками и школами наравне с обычной перепиской.' },
  { title: 'Интеграция с государственными сервисами', text: 'Через MAX предполагается доступ к части функций, ранее доступных только через отдельные приложения и порталы — от школьных чатов до государственных уведомлений.' },
  { title: 'Не замена, а дополнение', text: 'Для большинства пользователей MAX не отменяет привычные Telegram и WhatsApp — он используется параллельно, для конкретных задач, которые к нему привязаны.' },
];

const HOW_TO_COMBINE = [
  { title: 'Добавьте MAX как ещё одну вкладку', text: 'В Centrio MAX подключается так же, как любой другой мессенджер — через каталог добавления или по прямой ссылке на веб-версию, без необходимости переустанавливать или заменять другие приложения.' },
  { title: 'Сохраните доступ к старым чатам', text: 'Telegram и WhatsApp продолжают работать в соседних вкладках — переход на MAX для конкретных задач не требует отказа от истории переписки в других мессенджерах.' },
  { title: 'Единый список уведомлений', text: 'Сообщения из MAX попадают в общий бейдж непрочитанных наравне с остальными подключёнными сервисами — не нужно отдельно проверять, не пришло ли что-то важное.' },
];

const FAQ = [
  { q: 'Обязательно ли устанавливать MAX?', a: 'Требования зависят от контекста использования — например, взаимодействия с конкретными государственными или образовательными сервисами. Для личной переписки выбор мессенджера остаётся за пользователем.' },
  { q: 'Можно ли пользоваться MAX через компьютер, а не только через телефон?', a: 'Да, у MAX есть веб-версия, которую можно открыть как в браузере, так и в виде отдельной вкладки в агрегаторе мессенджеров вроде Centrio.' },
  { q: 'Переносятся ли контакты и чаты автоматически при добавлении MAX?', a: 'Нет, каждый мессенджер хранит свою переписку независимо — добавление MAX не переносит и не дублирует историю из Telegram или WhatsApp, это отдельный сервис со своей адресной книгой.' },
  { q: 'Можно ли одновременно держать открытыми MAX, Telegram и WhatsApp?', a: 'Да, в агрегаторе мессенджеров все три сервиса открываются как отдельные изолированные вкладки одновременно, без необходимости переключаться между разными приложениями или окнами браузера.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Что такое MAX', item: 'https://centrio.me/blog/what-is-max' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Что такое MAX и нужно ли им пользоваться отдельно в 2026 году',
  description: 'Разбираем, что такое национальный мессенджер MAX и как пользоваться им вместе с Telegram и WhatsApp в одном окне.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/what-is-max' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function WhatIsMaxPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(125,211,252,0.15)', color: '#7dd3fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Основы
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Что такое{' '}
            <span style={{ background: 'linear-gradient(90deg,#5eead4,#7dd3fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>MAX</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Разбираем, что такое национальный мессенджер MAX и как пользоваться им параллельно с привычными Telegram и WhatsApp, не теряя старую переписку.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Что такое MAX</> },
          { id: 'section-2', title: <>Как совмещать с другими мессенджерами</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              MAX стал заметной темой обсуждения в 2026 году — новый национальный мессенджер вызывает вопрос, нужно ли его устанавливать, и если да, то что делать с уже привычными Telegram, WhatsApp и другими сервисами, в которых годами накапливалась переписка. Разбираем, что представляет собой MAX и как избежать необходимости выбирать между старыми и новыми мессенджерами.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Что такое MAX</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHAT_IS_MAX.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как совмещать MAX с другими мессенджерами</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {HOW_TO_COMBINE.map((item) => (
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
              <Link href="/blog/max-transition" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>MAX и Telegram/WhatsApp одновременно →</Link>
              <Link href="/blog/russian-services-one-place" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Российские сервисы в одном окне →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Держите MAX и остальные мессенджеры в одном окне</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Никаких переустановок — просто ещё одна вкладка рядом с привычными сервисами.</p>
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
