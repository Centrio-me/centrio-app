import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

// 2026-08-13: new article targeting the MAX-transition keyword cluster
// (Минцифры mandate pushing RU users from WhatsApp toward the domestic MAX
// messenger, effective since Jan 1 2026 — see SEO keyword-strategist agent
// findings from this date's session). Angle deliberately avoids the
// saturated "news about the mandate" space and instead targets the
// underserved "how do I actually run MAX alongside Telegram/WhatsApp
// without losing contacts" software-solution query, which Centrio already
// technically supports (max.ru/join/ deep-link handling confirmed live in
// webview-preload.js / renderer/messengers.js before this article was written).
const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.5.2.exe';

export const metadata: Metadata = {
  title: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты в 2026',
  description: 'Как пользоваться MAX вместе с Telegram и WhatsApp в одном окне, не переустанавливая приложения и не теряя старые чаты — пошаговая инструкция и разбор перехода на MAX в 2026 году.',
  alternates: { canonical: 'https://centrio.me/blog/max-transition' },
  openGraph: {
    title: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты',
    description: 'Как совместить MAX, Telegram и WhatsApp в одном окне без переустановки и потери чатов.',
    url: 'https://centrio.me/blog/max-transition',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const WHY = [
  {
    title: 'Контакты появляются в MAX раньше, чем вы туда переходите',
    text: 'MAX предустанавливается на новые смартфоны, продаваемые в России, и всё чаще становится основным каналом у госорганов, банков, школ и части бизнеса. Даже если вы сами не спешите переходить, часть переписки перемещается туда без вашего решения — просто потому, что собеседник пишет туда первым.',
  },
  {
    title: 'WhatsApp никуда резко не исчезает, но становится вторым каналом',
    text: 'Официальных технических блокировок WhatsApp как сервиса на момент написания нет, но ряд организаций и госструктур переносит рабочее общение именно в MAX. Держать оба мессенджера параллельно на переходный период — практичнее, чем гадать, куда переехать окончательно.',
  },
  {
    title: 'Ручное переключение между тремя приложениями — источник пропущенных сообщений',
    text: 'MAX, Telegram и WhatsApp — три разных приложения с тремя разными окнами, тремя наборами уведомлений и тремя местами, куда можно случайно не заглянуть вовремя. Именно на этом этапе перехода чаще всего теряются важные сообщения.',
  },
];

const STEPS = [
  { n: 1, title: 'Установите Centrio', text: 'Один установщик — MAX, Telegram и WhatsApp открываются как отдельные вкладки внутри одного окна, а не три отдельных приложения в трее.' },
  { n: 2, title: 'Добавьте вкладку MAX', text: 'В боковой панели нажмите «Добавить сервис» → MAX. Войдите один раз через веб-версию — сессия сохраняется между запусками Centrio, повторно логиниться не нужно.' },
  { n: 3, title: 'Добавьте Telegram и WhatsApp тем же способом', text: 'Каждый мессенджер работает в собственной изолированной сессии (партиции) — вход в один аккаунт никак не пересекается с другими, включая куки и уведомления.' },
  { n: 4, title: 'Кликайте ссылки-приглашения — они сами найдут нужную вкладку', text: 'Если кто-то присылает вам ссылку-приглашение MAX (max.ru/join/…) или Telegram (t.me/…, tg://resolve…) в любом другом мессенджере внутри Centrio, клик по ней переключает на уже открытую вкладку нужного сервиса и сразу открывает приглашение — без перехода во внешний браузер и повторного входа.' },
  { n: 5, title: 'Настройте уведомления по важности', text: 'В настройках каждой вкладки можно включить/выключить звук и всплывающие оповещения отдельно — например, сделать MAX приоритетным на время переходного периода, если туда переехали рабочие или официальные чаты.' },
];

const COMPARE = [
  { label: 'Статус в РФ', max: 'Национальный мессенджер, предустановка на новые устройства', tg: 'Доступен, отдельные функции ограничивались в разное время', wa: 'Доступен, часть организаций переносит общение в MAX' },
  { label: 'Кто чаще требует переход', max: '—', tg: 'Личное общение, сообщества, каналы', wa: 'Госорганы, банки, школы, часть бизнеса — постепенно' },
  { label: 'Работает в Centrio', max: 'Да, включая диплинки max.ru/join/…', tg: 'Да, включая диплинки t.me и tg://resolve…', wa: 'Да, полная веб-версия' },
];

const FAQ = [
  { q: 'Нужно ли удалять WhatsApp или Telegram, если поставить MAX?', a: 'Нет. Все три мессенджера могут работать параллельно сколько угодно долго — ни один из них технически не требует удаления других. В Centrio они открываются как отдельные вкладки одновременно.' },
  { q: 'Потеряются ли старые чаты при переходе на MAX?', a: 'Переход на MAX не переносит и не удаляет историю в Telegram или WhatsApp — это независимые сервисы со своими серверами. История в каждом мессенджере остаётся там, где была, пока вы сами не удалите аккаунт.' },
  { q: 'Работают ли ссылки-приглашения MAX (max.ru/join/…), если кликнуть по ним в Telegram или WhatsApp?', a: 'Да, если вкладка MAX уже открыта в Centrio — клик по такой ссылке в любом другом мессенджере внутри приложения переключит на вкладку MAX и сразу откроет приглашение. Если вкладки MAX нет, ссылка откроется во внешнем браузере, как обычно.' },
  { q: 'Можно ли пользоваться MAX через браузер, а Telegram и WhatsApp — через Centrio?', a: 'Можно, но неудобно — тогда уведомления и переключение между чатами снова разбиваются на два разных места. Смысл держать все три сервиса в одном приложении именно в том, чтобы не терять контекст между ними.' },
  { q: 'Обязателен ли переход на MAX по закону для физических лиц?', a: 'Это не юридическая консультация — уточняйте актуальные требования самостоятельно. Известно, что MAX предустанавливается на новые смартфоны и что ряд организаций и госструктур переходит на него как на основной канал связи; требований к физлицам удалять другие мессенджеры на момент написания нет.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты в 2026', item: 'https://centrio.me/blog/max-transition' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты в 2026',
  description: 'Как пользоваться MAX вместе с Telegram и WhatsApp в одном окне, не переустанавливая приложения и не теряя старые чаты — пошаговая инструкция и разбор перехода на MAX в 2026 году.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-08-01',
  dateModified: '2026-08-01',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/max-transition' },
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

export default function MaxTransitionPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(94,234,212,0.15)', color: '#5eead4', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            MAX · 2026
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,44px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            MAX и Telegram/WhatsApp одновременно:{' '}
            <span style={{ background: 'linear-gradient(90deg,#5eead4,#818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>как не потерять контакты</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 660, margin: '0 auto 16px' }}>
            Часть контактов уже пишет в MAX, часть всё ещё в Telegram и WhatsApp. Разбираем, как держать все три мессенджера в одном окне на время перехода — без переустановки и без риска пропустить сообщение.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: август 2026 · Время чтения: ~6 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Почему это стало вопросом прямо сейчас</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHY.map((p) => (
                <div key={p.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{p.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{p.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>MAX, Telegram, WhatsApp — коротко</h2>
            <div style={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    <th style={{ textAlign: 'left', padding: '14px 16px', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}></th>
                    <th style={{ textAlign: 'left', padding: '14px 16px', color: '#5eead4', fontWeight: 700 }}>MAX</th>
                    <th style={{ textAlign: 'left', padding: '14px 16px', color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>Telegram</th>
                    <th style={{ textAlign: 'left', padding: '14px 16px', color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>WhatsApp</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row, i) => (
                    <tr key={row.label} style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.85)', fontWeight: 600 }}>{row.label}</td>
                      <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)' }}>{row.max}</td>
                      <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)' }}>{row.tg}</td>
                      <td style={{ padding: '14px 16px', color: 'rgba(255,255,255,0.6)' }}>{row.wa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12.5, marginTop: 10 }}>Не юридическая консультация — статус и требования могут меняться, уточняйте актуальные официальные источники.</p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Как открыть MAX рядом с Telegram и WhatsApp за 5 шагов</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS.map((s) => (
                <div key={s.n} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 10, background: 'rgba(94,234,212,0.15)', color: '#5eead4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
                    {s.n}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>{s.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{s.text}</p>
                  </div>
                </div>
              ))}
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
              <Link href="/blog/multiple-accounts" style={{ color: '#5eead4', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(94,234,212,0.25)', borderRadius: 10, padding: '8px 16px' }}>Несколько аккаунтов WhatsApp/Telegram →</Link>
              <Link href="/blog/how-to-combine-messengers" style={{ color: '#5eead4', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(94,234,212,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как объединить мессенджеры →</Link>
              <Link href="/blog/is-it-safe" style={{ color: '#5eead4', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(94,234,212,0.25)', borderRadius: 10, padding: '8px 16px' }}>Безопасно ли это? →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>MAX, Telegram и WhatsApp — в одном окне</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Не теряйте сообщения на переходный период — держите все мессенджеры под рукой одновременно.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#5eead4,#818cf8)', color: '#06060f', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(94,234,212,0.35)' }}>
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
