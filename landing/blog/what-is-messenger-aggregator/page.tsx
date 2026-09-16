import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Что такое агрегатор мессенджеров и как он работает: полный разбор',
  description: 'Агрегатор мессенджеров объясняем простыми словами: как устроен, чем отличается от простых вкладок браузера, какие бывают виды и когда он реально нужен. С примерами и фактами.',
  alternates: { canonical: 'https://centrio.me/blog/what-is-messenger-aggregator' },
  openGraph: {
    title: 'Что такое агрегатор мессенджеров',
    description: 'Разбираем, как устроены агрегаторы мессенджеров, чем они отличаются от вкладок браузера и когда действительно экономят время.',
    url: 'https://centrio.me/blog/what-is-messenger-aggregator',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const HOW_IT_WORKS = [
  {
    title: 'Изолированный контейнер на каждый сервис',
    text: 'Каждый мессенджер в агрегаторе открывается в собственном изолированном окружении — со своими cookie, локальным хранилищем и кэшем. Технически это устроено так же, как разные профили в браузере, только автоматизировано: не нужно вручную создавать профиль под каждый аккаунт.',
  },
  {
    title: 'Единая система уведомлений',
    text: 'Вместо десятка отдельных иконок в трее или на панели задач агрегатор собирает бейджи непрочитанных сообщений в одном месте — обычно прямо на иконке приложения и рядом с каждой вкладкой в боковой панели.',
  },
  {
    title: 'Постоянные сессии между перезапусками',
    text: 'В отличие от вкладок браузера, которые можно случайно закрыть или которые сбрасываются при очистке кэша, сессии в агрегаторе сохраняются между запусками приложения — вы открываете программу и сразу видите все чаты, без повторного сканирования QR-кодов и ввода паролей.',
  },
  {
    title: 'Фоновая работа без открытого окна',
    text: 'Агрегатор продолжает получать сообщения и считать непрочитанные, даже когда окно свёрнуто или скрыто в трей — точно так же, как это делает нативное приложение мессенджера на телефоне.',
  },
];

const TYPES = [
  {
    title: 'Веб-обёртки (Electron/Tauri-приложения)',
    text: 'Самый распространённый тип — Rambox, Franz, Ferdium, Station, Wavebox и Centrio. По сути это браузерный движок (Chromium или его облегчённая версия), в котором каждый сервис открывается как отдельная изолированная вкладка. Разработчику не нужно поддерживать API каждого мессенджера отдельно — приложение просто загружает официальную веб-версию сервиса, но даёт ей больше возможностей, чем обычная вкладка браузера: постоянные уведомления, трей, автозапуск, единые горячие клавиши.',
  },
  {
    title: 'Мультипрофильные браузерные расширения',
    text: 'Более лёгкий вариант — расширения для Chrome или Firefox, которые переключают профили внутри одного окна браузера. Работают быстрее, но не дают отдельных иконок в трее, общего бейджа непрочитанных на весь компьютер и обычно менее стабильны при большом числе одновременных вкладок.',
  },
  {
    title: 'Корпоративные хабы для конкретной экосистемы',
    text: 'Например, интеграции внутри Slack или Microsoft Teams, которые подтягивают уведомления из других сервисов в один канал. Это не полноценный агрегатор в классическом смысле — он завязан на одну платформу и не заменяет отдельные мессенджеры, а скорее дублирует их уведомления.',
  },
];

const NOT_JUST_TABS = [
  { title: 'Вкладки браузера теряют сессии', text: 'Очистка кэша, обновление браузера или случайное закрытие всех вкладок — и придётся заново авторизовываться в каждом сервисе. Изолированные сессии агрегатора этой проблемы не знают.' },
  { title: 'Браузер не считает непрочитанные централизованно', text: 'В обычном браузере узнать о новом сообщении можно, только если вкладка активна или закреплена и её иконка favicon меняется — никакого общего счётчика на иконке в трее не будет.' },
  { title: 'Один и тот же сервис дважды в одном браузере — боль', text: 'Чтобы открыть два аккаунта WhatsApp в одном браузере, нужно вручную создавать отдельные профили Chrome и переключаться между окнами. В агрегаторе это одна кнопка «Добавить мессенджер» — второй экземпляр сразу получает свою изолированную сессию.' },
];

const FAQ = [
  { q: 'Агрегатор мессенджеров — это законно?', a: 'Да. Агрегатор просто загружает официальную веб-версию сервиса (web.telegram.org, web.whatsapp.com и так далее) внутри собственного окна — то же самое, что открыть эти сайты в браузере. Это не взлом и не обход защиты, а альтернативный способ показать тот же самый веб-интерфейс.' },
  { q: 'Чем агрегатор отличается от простого набора закладок в браузере?', a: 'Главное отличие — изолированные сессии для каждой вкладки (можно держать несколько аккаунтов одного сервиса одновременно), единая система уведомлений с бейджами непрочитанных и работа в фоне без открытого окна браузера.' },
  { q: 'Нужен ли агрегатор, если мессенджеров всего два-три?', a: 'Выгода растёт с числом сервисов, но заметна уже при трёх-четырёх: не нужно искать нужную вкладку среди открытых окон, а общий бейдж непрочитанных на иконке в трее экономит проверку каждого мессенджера по отдельности.' },
  { q: 'Может ли агрегатор читать переписку?', a: 'Разработчик агрегатора физически не видит содержимое переписки — оно передаётся напрямую между вашим устройством и серверами мессенджера по тому же зашифрованному каналу, что и в браузере. Приложение лишь отображает готовую веб-страницу сервиса в своём окне.' },
  { q: 'Какой агрегатор выбрать в 2026 году?', a: 'Зависит от задач: для нескольких аккаунтов одного сервиса и работы без стороннего VPN лучше подходят решения со встроенной изоляцией сессий и собственным VPN-клиентом, например Centrio. Подробное сравнение — в статье «Лучшие агрегаторы мессенджеров».' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Что такое агрегатор мессенджеров', item: 'https://centrio.me/blog/what-is-messenger-aggregator' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Что такое агрегатор мессенджеров и как он работает: полный разбор',
  description: 'Агрегатор мессенджеров объясняем простыми словами: как устроен, чем отличается от простых вкладок браузера, какие бывают виды и когда он реально нужен.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/what-is-messenger-aggregator' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function WhatIsAggregatorPage() {
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
            <span style={{ background: 'linear-gradient(90deg,#7dd3fc,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>агрегатор мессенджеров</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Разбираем термин простыми словами: как устроен агрегатор мессенджеров изнутри, чем он отличается от обычных вкладок браузера и когда он реально экономит время.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~8 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Как устроен агрегатор изнутри</> },
          { id: 'section-2', title: <>Какие бывают виды</> },
          { id: 'section-3', title: <>Чем это лучше вкладок браузера</> },
          { id: 'section-4', title: <>Кому это нужно</> },
          { id: 'section-5', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8, marginBottom: 16 }}>
              Агрегатор мессенджеров — это программа для компьютера, которая объединяет несколько мессенджеров, почтовых клиентов и социальных сетей в одном окне вместо того, чтобы держать открытыми десяток отдельных приложений или вкладок браузера. Telegram, WhatsApp, VK, Discord, Gmail — всё это можно добавить как отдельную вкладку внутри одной программы, с общим списком уведомлений и переключением одним кликом.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8, marginBottom: 16 }}>
              Термин прижился в англоязычной среде как «messenger aggregator» или «all-in-one messenger app» — первые заметные проекты этой категории, Franz и Rambox, появились ещё в 2016 году как ответ на растущее число мессенджеров, которыми параллельно пользовались одни и те же люди: один для семьи, другой — для работы, третий — для конкретного проекта или клиента.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Психолог Глория Марк из Калифорнийского университета в Ирвайне, которая много лет изучает влияние прерываний на рабочую продуктивность, показала в своих исследованиях: после отвлечения на постороннюю задачу человеку в среднем требуется больше 23 минут, чтобы полностью вернуться к прерванной работе. Переключение между мессенджерами — один из самых частых источников таких микропрерываний в течение дня, и именно с этой проблемой в первую очередь борются агрегаторы.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как устроен агрегатор мессенджеров изнутри</h2>
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
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Какие бывают виды агрегаторов</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {TYPES.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-3" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Чем это лучше набора вкладок в браузере</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14.5, lineHeight: 1.75, marginBottom: 20 }}>
              Технически ничто не мешает просто открыть web.telegram.org, web.whatsapp.com и vk.com/im в трёх вкладках Chrome. На практике этот подход быстро упирается в несколько ограничений, ради которых и появилась отдельная категория программ.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {NOT_JUST_TABS.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-4" style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Кому агрегатор действительно нужен</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14.5, lineHeight: 1.75, marginBottom: 12 }}>
              Не каждому пользователю компьютера агрегатор даёт заметный выигрыш — если вы открываете один мессенджер раз в день, отдельное приложение для этого избыточно. Но чем больше сервисов и аккаунтов приходится держать параллельно, тем ощутимее экономия:
            </p>
            <ul style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14.5, lineHeight: 1.9, paddingLeft: 20, margin: 0 }}>
              <li>Фрилансерам и агентствам, которые ведут переписку с клиентами в разных мессенджерах одновременно</li>
              <li>SMM-менеджерам, отвечающим за несколько групп в разных соцсетях</li>
              <li>Службам поддержки и отделам продаж, где заявки приходят в WhatsApp, Telegram и на почту вперемешку</li>
              <li>Удалённым командам, у которых рабочие каналы разбросаны по Slack, Telegram и корпоративной почте</li>
              <li>Владельцам нескольких аккаунтов одного сервиса — личного и рабочего WhatsApp, например</li>
            </ul>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-5" style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Частые вопросы</h2>
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
              <Link href="/blog/best-messenger-aggregators" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Лучшие агрегаторы 2026 →</Link>
              <Link href="/blog/is-it-safe" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Насколько это безопасно →</Link>
              <Link href="/blog/who-needs-it" style={{ color: '#86efac', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(134,239,172,0.25)', borderRadius: 10, padding: '8px 16px' }}>Кому это нужно: 7 сценариев →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте агрегатор мессенджеров бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Centrio объединяет мессенджеры, почту и соцсети в одном окне с изолированными сессиями и встроенным VPN.</p>
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
