<div align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Centrio" />

  <h1>Centrio</h1>

  <p><strong>All your messengers. One window.</strong></p>

  <p>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases/latest">
      <img src="https://img.shields.io/github/v/release/ArtemkaFreedom/centrio-app?label=latest&color=6d28d9&style=flat-square" alt="Latest Release" />
    </a>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases">
      <img src="https://img.shields.io/github/downloads/ArtemkaFreedom/centrio-app/total?color=3b82f6&style=flat-square&label=downloads" alt="Downloads" />
    </a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square" alt="Platforms" />
    <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License" />
  </p>

  <p>
    <a href="https://centrio.me">🌐 Website</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/download">📥 Download</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/faq">❓ FAQ</a>
    &nbsp;·&nbsp;
    <a href="mailto:support@centrio.me">💬 Support</a>
  </p>

  <p>
    <b>English</b> · <a href="README.ru.md">Русский</a> · <a href="README.zh.md">中文</a> · <a href="README.fr.md">Français</a> · <a href="README.it.md">Italiano</a>
  </p>

  <br />

  | 🇷🇺 | 🇬🇧 | 🇨🇳 | 🇫🇷 | 🇮🇹 |
  |:---:|:---:|:---:|:---:|:---:|
  | Все мессенджеры в одном окне | All your messengers in one window | 所有软件一个窗口 | Tous vos messagers en une fenêtre | Tutti i messenger in una finestra |


</div>

<br />

---

## Why Centrio?

You have Telegram open in one window, WhatsApp in another, Discord in a third. Gmail in a browser tab. Notion somewhere. Slack pinging in the background.

**Centrio puts all of them in one place** — a single desktop app where every service lives in its own tab, notifications are unified, and you can finally close 14 browser tabs.

---

## Features

### 100+ Services, One Sidebar

Telegram · WhatsApp · Discord · VK · Slack · Notion · Gmail · Signal · Zoom · WeChat · LINE · Figma · Jira · and any URL you add manually.

### Built-in VPN

No third-party app needed. Import a config link and connect with one click.

| Protocol | Import format |
|----------|--------------|
| VLESS | `vless://...` |
| VMess | `vmess://...` |
| Trojan | `trojan://...` |
| Shadowsocks | `ss://...` |
| Hysteria2 | `hy2://...` |
| Subscription | URL with config list |

Ping indicator (green / yellow / red), country flag, connection timer, traffic routing for all sessions.

### Chrome Extensions

Install AdBlock, Grammarly, Translate and other extensions directly inside Centrio — no separate browser needed. *(Pro)*

### Pro Features

| Feature | Free | Pro |
|---------|:----:|:---:|
| Messengers & services | ✅ unlimited | ✅ unlimited |
| Built-in VPN | ✅ | ✅ |
| AdBlock | ✅ | ✅ |
| Chrome Extensions | — | ✅ |
| Folders & grouping | — | ✅ |
| Cloud sync | — | ✅ |
| Priority support | — | ✅ |

### Everything Else

- 🔔 **Smart notifications** — per-service mute, DND mode, custom sounds
- 📌 **PIN lock** — auto-lock with configurable timeout
- 🎨 **Themes** — Dark, Light, system-follow
- 🌍 **5 languages** — Russian, English, 中文, Français, Italiano
- ⌨️ **Keyboard shortcuts** — `Ctrl+,` settings, `Ctrl+K` quick search, and more
- 🔄 **Auto-update** — silent background updates

---

## Download

| Platform | File | Requirements |
|----------|------|-------------|
| **Windows** | `.exe` NSIS installer | Windows 10/11 · x64 |
| **macOS** | `.dmg` disk image | macOS 12 Monterey+ · x64 |
| **Linux** | `.AppImage` / `.deb` | Ubuntu 20.04+ / Debian / Arch |

