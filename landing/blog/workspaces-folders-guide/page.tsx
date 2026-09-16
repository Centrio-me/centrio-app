import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Папки и рабочие пространства в Centrio: как организовать мессенджеры по проектам',
  description: 'Гид по папкам и плагину «Рабочие пространства» в Centrio: как сгруппировать мессенджеры по клиентам, филиалам или проектам и переключаться между наборами вкладок одним кликом.',
  alternates: { canonical: 'https://centrio.me/blog/workspaces-folders-guide' },
  openGraph: {
    title: 'Папки и рабочие пространства в Centrio',
    description: 'Как организовать десятки мессенджеров по проектам, клиентам или филиалам с помощью папок и пространств.',
    url: 'https://centrio.me/blog/workspaces-folders-guide',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const STEPS_FOLDER = [
  { n: '1', title: 'Создайте папку', text: 'Правой кнопкой по свободному месту в боковой панели → «Новая папка». Дайте название и выберите иконку — например, по клиенту или направлению работы.' },
  { n: '2', title: 'Перетащите мессенджеры внутрь', text: 'Мессенджер можно перетащить мышью в папку или назначить через правый клик → «В папку» → выбрать нужную. Папка сворачивается и разворачивается кликом по заголовку.' },
  { n: '3', title: 'Настройте бейдж непрочитанных', text: 'Свёрнутая папка показывает суммарное число непрочитанных сообщений по всем мессенджерам внутри — не нужно разворачивать каждую, чтобы понять, где есть новые сообщения.' },
];

const STEPS_WORKSPACE = [
  { n: '1', title: 'Включите плагин', text: 'Настройки → Расширения → «Рабочие пространства». Это Pro-функция, отключена по умолчанию — включается одним переключателем.' },
  { n: '2', title: 'Создайте пространство', text: 'В переключателе пространств (иконка сетки в боковой панели) нажмите «Новое пространство», дайте название и выберите иконку.' },
  { n: '3', title: 'Привяжите папки к пространству', text: 'Откройте настройки папки («Переименовать») и выберите пространство из списка внизу — или назначьте прямо мессенджеру через контекстное меню «В пространство», если он не лежит в папке.' },
  { n: '4', title: 'Переключайтесь одним кликом', text: 'Клик по иконке пространства в боковой панели показывает только то, что в него добавлено. Режим «Все» снимает фильтр и возвращает полный список.' },
];

const USE_CASES = [
  { title: 'Агентства и фрилансеры на нескольких клиентах', text: 'Отдельное пространство под каждого клиента — свои мессенджеры, своя папка задач, никакого риска случайно ответить не в тот чат.' },
  { title: 'Франшизы и сети с филиалами', text: 'Пространство на каждый филиал или регион — руководитель переключается между городами, не листая общий список из полусотни вкладок.' },
  { title: 'Разделение личного и рабочего', text: 'Два пространства — «Работа» и «Личное» — с общими уведомлениями (важное сообщение не потеряется), но раздельным отображением в сайдбаре.' },
  { title: 'Сезонные или временные проекты', text: 'Завели пространство под проект, закончили — просто переключились на «Все», ничего не удаляя. Мессенджеры остаются, пространство можно позже удалить или переиспользовать.' },
];

const FAQ = [
  { q: 'Чем папка отличается от рабочего пространства?', a: 'Папка — простой контейнер, группирующий мессенджеры визуально, доступна на бесплатном тарифе. Пространство — Pro-плагин поверх папок: фильтр, который показывает только выбранный набор папок и мессенджеров, а остальное на время скрывает.' },
  { q: 'Пропадут ли уведомления от мессенджеров, которые скрыты в неактивном пространстве?', a: 'Нет. Уведомления и счётчики непрочитанных общие для всех пространств — фильтр пространства влияет только на то, что видно в боковой панели, а не на то, какие сообщения приходят.' },
  { q: 'Можно ли добавить один мессенджер сразу в несколько папок?', a: 'Нет, мессенджер лежит максимум в одной папке — как файл в файловой системе. Но папку можно привязать только к одному пространству, а мессенджер вне папки — назначить напрямую любому пространству.' },
  { q: 'Что происходит с мессенджерами, которые никуда не привязаны?', a: 'Они видны всегда, независимо от того, какое пространство активно — фильтр пространства только добавляет ограничение для того, что явно в него включено, и никогда не прячет непривязанное.' },
  { q: 'Нужна ли Pro-подписка для папок?', a: 'Папки — платная функция на бесплатном тарифе недоступны вовсе, как и рабочие пространства. Оба ограничения снимает Pro.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Папки и рабочие пространства', item: 'https://centrio.me/blog/workspaces-folders-guide' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Папки и рабочие пространства в Centrio: как организовать мессенджеры по проектам',
  description: 'Гид по папкам и плагину «Рабочие пространства» в Centrio — как сгруппировать мессенджеры по клиентам, филиалам или проектам.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/workspaces-folders-guide' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function WorkspacesFoldersGuidePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
        
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Гид · Плагины
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Папки и рабочие пространства:{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>порядок в десятках вкладок</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Когда мессенджеров становится больше десяти, найти нужную вкладку в общем списке — уже отдельная задача. Разбираем, как решают это папки и плагин «Рабочие пространства».
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~6 мин</p>
                </>} contents={[
          { id: 'section-1', title: <>Папки: базовая группировка</> },
          { id: 'section-2', title: <>Рабочие пространства: фильтр поверх папок</> },
          { id: 'section-3', title: <>Где это реально пригождается</> },
          { id: 'section-4', title: <>Частые вопросы</> },
        ]}>


          <section style={{ marginBottom: 48 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8, marginBottom: 16 }}>
              Пять мессенджеров в боковой панели найти легко — они все помещаются на экране. Двадцать пять уже требуют прокрутки, а найти нужный среди похожих иконок занимает несколько секунд каждый раз. У пользователей с десятками подключённых сервисов — агентств, франшиз, служб поддержки — этот сценарий встречается регулярно, и именно для него в Centrio есть два независимых инструмента: папки и рабочие пространства.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              Разница между ними принципиальная. Папка — это контейнер: мессенджер физически «лежит» внутри одной папки, как файл в директории. Пространство — это фильтр поверх папок: оно не хранит мессенджеры, а решает, какие папки и вкладки показать прямо сейчас, а какие временно скрыть.
            </p>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Папки: базовая группировка</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS_FOLDER.map((step) => (
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
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Рабочие пространства: фильтр поверх папок</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {STEPS_WORKSPACE.map((step) => (
                <div key={step.n} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px', display: 'flex', gap: 16 }}>
                  <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'rgba(165,180,252,0.15)', color: '#a5b4fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{step.n}</div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{step.title}</h3>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
            <h2 id="section-3" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Где это реально пригождается</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {USE_CASES.map((item) => (
                <div key={item.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: '#e2e8f0' }}>{item.title}</h3>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.7, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section style={{ marginBottom: 48 }}>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Наведите порядок в своих мессенджерах</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Папки и рабочие пространства доступны на Pro-тарифе Centrio.</p>
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
