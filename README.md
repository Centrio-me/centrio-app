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
    <img src="https://img.shields.io/badge/license-proprietary-64748b?style=flat-square" alt="License" />
  </p>

  <p>
    <a href="https://centrio.me">🌐 Website</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/download">📥 Download</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/features">✨ Features</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/pricing">💳 Pricing</a>
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

Telegram · WhatsApp · Discord · VK · Slack · Notion · Gmail · Signal · Zoom · WeChat · LINE · Figma · Jira · MAX · and any URL you add manually.

### AI Assistant

Ask it in plain language. It switches tabs, checks unread counts, reads your notification bell, controls the built-in VPN, drives the mini media player, and manages your Notes — creating, pinning, and deleting entries on request. *(Pro/Team)*

### Notes

A real notes plugin, not an afterthought: plain notes and shopping lists, synced across every device. Search, color labels, archive, drag-and-drop reordering, pinning, duplication, and a last-edited timestamp on every card. *(Pro/Team)*

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

Ping indicator (green / yellow / red), country flag, connection timer, automatic failover, traffic routing for all sessions.

### Mini Media Player

A sidebar icon appears the moment audio or video starts playing in any open tab — pause, skip forward and back without switching to that tab.

### Chrome Extensions

Install AdBlock, Grammarly, Translate and other extensions directly inside Centrio — no separate browser needed. *(Pro/Team)*

### Todos

A lightweight task planner with its own categories (lists) — add, star, complete, and delete both individual tasks and entire lists.

### Pro / Team Features

| Feature | Free | Pro | Team |
|---------|:----:|:---:|:----:|
| Messengers & services | ✅ unlimited | ✅ unlimited | ✅ unlimited |
| Built-in VPN | ✅ | ✅ | ✅ |
| AdBlock | ✅ | ✅ | ✅ |
| AI Assistant | — | ✅ | ✅ |
| Notes | — | ✅ | ✅ |
| Chrome Extensions | — | ✅ | ✅ |
| Folders & grouping | — | ✅ | ✅ |
| Cloud sync | — | ✅ | ✅ |
| Seats / team invites | — | — | ✅ |
| Priority support | — | ✅ | ✅ |

### Everything Else

- 🔔 **Smart notifications** — per-service mute, DND mode, custom sounds
- 📌 **PIN lock** — auto-lock on startup, on hide, or after idle timeout, with brute-force lockout
- 🎨 **Premium Settings** — freshly redesigned settings window
- 🌍 **5 languages** — Russian, English, 中文, Français, Italiano
- ⌨️ **Keyboard shortcuts** — `Ctrl+,` settings, `Ctrl+K` quick search, and more
- 🔄 **Auto-update** — silent background updates

---

## Download

| Platform | File | Requirements |
|----------|------|-------------|
| **Windows** | `.exe` NSIS installer | Windows 10/11 · x64 |
| **macOS** | `.dmg` disk image | macOS 12 Monterey+ · Intel & Apple Silicon |
| **Linux** | `.AppImage` / `.deb` | Ubuntu 20.04+ / Debian / Arch |