**👉 [centrio.me/download](https://centrio.me/download)**

Or grab the latest build from [GitHub Releases](https://github.com/ArtemkaFreedom/centrio-app/releases/latest).

---

## What's New — v1.6.76

**Translate, Screenshot & Catalog overhaul** *(May 2026)*

- **Translate selected text** — right-click any selected text → Translate. Instant overlay, no browser tab.
- **Screenshot tool** — capture the current service window directly from the menu bar.
- **Catalog overhaul** — rebuilt service catalog with categories, search and one-click add.

<details>
<summary>Previous releases</summary>

### v1.6.75
- Built-in **AdBlock** — blocks ads across all services without extensions
- **Force Dark Mode** — inject dark theme into any website
- **Slash commands** (`/add`, `/search`, `/settings`) via Ctrl+K palette
- URL bar search with DuckDuckGo / Google fallback

### v1.6.74
- **Chrome Extension support** — install from a curated catalog (AdBlock, Grammarly, Google Translate)
- **Quick Switcher** `Ctrl+K` — jump to any service instantly
- DevTools menu per service, custom MIME type handling

### v1.6.73
- Rambox-style CORS/CSP bypass — fixes broken services (Notion, Figma, etc.)
- `allowServiceWorkers` flag per session
- Extension settings button in sidebar

### v1.6.72
- Robust extension messaging (`executeScript`, `sendMessage`, `centrio-ext://` fallback)
- Extension live toggle without restart

### v1.6.69
- Extension popup bridge
- `chrome.tabs` shim, `centrio-ext://` protocol

### v1.5.18
- macOS & Linux builds — full cross-platform CI/CD
- Language switching without app relaunch
- VPN panel redesign, sing-box disconnect fix

### v1.5.10
- VLESS + Reality + TCP / XHTTP support
- Subscription URL import
- 40+ messengers added

</details>

---

## Building from Source

```bash
git clone https://github.com/ArtemkaFreedom/centrio-app.git
cd centrio-app
npm install
cp .env.example .env   # fill in OAuth credentials
```

```bash
npm start              # development
npm run build:win      # → dist/Centrio Setup x.x.x.exe
npm run build:mac      # → dist/Centrio-x.x.x.dmg
npm run build:linux    # → dist/Centrio-x.x.x.AppImage + .deb
```

**Requirements:** Node.js 22+, npm 10+

---

## CI/CD

Every `v*` tag triggers a multi-platform GitHub Actions build:

```
git tag v1.x.x && git push origin v1.x.x
        │
        ├─ build-win   (windows-latest)  →  .exe
        ├─ build-mac   (macos-latest)    →  .dmg
        └─ build-linux (ubuntu-latest)   →  .AppImage + .deb
                │
                └─ deploy  →  upload to download.centrio.me
```

Required secrets: `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `GOOGLE_DESKTOP_CLIENT_ID`, `GOOGLE_DESKTOP_CLIENT_SECRET`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | [Electron 36](https://electronjs.org) |
| Bundler | [esbuild](https://esbuild.github.io) |
| Packaging | [electron-builder 25](https://electron.build) |
| VPN engine | [sing-box](https://sing-box.sagernet.org) |
| Auth | Google OAuth 2.0 · Yandex OAuth |
| Payments | YooKassa |

---

## Architecture

```
centrio-app/
├── main.js                  # Electron main process
├── main/
│   ├── bootstrap/           # App init, IPC registration
│   ├── factory/             # BrowserWindow factories
│   ├── ipc/                 # VPN, proxy, OAuth, updater...
│   └── services/            # Store, tracker, updater...
├── renderer/                # Vanilla JS + esbuild
│   ├── index.js             # Entry point
│   ├── vpn-bind.js          # VPN panel
│   └── settings-bind.js     # Settings panel
├── preload.js               # contextBridge preload
├── vpn-manager.js           # sing-box process manager
└── .github/workflows/
    └── build.yml            # Multi-platform CI/CD
```

---

## License

MIT © 2026 [Centrio](https://centrio.me)
