import type { Metadata } from 'next';
import Link from 'next/link';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Заметки и списки покупок в Centrio: гид по новому плагину',
  description: 'Как пользоваться плагином «Заметки» в Centrio: обычные заметки и чек-листы, цветовые метки, закрепление, архив и синхронизация между устройствами. Пошаговый гид.',
  alternates: { canonical: 'https://centrio.me/blog/notes-plugin-guide' },
  openGraph: {
    title: 'Заметки и списки покупок в Centrio',
    description: 'Новый плагин Centrio: заметки и чек-листы прямо рядом с мессенджерами, с синхронизацией между устройствами.',
    url: 'https://centrio.me/blog/notes-plugin-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const FEATURES = [
  { icon: '📝', title: 'Два формата', text: 'Обычная текстовая заметка или чек-лист (список покупок, чек-лист задач) — переключаетесь между ними одной кнопкой при создании, каждый формат подстраивается под свой сценарий.' },
  { icon: '🎨', title: 'Цветовые метки', text: 'Пять цветов для визуальной сортировки заметок по темам или срочности — цвет виден сразу в списке, не нужно открывать заметку, чтобы понять, к чему она относится.' },
  { icon: '📌', title: 'Закрепление и архив', text: 'Важные заметки закрепляются наверху списка, а то, что пока не актуально — уходит в архив одним нажатием, не засоряя основной список, но и не теряясь безвозвратно.' },
  { icon: '☁️', title: 'Синхронизация между устройствами', text: 'Заметка, созданная на рабочем компьютере, открывается на домашнем — правки сохраняются на сервер автоматически, без ручного экспорта или пересылки себе в мессенджер.' },
];

const FAQ = [
  { q: 'Заметки — это бесплатная функция?', a: 'Плагин «Заметки» доступен на плане Pro или Team — он включается в разделе Настройки → Расширения и синхронизируется через облако Centrio между вашими устройствами.' },
  { q: 'Можно ли делать чек-лист покупок с отметками?', a: 'Да — при создании выберите тип «Список покупок», добавляйте пункты и отмечайте их галочкой по мере покупки. Счётчик «куплено/всего» виден прямо в превью списка заметок.' },
  { q: 'Что случится с заметками, если отключить плагин?', a: 'Заметки не удаляются — они остаются сохранёнными в облаке и снова становятся доступны, если включить плагин обратно в Настройках.' },
  { q: 'Автосохранение точно работает, или можно случайно потерять текст?', a: 'Изменения сохраняются автоматически примерно через полсекунды после паузы в наборе текста — индикатор «Сохранение…/Сохранено» в редакторе заметки показывает статус. При желании можно нажать кнопку «Сохранить», чтобы зафиксировать изменения сразу, не дожидаясь автосохранения.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Заметки и списки покупок в Centrio', item: 'https://centrio.me/blog/notes-plugin-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Заметки и списки покупок в Centrio: гид по новому плагину',
  description: 'Как пользоваться плагином «Заметки» в Centrio: обычные заметки и чек-листы, цветовые метки, закрепление, архив и синхронизация между устройствами.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-08',
  dateModified: '2026-09-08',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: {
    '@type': 'Organization',
    name: 'Centrio',
    logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' },
  },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/notes-plugin-guide' },
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

export default function NotesPluginGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 860, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(250,204,21,0.15)', color: '#facc15', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Сентябрь 2026
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Заметки и списки покупок{' '}
            <span style={{ background: 'linear-gradient(90deg,#facc15,#fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>прямо в Centrio</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto 16px' }}>
            Не нужно открывать отдельное приложение для заметок — блокнот и списки покупок теперь живут в той же панели, что и мессенджеры.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Опубликовано: сентябрь 2026 · Время чтения: ~4 мин</p>
        </section>

        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 24px 80px' }}>
          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, color: '#e2e8f0' }}>Зачем заметки внутри агрегатора мессенджеров</h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15.5, lineHeight: 1.8 }}>
              Список покупок в заметках телефона, рабочие мысли в стикерах на столе, важная ссылка — «отправлю сам себе в Telegram». Мелкие заметки обычно разбросаны по десятку мест. Плагин «Заметки» в Centrio решает это просто: заметки открываются той же кнопкой в правой панели, что и мессенджеры — не нужно искать отдельное приложение или чат с самим собой.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Что внутри</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {FEATURES.map((f) => (
                <div key={f.title} style={{ display: 'flex', gap: 18, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '22px 24px' }}>
                  <div style={{ fontSize: 28, flexShrink: 0 }}>{f.icon}</div>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{f.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{f.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20, color: '#e2e8f0' }}>Как включить</h2>
            <div style={{ background: 'linear-gradient(135deg,rgba(250,204,21,0.08),rgba(251,146,60,0.08))', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 20, padding: '28px 32px' }}>
              <ol style={{ margin: 0, paddingLeft: 20, color: 'rgba(255,255,255,0.65)', fontSize: 15, lineHeight: 2 }}>
                <li>Настройки → Расширения → включите переключатель «Заметки»</li>
                <li>В правой панели появится новая кнопка-иконка заметки</li>
                <li>Нажмите «+» — выберите обычную заметку или список покупок</li>
                <li>Пишите — сохранение произойдёт автоматически</li>
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
              <Link href="/blog/ai-assistant-guide" style={{ color: '#facc15', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(250,204,21,0.25)', borderRadius: 10, padding: '8px 16px' }}>AI-ассистент в Centrio →</Link>
              <Link href="/blog/pin-lock-guide" style={{ color: '#facc15', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(250,204,21,0.25)', borderRadius: 10, padding: '8px 16px' }}>PIN-код на мессенджеры →</Link>
              <Link href="/blog/stop-switching-tabs" style={{ color: '#facc15', fontSize: 14.5, textDecoration: 'none', border: '1px solid rgba(250,204,21,0.25)', borderRadius: 10, padding: '8px 16px' }}>Как перестать переключаться между вкладками →</Link>
            </div>
          </section>

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Попробуйте Centrio с заметками</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Плагин «Заметки» доступен на плане Pro — с синхронизацией между устройствами.</p>
            <a href={WIN_DOWNLOAD} style={{ display: 'inline-block', background: 'linear-gradient(135deg,#0ea5e9,#6366f1)', color: '#fff', borderRadius: 12, padding: '14px 36px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 20px rgba(14,165,233,0.4)' }}>
              ⬇ Скачать Centrio для Windows
            </a>
            <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, marginTop: 12 }}>
              Версия 2.7.0 · Бесплатно · <Link href="/download/macos" style={{ color: 'inherit' }}>macOS</Link> · <Link href="/download/linux" style={{ color: 'inherit' }}>Linux</Link> · <Link href="/pricing" style={{ color: 'inherit' }}>Тарифы Pro</Link>
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
