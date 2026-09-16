import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialArticle from '@/components/editorial/EditorialArticle';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

const WIN_DOWNLOAD = 'https://download.centrio.me/Centrio%20Setup%202.7.0.exe';

export const metadata: Metadata = {
  title: 'Как перенести мессенджеры и настройки Centrio на новый компьютер',
  description: 'Пошаговая инструкция по переносу мессенджеров, папок, настроек и тем оформления Centrio на новый компьютер через облачную синхронизацию — без повторной настройки каждого сервиса.',
  alternates: { canonical: 'https://centrio.me/blog/transfer-to-new-computer' },
  openGraph: {
    title: 'Перенос Centrio на новый компьютер',
    description: 'Как перенести мессенджеры и настройки Centrio на новый компьютер через облачную синхронизацию.',
    url: 'https://centrio.me/blog/transfer-to-new-computer',
    type: 'article',
    images: [DEFAULT_OG_IMAGE],
  },
};

const STEPS = [
  { n: '1', title: 'Войдите в аккаунт на старом компьютере', text: 'Если вы ещё не входили в облачный аккаунт Centrio, сделайте это перед переносом — настройки и список мессенджеров синхронизируются в облако автоматически после входа.' },
  { n: '2', title: 'Дождитесь синхронизации', text: 'Синхронизация происходит в фоне при каждом изменении — добавлении мессенджера, папки или смене настроек. Обычно занимает несколько секунд при активном интернет-соединении.' },
  { n: '3', title: 'Установите Centrio на новый компьютер', text: 'Скачайте и установите приложение так же, как на первом устройстве — с официального сайта, подписанным установщиком.' },
  { n: '4', title: 'Войдите в тот же аккаунт', text: 'При первом запуске выберите вход в аккаунт и укажите те же учётные данные — список мессенджеров, папок и настроек подтянется автоматически.' },
  { n: '5', title: 'Авторизуйтесь в каждом мессенджере заново', text: 'Список вкладок переносится, но сами сессии (вход в Telegram, WhatsApp и другие сервисы) — нет: по соображениям безопасности каждый сервис нужно авторизовать на новом устройстве отдельно, как при первой установке.' },
];

const WHAT_SYNCS = [
  { title: 'Синхронизируется', items: ['Список подключённых мессенджеров и их порядок', 'Папки и рабочие пространства (Pro)', 'Тема оформления и акцентный цвет', 'Настройки уведомлений и звука', 'Настройки VPN (без пароля — он хранится только локально)'] },
  { title: 'Не синхронизируется', items: ['Сами сессии входа в мессенджеры — их нужно авторизовать заново', 'История переписки — она хранится на стороне самого мессенджера, а не в Centrio', 'Пароль VPN-прокси — по соображениям безопасности остаётся только на устройстве, где был введён'] },
];

const FAQ = [
  { q: 'Нужна ли Pro-подписка для синхронизации между устройствами?', a: 'Базовая синхронизация мессенджеров и настроек доступна на бесплатном тарифе. Папки и рабочие пространства синхронизируются, только если сама функция доступна по тарифу.' },
  { q: 'Что делать, если после переноса список мессенджеров не появился?', a: 'Проверьте, что вход выполнен именно в тот же облачный аккаунт, что и на старом устройстве, и что на старом компьютере данные успели синхронизироваться (было активное интернет-соединение при последнем изменении списка).' },
  { q: 'Можно ли пользоваться Centrio на двух компьютерах одновременно?', a: 'Да, ограничения на число одновременно работающих устройств нет — изменения на одном синхронизируются на остальные при следующем подключении к интернету.' },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
    { '@type': 'ListItem', position: 3, name: 'Перенос Centrio на новый компьютер', item: 'https://centrio.me/blog/transfer-to-new-computer' },
  ],
};

const BLOG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: 'Как перенести мессенджеры и настройки Centrio на новый компьютер',
  description: 'Пошаговая инструкция по переносу мессенджеров, папок и настроек Centrio на новый компьютер через облачную синхронизацию.',
  image: 'https://centrio.me/api/og',
  datePublished: '2026-09-15',
  dateModified: '2026-09-15',
  author: { '@type': 'Organization', name: 'Centrio' },
  publisher: { '@type': 'Organization', name: 'Centrio', logo: { '@type': 'ImageObject', url: 'https://centrio.me/logo.png' } },
  mainEntityOfPage: { '@type': 'WebPage', '@id': 'https://centrio.me/blog/transfer-to-new-computer' },
};

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

const HOWTO_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'Как перенести Centrio на новый компьютер',
  step: STEPS.map((s) => ({ '@type': 'HowToStep', name: s.title, text: s.text })),
};

export default function TransferToNewComputerPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(HOWTO_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BLOG_JSONLD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialArticle lang="ru" hero={<>
          <div style={{ display: 'inline-block', background: 'rgba(74,222,128,0.15)', color: '#4ade80', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Инструкция
          </div>
          <h1 style={{ fontSize: 'clamp(26px,4.5vw,46px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Перенос Centrio{' '}
            <span style={{ background: 'linear-gradient(90deg,#4ade80,#22d3ee)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>на новый компьютер</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 640, margin: '0 auto 16px' }}>
            Пять шагов, чтобы получить весь список мессенджеров, папок и настроек на новом устройстве — без повторной настройки каждого сервиса с нуля.
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Обновлено: сентябрь 2026 · Время чтения: ~4 мин</p>
        </>} contents={[
          { id: 'section-1', title: <>Перенос за 5 шагов</> },
          { id: 'section-2', title: <>Что переносится, а что нет</> },
          { id: 'section-3', title: <>Частые вопросы</> },
        ]}>
          <section style={{ marginBottom: 56 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 15.5, lineHeight: 1.8 }}>
              При покупке нового компьютера или переустановке системы не обязательно настраивать список мессенджеров, папок и внешний вид Centrio заново — облачная синхронизация переносит всё это автоматически при входе в тот же аккаунт. Разбираем, что именно переносится, а что по соображениям безопасности нужно будет ввести заново.
            </p>
          </section>

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-1" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Перенос за 5 шагов</h2>
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

          <section style={{ marginBottom: 56 }}>
            <h2 id="section-2" style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, color: '#e2e8f0' }}>Что переносится, а что нет</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {WHAT_SYNCS.map((group) => (
                <div key={group.title} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '20px 22px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10, color: '#e2e8f0' }}>{group.title}</h3>
                  <ul style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14.5, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
                    {group.items.map((it) => <li key={it}>{it}</li>)}
                  </ul>
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

          <section style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Настройте синхронизацию заранее</h2>
            <p style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 28 }}>Войдите в облачный аккаунт Centrio, чтобы перенос на новое устройство занял пять минут.</p>
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
