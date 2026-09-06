<div align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Centrio" />

  <h1>Centrio</h1>

  <p><strong>Все мессенджеры в одном окне.</strong></p>

  <p>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases/latest">
      <img src="https://img.shields.io/github/v/release/ArtemkaFreedom/centrio-app?label=версия&color=6d28d9&style=flat-square" alt="Последний релиз" />
    </a>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases">
      <img src="https://img.shields.io/github/downloads/ArtemkaFreedom/centrio-app/total?color=3b82f6&style=flat-square&label=скачиваний" alt="Скачиваний" />
    </a>
    <img src="https://img.shields.io/badge/платформы-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square" alt="Платформы" />
    <img src="https://img.shields.io/badge/лицензия-MIT-22c55e?style=flat-square" alt="Лицензия" />
  </p>

  <p>
    <a href="https://centrio.me">🌐 Сайт</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/download">📥 Скачать</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/faq">❓ FAQ</a>
    &nbsp;·&nbsp;
    <a href="mailto:support@centrio.me">💬 Поддержка</a>
  </p>

  <p>
    <a href="README.md">English</a> · <b>Русский</b> · <a href="README.zh.md">中文</a> · <a href="README.fr.md">Français</a> · <a href="README.it.md">Italiano</a>
  </p>


</div>

---

## Зачем Centrio?

Telegram в одном окне, WhatsApp в другом, Discord в третьем. Gmail в браузере. Notion где-то ещё. Slack пингует в фоне.

**Centrio объединяет всё это в одном месте** — одно десктопное приложение, где каждый сервис живёт в своей вкладке, уведомления собраны вместе, и можно наконец закрыть 14 вкладок браузера.

---

## Возможности

### 100+ сервисов — одна боковая панель

Telegram · WhatsApp · Discord · VK · Slack · Notion · Gmail · Signal · Zoom · WeChat · LINE · Figma · Jira · и любой сайт по URL.

### Встроенный VPN

Никаких сторонних приложений. Импортируй ссылку на конфиг — подключись одним кликом.

| Протокол | Формат импорта |
|----------|----------------|
| VLESS | `vless://...` |
| VMess | `vmess://...` |
| Trojan | `trojan://...` |
| Shadowsocks | `ss://...` |
| Hysteria2 | `hy2://...` |
| Подписка | URL со списком конфигов |

Пинг с цветовым индикатором, флаг страны, таймер соединения, маршрутизация трафика для всех сессий.

### Chrome-расширения

Установи AdBlock, Grammarly, Переводчик и другие расширения прямо внутри Centrio — без отдельного браузера. *(Pro)*

### Бесплатно и Pro

| Функция | Бесплатно | Pro |
|---------|:---------:|:---:|
| Мессенджеры и сервисы | ✅ без лимита | ✅ без лимита |
| Встроенный VPN | ✅ | ✅ |
| AdBlock | ✅ | ✅ |
| Chrome-расширения | — | ✅ |
| Папки и группировка | — | ✅ |
| Облачная синхронизация | — | ✅ |
| Приоритетная поддержка | — | ✅ |

### Всё остальное

- 🔔 **Умные уведомления** — мут, режим «Не беспокоить», свои звуки для каждого сервиса
- 📌 **PIN-блокировка** — автоблокировка с настраиваемым таймаутом
- 🎨 **Темы** — тёмная, светлая, следовать системе
- 🌍 **5 языков** — Русский, English, 中文, Français, Italiano
- ⌨️ **Горячие клавиши** — `Ctrl+,` настройки, `Ctrl+K` быстрый поиск
- 🔄 **Авто-обновление** — тихое обновление в фоне

---

## Скачать

| Платформа | Файл | Требования |
|-----------|------|-----------|
| **Windows** | `.exe` NSIS-установщик | Windows 10/11 · x64 |
| **macOS** | `.dmg` образ диска | macOS 12 Monterey+ · x64 |
| **Linux** | `.AppImage` / `.deb` | Ubuntu 20.04+ / Debian / Arch |

**👉 [centrio.me/download](https://centrio.me/download)**

Или возьми последнюю сборку из [GitHub Releases](https://github.com/ArtemkaFreedom/centrio-app/releases/latest).

---

## Что нового — v1.6.76

**Перевод, скриншот и переработанный каталог** *(Май 2026)*

- **Перевод выделенного текста** — выдели текст → правая кнопка → Перевести. Моментальный оверлей, без браузера.
- **Скриншот** — снимок текущего окна сервиса прямо из меню.
- **Каталог сервисов** — переработан с категориями, поиском и добавлением в один клик.

<details>
<summary>Предыдущие версии</summary>

### v1.6.75
- Встроенный **AdBlock** — блокирует рекламу во всех сервисах без расширений
- **Принудительная тёмная тема** — инжект тёмного оформления на любой сайт
- **Слэш-команды** (`/add`, `/search`, `/settings`) через палитру Ctrl+K
- Поиск по URL с фолбэком на DuckDuckGo / Google

### v1.6.74
- **Поддержка Chrome-расширений** — установка из каталога (AdBlock, Grammarly, Переводчик)
- **Быстрый переключатель** `Ctrl+K` — мгновенный переход к любому сервису
- DevTools для каждого сервиса, кастомная обработка MIME-типов

### v1.6.73
- CORS/CSP-обход в стиле Rambox — починка сломанных сервисов (Notion, Figma и др.)
- Флаг `allowServiceWorkers` для каждой сессии

</details>

---

## Сборка из исходников

```bash
git clone https://github.com/ArtemkaFreedom/centrio-app.git
cd centrio-app
npm install
cp .env.example .env   # заполни OAuth-credentials
```

```bash
npm start              # режим разработки
npm run build:win      # → dist/Centrio Setup x.x.x.exe
npm run build:mac      # → dist/Centrio-x.x.x.dmg
npm run build:linux    # → dist/Centrio-x.x.x.AppImage + .deb
```

**Требования:** Node.js 22+, npm 10+

---

## Лицензия

MIT © 2026 [Centrio](https://centrio.me)
