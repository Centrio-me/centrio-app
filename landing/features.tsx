import type { Metadata } from 'next';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import { DEFAULT_OG_IMAGE } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Возможности Centrio — всё о функциях агрегатора мессенджеров',
  description: 'Все функции Centrio: встроенный VPN, 100+ мессенджеров, облачная синхронизация, умные уведомления, папки, PIN-блокировка и многое другое. Windows, macOS, Linux.',
  alternates: { canonical: 'https://centrio.me/features' },
  openGraph: {
    title: 'Возможности Centrio — агрегатор мессенджеров с VPN',
    description: 'Откройте все функции Centrio: VPN, синхронизация, 100+ сервисов в одном окне.',
    url: 'https://centrio.me/features',
    images: [DEFAULT_OG_IMAGE],
  },
};

const features = [
  {
    icon: '🔒',
    color: '#6366f1',
    title: 'Встроенный VPN',
    sub: 'Протоколы нового поколения',
    desc: 'Поддержка VLESS, VMess, Trojan, Shadowsocks и Hysteria2. �?мпорт конфигов по ссылке или через subscription URL. Автоматическое переключение на резервный сервер. Отображение пинга до каждого сервера в реальном времени.',
    bullets: ['VLESS · VMess · Trojan · SS · Hysteria2', 'Subscription URL (автоимпорт списка)', 'Пинг-замер в реальном времени', 'Автопереключение при смене сервера'],
  },
  {
    icon: '📱',
    color: '#3b82f6',
    title: '100+ сервисов в одном окне',
    sub: 'Всё в одном месте',
    desc: 'Telegram, WhatsApp, Discord, VK, Slack, Notion, Gmail, Instagram, Signal, Viber, WeChat, LINE, Zoom, Jira, Figma, LinkedIn, Twitch и более 100 других сервисов. Добавьте любой сайт как отдельную вкладку.',
    bullets: ['Мессенджеры, почта, проектники', 'VK, Одноклассники, Яндекс', 'Произвольный URL как вкладка', 'Все сервисы в одном окне'],
  },
  {
    icon: '�?�️',
    color: '#06b6d4',
    title: 'Облачная синхронизация',
    sub: 'Pro-функция',
    desc: 'Все настройки, мессенджеры и папки синхронизируются между устройствами через защищённое облако. Установили на новый компьютер — всё восстановилось автоматически за несколько секунд.',
    bullets: ['Синхронизация настроек', 'Синхронизация мессенджеров', 'Синхронизация папок', 'Работает на Windows, macOS, Linux'],
  },
  {
    icon: '🔔',
    color: '#f59e0b',
    title: 'Умные уведомления',
    sub: 'Тонкая настройка',
    desc: 'Настройте уведомления отдельно для каждого мессенджера: звук, вибрация, бейдж. Глобальный режим «Не беспокоить». Все уведомления отображаются в единой панели — никаких пропущенных сообщений.',
    bullets: ['Настройка на каждый сервис', 'Единая панель уведомлений', 'Режим «Не беспокоить»', 'Звук и бейдж отдельно'],
  },
  {
    icon: '📁',
    color: '#22c55e',
    title: 'Папки',
    sub: 'Pro-функция',
    desc: 'Группируйте сервисы в папки: «Работа», «Личное», «Новости». Сворачивайте и разворачивайте папки в сайдбаре. Перетаскивайте мессенджеры между папками. Папки тоже синхронизируются через облако.',
    bullets: ['Произвольные папки', 'Перетаскивание сервисов', 'Синхронизация через облако', 'Быстрый доступ к группам'],
  },
  {
    icon: '🔑',
    color: '#a855f7',
    title: 'PIN-блокировка',
    sub: 'Безопасность',
    desc: 'Установите PIN-код для защиты приложения. Включите автоблокировку при запуске или при сворачивании. PIN синхронизируется между устройствами. Никто не получит доступ к вашим мессенджерам без PIN.',
    bullets: ['4-значный PIN', 'Автоблокировка при запуске', 'Автоблокировка при сворачивании', 'Синхронизация PIN через облако'],
  },
  {
    icon: '🌐',
    color: '#ec4899',
    title: '5 языков интерфейса',
    sub: 'Мультиязычность',
    desc: 'Русский, English, 中文, Français, Italiano. Переключение языка в один клик — без перезапуска приложения. Сайт centrio.me тоже доступен на всех пяти языках.',
    bullets: ['Русский, English, 中文, Français, Italiano', 'Переключение без перезапуска', 'Сайт на всех языках', 'Правильные локали и форматы'],
  },
  {
    icon: '⌨️',
    color: '#f97316',
    title: 'Горячие клавиши',
    sub: 'Быстрый доступ',
    desc: 'Переключайтесь между мессенджерами с клавиатуры. Ctrl+, открывает настройки. Ctrl+1–9 переключает вкладки. Глобальные горячие клавиши работают даже когда окно свёрнуто.',
    bullets: ['Ctrl+1–9 — переключение вкладок', 'Ctrl+, — открыть настройки', 'Глобальные хоткеи', 'Работают в фоне'],
  },
  {
    icon: '🔄',
    color: '#14b8a6',
    title: 'Автообновление',
    sub: 'Всегда актуальная версия',
    desc: 'Новые версии Centrio устанавливаются автоматически в фоновом режиме. Обновление без перебоев в работе: скачивается тихо, применяется при следующем запуске. Всегда актуальная версия без лишних действий.',
    bullets: ['Фоновое скачивание', 'Применение при перезапуске', 'Уведомление о новой версии', 'Не мешает работе'],
  },
  {
    icon: '🖥️',
    color: '#6366f1',
    title: 'Windows · macOS · Linux',
    sub: 'Все платформы',
    desc: 'Windows 10/11 (x64), macOS 12 Monterey+ (Intel и Apple Silicon), Ubuntu/Debian/Arch Linux. Установщики: .exe (NSIS), .dmg, .AppImage и .deb пакет. Одинаковый интерфейс на всех платформах.',
    bullets: ['Windows 10/11 x64', 'macOS Intel + Apple Silicon', 'AppImage · .deb · Arch', 'Единый аккаунт на всех ОС'],
  },
  {
    icon: '💳',
    color: '#3b82f6',
    title: 'Удобная оплата',
    sub: 'Для России и мира',
    desc: 'Карты РФ, СБП и ЮMoney через ЮКассу. Криптовалюта: BTC, ETH, USDT, TON и 300+ монет через NOWPayments. Автопродление подписки. Возврат средств в течение 7 дней.',
    bullets: ['ЮКасса (карты, СБП, ЮMoney)', 'Крипта: 300+ монет', 'Автопродление', 'Возврат за 7 дней'],
  },
  {
    icon: '📊',
    color: '#f472b6',
    title: 'Статистика использования',
    sub: 'Личный кабинет',
    desc: 'Личный кабинет показывает: время в приложении по дням, топ-5 используемых сервисов, количество уведомлений. Управление устройствами — отзывайте сессии с других устройств.',
    bullets: ['Время по дням (график)', 'Топ-5 сервисов', 'Управление устройствами', '�?стория платежей'],
  },
];

