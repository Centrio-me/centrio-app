export default function SeoFooter() {
  return (
    <section style={{
      borderTop: '1px solid rgba(255,255,255,0.05)',
      background: 'rgba(255,255,255,0.015)',
      padding: '48px 0 40px',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.35)', marginBottom: 20, letterSpacing: '-.01em' }}>
          О приложении Centrio
        </h2>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', lineHeight: 1.85, columnCount: 2, columnGap: 40, columnRule: '1px solid rgba(255,255,255,0.05)' }}>
          <p style={{ marginBottom: 12 }}>
            <strong style={{ color: 'rgba(255,255,255,0.3)' }}>Centrio</strong> — бесплатное десктопное приложение-агрегатор мессенджеров для Windows, macOS и Linux. Программа позволяет держать Telegram, WhatsApp, Discord, VK, Slack, Notion, Gmail, Instagram, Signal, Viber, WeChat, LINE, Zoom и более 100 других сервисов в одном окне, не переключаясь между вкладками браузера.
          </p>
          <p style={{ marginBottom: 12 }}>
            Centrio построен на платформе Electron и работает нативно на всех трёх основных операционных системах. Приложение поддерживает Windows 10 и 11 (x64), macOS 12 Monterey и новее (Intel и Apple Silicon), а также дистрибутивы Linux на основе Ubuntu 20.04+, Debian и Arch Linux. Установочный файл для Windows — NSIS Installer (.exe), для macOS — Disk Image (.dmg), для Linux — AppImage и .deb пакет.
          </p>
          <p style={{ marginBottom: 12 }}>
            Среди ключевых возможностей Centrio: <strong style={{ color: 'rgba(255,255,255,0.3)' }}>облачная синхронизация</strong> настроек и мессенджеров между устройствами (в Pro-версии), <strong style={{ color: 'rgba(255,255,255,0.3)' }}>встроенный VPN</strong> с поддержкой протоколов VLESS, VMess, Trojan, Shadowsocks и Hysteria2, организация сервисов в папки, умные уведомления с настройкой на каждый мессенджер отдельно, PIN-блокировка, поиск по всем сервисам и горячие клавиши.
          </p>
          <p style={{ marginBottom: 12 }}>
            Приложение распространяется по модели freemium: <strong style={{ color: 'rgba(255,255,255,0.3)' }}>бесплатный план</strong> даёт доступ к основным функциям, <strong style={{ color: 'rgba(255,255,255,0.3)' }}>Centrio Pro</strong> (от 199 ₽/мес или 1 590 ₽/год) открывает неограниченное количество мессенджеров, облачную синхронизацию, папки и приоритетную поддержку. Оплата принимается через ЮКассу (карты РФ, СБП, ЮMoney) и криптовалютой (BTC, ETH, USDT, TON и 300+ других монет).
          </p>
          <p style={{ marginBottom: 12 }}>
            Centrio регулярно обновляется: последние версии исправили критические краши при запуске, добавили кастомный выбор акцент-цвета, поддержку всплывающих окон расширений и каталог SEO-плагинов. Автоматическое обновление работает в фоновом режиме — пользователь всегда получает последнюю версию (сейчас v2.5.2).
          </p>
          <p style={{ marginBottom: 0 }}>
            Если вы ищете аналог Rambox, Franz, Ferdi или Station — Centrio предлагает схожий функционал с дополнительным встроенным VPN, нативной поддержкой всех платформ и значительно меньшим потреблением памяти. Приложение бесплатно скачать и установить на сайте <strong style={{ color: 'rgba(255,255,255,0.3)' }}>centrio.me</strong>. Техническая поддержка доступна по адресу support@centrio.me.
          </p>
        </div>
      </div>
    </section>
  )
}
