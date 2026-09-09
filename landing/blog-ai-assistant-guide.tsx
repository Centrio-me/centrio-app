import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.6.0.exe';

export const metadata: Metadata = {
  title: 'AI-ассистент в Centrio: как настроить и что он умеет в 2026',
  description: 'Разбираем встроенного AI-ассистента Centrio: три режима подключения (свой ключ, локальная модель, готовая нейросеть Pro), вызов инструментов внутри мессенджеров и как начать пользоваться за 2 минуты.',
  alternates: { canonical: 'https://centrio.me/blog/ai-assistant-guide' },
  openGraph: {
    title: 'AI-ассистент в Centrio: как настроить и что он умеет',
    description: 'Три способа подключить AI прямо в мессенджеры — от своего API-ключа до готовой нейросети без настройки.',
    url: 'https://centrio.me/blog/ai-assistant-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const MODES = [
  { icon: '🔑', title: 'Свой ключ', text: 'OpenAI, Anthropic, DeepSeek, Google Gemini и другие — вставляете собственный API-ключ в Настройках, платите провайдеру напрямую по факту использования. Полный контроль над моделью и стоимостью, ключ хранится только на вашем устройстве.' },
  { icon: '💻', title: 'Локально', text: 'Модель работает на вашем компьютере через локальный сервер (например, LM Studio или Ollama) — запросы никуда не уходят в интернет. Вариант для тех, кому важна максимальная приватность или кто уже держит локальную нейросеть для других задач.' },
  { icon: '⚡', title: 'Наша нейросеть (Pro)', text: 'Готовая к работе нейросеть Centrio без своих ключей, серверов и установки — включена в подписку Pro. Открываете ассистента и сразу пишете запрос, никаких дополнительных настроек.' },
];

const USE_CASES = [
  { title: 'Сводка непрочитанного', text: 'Не открывая каждый чат по очереди, попросите ассистента кратко пересказать, что нового написали за день — по одному мессенджеру или сразу по нескольким.' },
  { title: 'Черновик ответа', text: 'Скиньте ассистенту суть входящего сообщения — получите готовый вариант ответа на нужном языке и в нужном тоне, останется только отправить или подправить.' },
  { title: 'Перевод переписки', text: 'Разговор на другом языке переводится прямо внутри панели ассистента — не нужно копировать текст в отдельный переводчик и возвращаться обратно.' },
  { title: 'Быстрые вычисления и объяснения', text: 'От пересчёта валют и процентов до объяснения незнакомого термина в присланном сообщении — ассистент открыт в той же панели, что и чаты, переключаться никуда не нужно.' },
];

const FAQ = [
  { q: 'Ассистент видит переписку из всех мессенджеров?', a: 'Ассистент отвечает на то, что вы ему покажете или опишете сами — он не сканирует чаты автоматически в фоне без вашего участия. Это отдельная панель, а не бот внутри каждого мессенджера.' },
  { q: 'Нужен ли Pro, чтобы пользоваться ассистентом?', a: 'Нет — режимы «Свой ключ» и «Локально» доступны на бесплатном плане, нужен только собственный API-ключ или локальный сервер. Готовая нейросеть Centrio без настройки — это уже функция подписки Pro.' },
  { q: 'Куда уходят мои сообщения при использовании своего ключа?', a: 'Напрямую выбранному вами провайдеру (OpenAI, Anthropic и т.д.) по его собственному API — так же, как если бы вы сами обратились к их сервису. Centrio не хранит и не логирует содержимое запросов на своей стороне.' },
  { q: 'Можно ли сменить режим или модель позже?', a: 'Да, в любой момент — раздел «AI-ассистент» в Настройках, переключение между режимами и моделями не требует переустановки или потери истории.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'AI-ассистент в Centrio: как настроить и что он умеет', item: 'https://centrio.me/blog/ai-assistant-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'AI-ассистент в Centrio: как настроить и что он умеет в 2026',
  description: 'Разбираем встроенного AI-ассистента Centrio: три режима подключения, вызов инструментов внутри мессенджеров и как начать пользоваться за 2 минуты.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-08',
  dateModified: '2026-09-08',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/ai-assistant-guide' },
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

export default function AiAssistantGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(129,140,248,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Сентябрь 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            AI-ассистент в Centrio:{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>как настроить и что он умеет</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Один ассистент прямо в панели рядом с мессенджерами — без переключения на отдельный сайт и без копирования переписки туда-обратно.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Опубликовано: сентябрь 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Зачем ассистент внутри агрегатора мессенджеров</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15.5, lineHeight: 1.8 }}>
              Обычный сценарий: пришло длинное сообщение на английском или с кучей деталей — вы копируете текст, открываете вкладку с нейросетью, вставляете, ждёте ответ, копируете обратно. Это отдельное окно, отдельное переключение внимания. Ассистент Centrio живёт в той же правой панели, что и Заметки с Задачами — открывается одной кнопкой прямо поверх активного чата.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Три режима подключения</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {MODES.map((m) => (
                <div key={m.title} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{m.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{m.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Что реально удобно спрашивать</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
              {USE_CASES.map((u) => (
                <div key={u.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{u.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, lineHeight: 1.65, margin: 0 }}>{u.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Как включить за 2 минуты</h2>
            <div style={{ background: 'linear-gradient(135deg,rgba(129,140,248,0.08),rgba(192,132,252,0.08))', border: '1px solid rgba(129,140,248,0.2)', borderRadius: 20, padding: '28px 32px' }}>
              <ol style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 2 }}>
                <li>Откройте Настройки → раздел «AI-ассистент»</li>
                <li>Выберите режим: свой ключ, локально или готовая нейросеть Pro</li>
                <li>Для своего ключа — вставьте API-ключ провайдера и выберите модель</li>
                <li>Нажмите на иконку ассистента в правой панели и задайте первый вопрос</li>
              </ol>
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
              <Link href="/blog/notes-plugin-guide" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Заметки и списки покупок в Centrio →</Link>
              <Link href="/blog/stop-switching-tabs" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как перестать переключаться между вкладками →</Link>
              <Link href="/blog/is-it-safe" style={{ color: '#a5b4fc', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(165,180,252,0.25)', borderRadius: 10, padding: '8px 16px' }}>Безопасно ли использовать Centrio? →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте AI-ассистента бесплатно</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Свой ключ и локальный режим доступны на бесплатном плане — без ограничений по времени.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(14,165,233,0.4)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Версия 2.6.0 · Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link> · <Link href="/pricing" style={{ color: 'inherit' }}>Тарифы Pro</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
