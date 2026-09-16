import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Сплит-экран в Centrio: как работать с двумя и более мессенджерами одновременно',
  description: 'Как включить сплит-экран в Centrio, какие раскладки доступны — 2 колонки, 3 колонки, сетка 2×2 — и как сохранить набор мессенджеров как пресет для повторного использования.',
  alternates: { canonical: 'https://centrio.me/blog/split-screen-guide' },
  openGraph: {
    title: 'Сплит-экран в Centrio',
    description: 'Гид по раскладкам сплит-экрана и пресетам — работайте с несколькими мессенджерами в одном окне.',
    url: 'https://centrio.me/blog/split-screen-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const LAYOUTS = [
  { title: '2 колонки', text: 'Классическая раскладка «бок о бок» — например, рабочий Telegram слева и почта справа. Границу между колонками можно перетаскивать мышью, меняя пропорции на лету.' },
  { title: '3 колонки', text: 'Для тех, кто держит в поле зрения три источника одновременно — переписку с клиентом, внутренний рабочий чат и, например, канал с задачами.' },
  { title: 'Сетка 2×2', text: 'Четыре мессенджера на экране одновременно — подходит для мониторинга нескольких каналов поддержки или диспетчерской работы, где важно не упустить ни одно направление.' },
  { title: '2 сверху, 1 снизу / 1 сверху, 2 снизу', text: 'Асимметричные раскладки для случаев, когда один из мессенджеров важнее остальных и заслуживает больше места по высоте, а не по ширине.' },
];

const STEPS = [
  { n: '1', title: 'Откройте меню сплита', text: 'Нажмите на иконку сплит-экрана в нижней части боковой панели — если её не видно, включите функцию в Настройки → Расширения → «Сплит-экран».' },
  { n: '2', title: 'Выберите раскладку', text: 'Появится выбор из 2 колонок, 3 колонок, сетки 2×2 и двух асимметричных вариантов — выберите ту, что соответствует числу мессенджеров, которые нужно видеть одновременно.' },
  { n: '3', title: 'Назначьте мессенджер в каждую зону', text: 'Кликните по пустой зоне и выберите мессенджер из списка добавленных — можно менять назначение в любой момент без выхода из сплит-режима.' },
  { n: '4', title: 'Сохраните как пресет', text: '«+ Сохранить как пресет» запоминает и раскладку, и набор мессенджеров в каждой зоне — в следующий раз не придётся настраивать всё заново, достаточно применить сохранённый пресет.' },
];

const FAQ = [
  { q: 'Сколько мессенджеров можно открыть одновременно в сплит-режиме?', a: 'До четырёх — в раскладке сетки 2×2. Для двух или трёх мессенджеров доступны отдельные упрощённые раскладки без лишних разделителей.' },
  { q: 'Можно ли сохранить несколько разных пресетов сплита?', a: 'Да, пресетов может быть сколько угодно — например, отдельный на утренний обзор всех каналов поддержки и отдельный на работу с конкретным клиентом.' },
  { q: 'Сплит-экран доступен на бесплатном тарифе?', a: 'Функция входит в Pro-подписку Centrio вместе с папками, рабочими пространствами и другими расширениями.' },
  { q: 'Что происходит с уведомлениями от мессенджеров вне видимых зон сплита?', a: 'Ничего не меняется — уведомления, бейджи непрочитанных и звук продолжают работать для всех подключённых мессенджеров независимо от того, показаны они в текущей раскладке сплита или нет.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Сплит-экран в Centrio', item: 'https://centrio.me/blog/split-screen-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Сплит-экран в Centrio: как работать с двумя и более мессенджерами одновременно',
  description: 'Как включить сплит-экран в Centrio, какие раскладки доступны и как сохранить набор мессенджеров как пресет.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/split-screen-guide' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

const HOWTO_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Как включить сплит-экран в Centrio',
  step: STEPS.map((s) => ({ '@type': 'HowToStep', name: s.title, text: s.text })),
};

export default function SplitScreenGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HOWTO_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(129,140,248,0.15)', color: '#818cf8', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Плагины
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Сплит-экран:{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>несколько мессенджеров на одном экране</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Пять раскладок, пресеты и пошаговая настройка — как видеть переписку из двух-четырёх мессенджеров одновременно, не переключаясь между вкладками.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Доступные раскладки</> },
          { id: 'section-2', title: <>Как настроить за 4 шага</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8, marginBottom: 16 }}>
              Обычный режим работы в мессенджере-агрегаторе — одна активная вкладка на весь экран, остальные ждут своей очереди. Это удобно для последовательной работы, но плохо подходит, когда нужно следить за двумя каналами одновременно: например, вести переговоры в одном чате и параллельно сверяться с задачами в другом. Для этого в Centrio есть сплит-экран — режим, который делит рабочую область на несколько независимых зон.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Доступные раскладки</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {LAYOUTS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как настроить за 4 шага</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS.map((step) => (
                <div key={step.n} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 16 }}>
                  <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{step.n}</div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{step.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
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

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте сплит-экран в Centrio</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Доступно на Pro-тарифе вместе с другими расширениями.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'linear-gradient(135deg,#4ade80,#22d3ee)', color: '#090d15', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(74,222,128,0.35)' }}>
              Скачать Centrio для Windows
             <ArrowDownToLine size={16} /></a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link>
            </p>
          </section>
              </EditorialArticle>
      <SiteFooter />
    </>
  );
}
