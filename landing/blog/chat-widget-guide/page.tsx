import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Чат для сайта в Centrio: как подключить виджет и получать сообщения от посетителей',
  description: 'Как подключить виджет онлайн-чата на свой сайт через Centrio: настройка цвета и логотипа, получение сообщений прямо в приложении и ответы посетителям без сторонних сервисов.',
  alternates: { canonical: 'https://centrio.me/blog/chat-widget-guide' },
  openGraph: {
    title: 'Чат для сайта в Centrio',
    description: 'Подключите виджет чата на свой сайт и получайте сообщения посетителей прямо в Centrio.',
    url: 'https://centrio.me/blog/chat-widget-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const STEPS = [
  { n: '1', title: 'Создайте чат для сайта', text: 'Настройки → «Чат для сайта» → укажите домен, на котором будет работать виджет. Домен нужен для проверки — виджет откажется работать на чужом сайте.' },
  { n: '2', title: 'Настройте внешний вид', text: 'Выберите основной цвет виджета и при желании загрузите собственный логотип вместо стандартного — чат должен выглядеть частью вашего сайта, а не сторонней вставкой.' },
  { n: '3', title: 'Скопируйте код виджета', text: 'Готовый фрагмент JavaScript-кода вставляется перед закрывающим тегом </body> на сайте — работает с любым движком: от самописного HTML до WordPress и Tilda.' },
  { n: '4', title: 'Получайте сообщения в приложении', text: 'После установки кода «Чат для сайта» появляется как отдельная вкладка мессенджера в боковой панели Centrio — новые сообщения от посетителей приходят туда так же, как в обычном мессенджере, с уведомлением и звуком.' },
];

const FEATURES = [
  { title: 'Цветные аватары собеседников', text: 'Каждый посетитель сайта получает уникальный цвет аватара — удобно различать разные диалоги на первый взгляд, не читая имя.' },
  { title: 'Поиск и фильтр по диалогам', text: 'При большом потоке обращений можно быстро найти нужный диалог по имени, контакту или содержимому последнего сообщения.' },
  { title: 'Заготовленные быстрые ответы', text: 'Частые вопросы — про доставку, оплату, режим работы — можно ответить одним кликом по заранее сохранённому шаблону вместо набора текста каждый раз.' },
  { title: 'Время сообщения внутри самого сообщения', text: 'Метка времени показана прямо рядом с текстом, а не только при наведении — не нужно гадать, как давно писал собеседник.' },
];

const FAQ = [
  { q: 'Сколько сайтов можно подключить к одному аккаунту?', a: 'В текущей версии — один сайт на аккаунт. При необходимости нескольких сайтов эту функцию можно расширить в будущих обновлениях по мере спроса.' },
  { q: 'Виден ли виджет чата посетителям сайта на телефоне?', a: 'Да, виджет — это адаптивный веб-компонент, который корректно отображается и на десктопе, и на мобильных браузерах посетителей.' },
  { q: 'Нужен ли постоянно включённый компьютер, чтобы получать сообщения?', a: 'Приложение Centrio должно быть запущено (можно свёрнуто в трей), чтобы сообщения приходили с уведомлением сразу. Если приложение закрыто, сообщения не теряются — они появятся при следующем запуске.' },
  { q: '«Чат для сайта» — это Pro-функция?', a: 'Да, это платная функция, помеченная как альфа-версия — активно дорабатывается, о найденных багах можно сообщить в поддержку.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Чат для сайта в Centrio', item: 'https://centrio.me/blog/chat-widget-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Чат для сайта в Centrio: как подключить виджет и получать сообщения от посетителей',
  description: 'Как подключить виджет онлайн-чата на свой сайт через Centrio и получать сообщения прямо в приложении.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/chat-widget-guide' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

const HOWTO_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Как подключить чат для сайта в Centrio',
  step: STEPS.map((s) => ({ '@type': 'HowToStep', name: s.title, text: s.text })),
};

export default function ChatWidgetGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HOWTO_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(94,234,212,0.15)', color: '#5eead4', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Для бизнеса
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Чат для сайта:{' '}
            <span style={{ background: 'linear-gradient(90deg,#5eead4,#4ade80)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>сообщения с сайта прямо в Centrio</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Подключите виджет чата на свой сайт и отвечайте посетителям в той же программе, где уже открыты остальные мессенджеры — без отдельного личного кабинета стороннего сервиса.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~5 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Подключение за 4 шага</> },
          { id: 'section-2', title: <>Что умеет виджет</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Владельцы небольших сайтов часто оказываются перед выбором: ставить дорогой облачный сервис онлайн-консультанта с отдельным личным кабинетом и ежемесячной платой, или обходиться без чата вовсе и терять заявки от посетителей, не готовых звонить или писать на почту. «Чат для сайта» в Centrio — третий вариант: виджет ставится на сайт бесплатно по коду, а сообщения посетителей приходят прямо в приложение, где уже открыты остальные рабочие мессенджеры.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Подключение за 4 шага</h2>
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
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Что умеет виджет</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FEATURES.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Подключите чат к своему сайту</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>«Чат для сайта» — Pro-функция Centrio, отмеченная как альфа-версия.</p>
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
