import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import EditorialIndex from '@/components/editorial/EditorialIndex';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Блог Centrio — гиды, сравнения и советы про мессенджеры',
  description: 'Статьи о том, как объединить мессенджеры в одном окне, сравнения Centrio с Rambox, Franz, Wavebox и Ferdium, гид по встроенному VPN и советы по продуктивности.',
  alternates: { canonical: 'https://centrio.me/blog' },
  openGraph: {
    title: 'Блог Centrio',
    description: 'Гиды, сравнения и советы про мессенджеры и Centrio.',
    url: 'https://centrio.me/blog',
    type: 'website',
    images: [DEFAULT_OG_IMAGE],
  },
};

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Блог', item: 'https://centrio.me/blog' },
  ],
};

const POSTS = [
  { slug: 'who-needs-it', tag: 'Гид', color: '#7dd3fc', title: 'Кому нужна программа для мессенджеров в одном окне: 7 сценариев', desc: 'Фрилансеры, SMM, поддержка, удалённые команды — разбираем 7 реальных случаев, где агрегатор мессенджеров экономит часы каждую неделю.' },
  { slug: 'how-to-combine-messengers', tag: 'Инструкция', color: '#4ade80', title: 'Как объединить Telegram, WhatsApp и VK в одном приложении', desc: 'Пошаговая инструкция на 5 шагов для Windows, macOS и Linux.' },
  { slug: 'vs-ferdium', tag: 'Сравнение', color: '#98baff', title: 'Centrio vs Ferdium: сравнение агрегаторов мессенджеров 2026', desc: 'Открытый форк Franz против Centrio с VPN и поддержкой VK «из коробки».' },
  { slug: 'messenger-vpn-guide', tag: 'Гид', color: '#d8b4fe', title: 'Зачем нужен VPN для мессенджеров и как настроить его в Centrio', desc: 'Протоколы VLESS, VMess, Trojan, Shadowsocks, Hysteria2 и встроенный VPN Centrio без отдельных приложений.' },
  { slug: 'stop-switching-tabs', tag: 'Продуктивность', color: '#fdba74', title: 'Как перестать переключаться между вкладками мессенджеров', desc: 'Реальная цена переключения контекста и как собрать все мессенджеры в одном окне.' },
  { slug: 'is-it-safe', tag: 'Безопасность', color: '#67e8f9', title: 'Безопасно ли использовать агрегаторы мессенджеров вроде Centrio?', desc: 'Как устроена изоляция сессий, подписанный установщик и чек-лист при выборе агрегатора.' },
  { slug: 'remote-team-messengers', tag: 'Удалённая работа', color: '#6ee7b7', title: 'Мессенджеры для удалённой команды: как свести всё в одно окно', desc: 'Slack, Telegram, Notion, Zoom в одном приложении по папкам, без потери сообщений между проектами.' },
  { slug: 'vs-rambox', tag: 'Сравнение', color: '#98baff', title: 'Centrio vs Rambox: подробное сравнение 2026', desc: 'Что выбрать между Rambox и Centrio — функции, цены, поддержка русского языка.' },
  { slug: 'vs-franz', tag: 'Сравнение', color: '#98baff', title: 'Centrio vs Franz: что лучше в 2026 году', desc: 'Сравниваем Centrio с одним из первых агрегаторов мессенджеров — Franz.' },
  { slug: 'vs-wavebox', tag: 'Сравнение', color: '#98baff', title: 'Centrio vs Wavebox: сравнение для команд и бизнеса', desc: 'Wavebox против Centrio — что выбрать для рабочих и личных мессенджеров.' },
  { slug: 'top-apps', tag: 'Статистика', color: '#facc15', title: 'Топ-10 приложений в Centrio — сентябрь 2026', desc: 'Реальная статистика: какие мессенджеры и сервисы пользователи Centrio добавляют чаще всего.' },
  { slug: 'multiple-accounts', tag: 'Инструкция', color: '#4ade80', title: 'Несколько аккаунтов WhatsApp и Telegram на одном компьютере', desc: 'Как открыть 2, 3 и больше аккаунтов WhatsApp и Telegram одновременно — без телефона-эмулятора и сброса сессий.' },
  { slug: 'telegram-vpn-block', tag: 'VPN', color: '#d8b4fe', title: 'Telegram не работает даже с VPN: почему и что реально помогает в 2026', desc: 'Почему обычный VPN не спасает от блокировок Telegram и какие протоколы реально работают.' },
  { slug: 'best-messenger-aggregators', tag: 'Подборка', color: '#f472b6', title: 'Лучшие агрегаторы мессенджеров в 2026 году: топ-7', desc: 'Centrio, Rambox, Franz, Ferdium, Wavebox, Station, Shift — сравнение в одной таблице.' },
  { slug: 'all-social-media-one-place', tag: 'Гид', color: '#7dd3fc', title: 'Как собрать ВКонтакте, Telegram, Instagram и другие соцсети в одном месте', desc: 'Рабочий способ для SMM-менеджеров и владельцев нескольких аккаунтов держать все соцсети в одном окне.' },
  { slug: 'max-transition', tag: 'Гид', color: '#5eead4', title: 'MAX и Telegram/WhatsApp одновременно: как не потерять контакты в 2026', desc: 'Как пользоваться MAX вместе с Telegram и WhatsApp в одном окне, не переустанавливая приложения и не теряя старые чаты.' },
  { slug: 'whatsapp-telegram-ban-risk', tag: 'Безопасность', color: '#67e8f9', title: 'Забанят ли WhatsApp или Telegram за использование в Centrio? Разбираем риски', desc: 'Что реально приводит к бану мессенджеров и почему официальные веб-версии в отдельном окне не входят в зону риска.' },
  { slug: 'vs-station', tag: 'Сравнение', color: '#98baff', title: 'Station больше не работает? Лучшая альтернатива в 2026 — сравнение с Centrio', desc: 'Station закрыт разработчиком в 2023 году. Сравниваем с активно поддерживаемым Centrio.' },
  { slug: 'vs-shift', tag: 'Сравнение', color: '#98baff', title: 'Centrio vs Shift: сравнение агрегаторов мессенджеров 2026', desc: 'Shift против Centrio — цена, лимиты бесплатной версии, VPN и поддержка российских сервисов.' },
  { slug: 'ai-assistant-guide', tag: 'Гид', color: '#98baff', title: 'AI-ассистент в Centrio: как настроить и что он умеет', desc: 'Три режима подключения — свой ключ, локальная модель или готовая нейросеть Pro — и что реально удобно спрашивать, не выходя из мессенджеров.' },
  { slug: 'notes-plugin-guide', tag: 'Гид', color: '#facc15', title: 'Заметки и списки покупок в Centrio: гид по новому плагину', desc: 'Обычные заметки и чек-листы, цветовые метки, архив и синхронизация между устройствами — прямо в панели рядом с мессенджерами.' },
  { slug: 'pin-lock-guide', tag: 'Безопасность', color: '#67e8f9', title: 'Как поставить PIN-код на мессенджеры в Centrio', desc: 'Блокировка при сворачивании окна и автоблокировка при бездействии — вся переписка под одним коротким кодом.' },
  { slug: 'what-is-messenger-aggregator', tag: 'Основы', color: '#7dd3fc', title: 'Что такое агрегатор мессенджеров и зачем он нужен', desc: 'Разбираем, что такое агрегатор мессенджеров, как он устроен изнутри и чем реально отличается от простого набора вкладок браузера.' },
  { slug: 'best-aggregator-windows', tag: 'Гид', color: '#60a5fa', title: 'Лучший агрегатор мессенджеров для Windows в 2026 году', desc: 'Как выбрать агрегатор мессенджеров под Windows, системные требования и пошаговая установка за пять шагов.' },
  { slug: 'workspaces-folders-guide', tag: 'Гид', color: '#a5b4fc', title: 'Папки и рабочие пространства в Centrio: в чём разница и как настроить', desc: 'Папки группируют вкладки, рабочие пространства переключают весь набор целиком — разбираем разницу и сценарии использования.' },
  { slug: 'split-screen-guide', tag: 'Гид', color: '#818cf8', title: 'Сплит-экран в Centrio: как смотреть несколько мессенджеров одновременно', desc: 'Четыре варианта раскладки экрана и пошаговая настройка, чтобы следить за двумя и больше чатами без переключения вкладок.' },
  { slug: 'adblock-guide', tag: 'Гид', color: '#fca5a5', title: 'Блокировщик рекламы в Centrio: что убирает и как включить', desc: 'Какую рекламу и трекеры блокирует встроенный adblock Centrio и как включить его за три шага.' },
  { slug: 'chat-widget-guide', tag: 'Для бизнеса', color: '#5eead4', title: 'Чат для сайта в Centrio: как подключить виджет за 4 шага', desc: 'Встроенный виджет чата для собственного сайта — сообщения посетителей приходят в то же приложение, что и остальные мессенджеры.' },
  { slug: 'dark-mode-messengers', tag: 'Гид', color: '#c4b5fd', title: 'Тёмная тема для всех мессенджеров сразу в Centrio', desc: 'Как принудительно включить тёмное оформление даже в тех веб-версиях мессенджеров, где своей тёмной темы нет.' },
  { slug: 'notifications-guide', tag: 'Гид', color: '#facc15', title: 'Уведомления в Centrio: полный гид по настройке', desc: 'Четыре уровня контроля уведомлений — от общего бейджа до отключения звука для отдельного мессенджера.' },
  { slug: 'freelancer-aggregator', tag: 'Гид', color: '#7dd3fc', title: 'Агрегатор мессенджеров для фрилансера: как не терять заказы', desc: 'Как фрилансеру свести переписку с заказчиками из разных мессенджеров и бирж в одно окно и не пропускать сообщения.' },
  { slug: 'smm-manager-guide', tag: 'Для бизнеса', color: '#5eead4', title: 'Centrio для SMM-менеджера: как вести несколько соцсетей одновременно', desc: 'Как SMM-менеджеру организовать работу с несколькими аккаунтами и площадками в одном приложении без путаницы.' },
  { slug: 'what-is-max', tag: 'Основы', color: '#7dd3fc', title: 'Что такое MAX и как совмещать его с другими мессенджерами', desc: 'Разбираем национальный мессенджер MAX и то, как пользоваться им вместе с Telegram и WhatsApp в одном окне.' },
  { slug: 'session-isolation-explained', tag: 'Безопасность', color: '#67e8f9', title: 'Как устроена изоляция сессий в Centrio', desc: 'Почему у каждого мессенджера в Centrio отдельная сессия, cookies и кэш — и что это даёт с точки зрения безопасности.' },
  { slug: 'transfer-to-new-computer', tag: 'Инструкция', color: '#4ade80', title: 'Как перенести Centrio на новый компьютер за 5 шагов', desc: 'Пошаговый перенос настроек и мессенджеров на новое устройство — что синхронизируется автоматически, а что нет.' },
  { slug: 'free-vs-pro', tag: 'Сравнение', color: '#98baff', title: 'Бесплатно или Pro в Centrio: что входит в каждый тариф', desc: 'Полный список функций бесплатного тарифа и Pro-подписки — и честный разбор, когда апгрейд реально окупается.' },
  { slug: 'add-custom-service', tag: 'Инструкция', color: '#4ade80', title: 'Как добавить любой сайт в Centrio как отдельный мессенджер', desc: 'Centrio не ограничен списком готовых сервисов — добавляем любой сайт по прямой ссылке за пять шагов.' },
  { slug: 'small-business-messengers', tag: 'Для бизнеса', color: '#5eead4', title: 'Малый бизнес и мессенджеры: как не терять заявки клиентов', desc: 'Почему малый бизнес теряет заявки, разбросанные по WhatsApp, Telegram и Instagram, и как собрать все каналы продаж в одном окне.' },
  { slug: 'russian-services-one-place', tag: 'Гид', color: '#94a3ff', title: 'ВКонтакте, MAX, Яндекс и другие русские сервисы в одном окне', desc: 'Как собрать российские сервисы — ВКонтакте, MAX, Яндекс.Почту — в одном приложении вместо десятка вкладок браузера.' },
];

export default function BlogIndexPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <SiteHeader />
      <EditorialIndex lang="ru" posts={POSTS}>
          <div style={{ display: 'inline-block', background: 'rgba(82,135,255,0.15)', color: '#98baff', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Блог Centrio
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,50px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Гиды, сравнения{' '}
            <span style={{ background: 'linear-gradient(90deg,#74a0ff,#8fbdff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>и советы про мессенджеры</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 620, margin: '0 auto' }}>
            Как объединить мессенджеры, сравнения с Rambox, Franz и Wavebox, гид по встроенному VPN и советы по продуктивности.
          </p>
        
      </EditorialIndex>
      <SiteFooter />
    </>
  );
}