**👉 [centrio.me/download](https://centrio.me/download)**

Or grab the latest build from [GitHub Releases](https://github.com/ArtemkaFreedom/centrio-app/releases/latest).

---

## What's New — v2.6.0

**Notes plugin, premium Settings redesign, security & stability** *(September 2026)*

- **Notes** *(Pro/Team)* — notes and shopping lists synced across devices, with search, color labels, archive, drag-and-drop reordering, pinning, duplication and a last-edited date
- **AI Assistant** now controls the mini media player and works with Notes — create, pin, delete, read your shopping list
- **Settings redesign** — a more premium look for the entire settings window
- **Todos** — delete whole categories (lists), not just individual tasks
- Stability & security hardening: fixed the assistant getting stuck without a reply, strengthened lock-screen and token/key storage protection, closed rare race conditions in assistant quota accounting and payment refunds

<details>
<summary>Previous releases</summary>

### v2.5.3
- Fixed Cmd+C/Cmd+V and other system shortcuts on macOS
- Fixed Yandex Mail attachments opening only a preview instead of downloading
- Fixed the mini-player button not appearing while VK Music played
- New: Video Calls category — Yandex Telemost, Zoom, Google Meet, Microsoft Teams, Webex
- New: AmoCRM, Мегаплан, RetailCRM added to Productivity

### v2.5.2
- New: Alice PRO (alicepro.yandex.ru) added to the AI category

### v2.5.1
- Fixed the mini-player, which stopped appearing after the v2.5.0 update
- Restored the SYNTAX promo tile in the AI category
- General security hardening

### v2.5.0
- New: Centrio TEAM subscription — seats, invite links, a Team section in the dashboard
- New: mini media player in the right sidebar
- New: Element, Threema, Wire, Zalo, GroupMe, Threads, Snapchat, Google Meet, Webex, Chatwork, SYNTAX added
- New: Media category — YouTube, Spotify, Yandex Music, VK Video, Shazam, Ivi, Kinopoisk and more

### v2.4.0
- Google/Yandex/Grok login no longer hangs the app or leaves a black screen after closing the auth popup
- New: MAX and Telegram invite links open in the matching already-open tab instead of an external browser

### v1.6.76
- **Translate selected text** — right-click any selected text → Translate. Instant overlay, no browser tab.
- **Screenshot tool** — capture the current service window directly from the menu bar.
- **Catalog overhaul** — rebuilt service catalog with categories, search and one-click add.

### v1.6.75
- Built-in **AdBlock** — blocks ads across all services without extensions
- **Force Dark Mode** — inject dark theme into any website
- **Slash commands** (`/add`, `/search`, `/settings`) via Ctrl+K palette

### v1.5.18
- macOS & Linux builds — full cross-platform CI/CD
- Language switching without app relaunch

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
git tag v2.x.x && git push origin v2.x.x
        │
        ├─ build-win   (windows-latest)  →  .exe
        ├─ build-mac   (macos-latest)    →  .dmg
        └─ build-linux (ubuntu-latest)   →  .AppImage + .deb
                │
                └─ deploy  →  upload to download.centrio.me
```

Required secrets: `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `GOOGLE_DESKTOP_CLIENT_ID`, `GOOGLE_DESKTOP_CLIENT_SECRET`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`, `TELEGRAM_BOT_ID`

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Framework | [Electron 39](https://electronjs.org) |
| Bundler | [esbuild](https://esbuild.github.io) |
| Packaging | [electron-builder](https://electron.build) |
| VPN engine | [sing-box](https://sing-box.sagernet.org) |
| Auth | Google OAuth 2.0 · Yandex OAuth |
| Payments | YooKassa · crypto (NOWPayments) |
| Backend | Express · Prisma · PostgreSQL |

---

## Architecture

```
centrio-app/
├── main.js                  # Electron main process entry
├── preload.js                # contextBridge preload (main window)
├── webview-preload.js        # preload injected into each messenger <webview>
├── vpn-manager.js             # sing-box process manager
├── main/
│   ├── bootstrap/            # App init, window creation, IPC registration
│   ├── factory/               # BrowserWindow / modal window factories
│   ├── ipc/                   # VPN, proxy, OAuth, assistant, notes, updater...
│   └── services/              # Store, secure storage, entitlement, aiProviders...
├── renderer.js                # Renderer entry — wires up all renderer/*.js modules
├── renderer/                  # Vanilla JS + esbuild, one module per feature
│   ├── assistant-bind.js      # AI assistant chat UI
│   ├── notes-bind.js          # Notes plugin
│   ├── media-player-ui.js     # Mini media player
│   ├── vpn-bind.js            # VPN panel
│   └── settings-bind.js       # Settings panel
├── landing/                   # Marketing site source (Next.js, deployed separately)
└── .github/workflows/
    └── build.yml               # Multi-platform CI/CD
```

---

## License

Proprietary — All rights reserved © 2026 [Centrio](https://centrio.me)

This source is published for transparency. It is not licensed for reuse, redistribution, or commercial derivative works without written permission.