const BREADCRUMB_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: 'https://centrio.me/' },
    { '@type': 'ListItem', position: 2, name: 'Возможности', item: 'https://centrio.me/features' },
  ],
};

export default function FeaturesPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSONLD) }} />
      <style>{`
        .feature-card { transition: transform .2s, border-color .2s, box-shadow .2s; }
        .feature-card:hover { transform: translateY(-3px); }
        .feat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
        @media (max-width: 400px) {
          .feat-grid { grid-template-columns: 1fr; }
          .feature-card { padding: 22px 18px !important; }
        }
      `}</style>
      <SiteHeader />
      <div style={{ minHeight: '100vh', background: '#080810', color: '#fff', fontFamily: "'Inter', sans-serif" }}>
        <section style={{ maxWidth: 900, margin: '0 auto', padding: '60px 24px 48px', textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 500, marginBottom: 20 }}>
            Возможности · v2.5.2
          </div>
          <h1 style={{ fontSize: 'clamp(28px,5vw,52px)', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 20px' }}>
            Всё, что умеет{' '}
            <span style={{ background: 'linear-gradient(90deg,#818cf8,#c084fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Centrio</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 17, lineHeight: 1.7, maxWidth: 600, margin: '0 auto' }}>
            Агрегатор мессенджеров с встроенным VPN, облачной синхронизацией и поддержкой 100+ сервисов на Windows, macOS и Linux.
          </p>
        </section>

        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px 80px' }}>
          <div className="feat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {features.map((f) => (
              <div key={f.title} className="feature-card" style={{
                background: 'rgba(255,255,255,0.03)',
                border: `1px solid ${f.color}22`,
                borderRadius: 20,
                padding: '28px 26px',
              }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: `${f.color}18`, border: `1px solid ${f.color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                    {f.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>{f.title}</div>
                    <div style={{ fontSize: 11.5, color: f.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em' }}>{f.sub}</div>
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13.5, lineHeight: 1.75, marginBottom: 18 }}>{f.desc}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {f.bullets.map(b => (
                    <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'rgba(255,255,255,0.55)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                        <path d="M20 6L9 17L4 12" stroke={f.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>Готовы попробовать?</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', marginBottom: 28, fontSize: 16 }}>5 сервисов навсегда бесплатно. Без карты.</p>
            <a href="https://download.centrio.me/Centrio%20Setup%202.5.2.exe"
              style={{ display: 'inline-block', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', borderRadius: 14, padding: '15px 40px', textDecoration: 'none', fontWeight: 700, fontSize: 16, boxShadow: '0 4px 24px rgba(99,102,241,0.4)' }}>
              ⬇ Скачать Centrio бесплатно
            </a>
            <p style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, marginTop: 12 }}>v2.5.2 · Windows · macOS · Linux</p>
          </div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
