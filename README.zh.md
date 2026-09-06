<div align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Centrio" />

  <h1>Centrio</h1>

  <p><strong>所有软件，一个窗口。</strong></p>

  <p>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases/latest">
      <img src="https://img.shields.io/github/v/release/ArtemkaFreedom/centrio-app?label=版本&color=6d28d9&style=flat-square" alt="最新版本" />
    </a>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases">
      <img src="https://img.shields.io/github/downloads/ArtemkaFreedom/centrio-app/total?color=3b82f6&style=flat-square&label=下载量" alt="下载量" />
    </a>
    <img src="https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square" alt="平台" />
    <img src="https://img.shields.io/badge/许可证-MIT-22c55e?style=flat-square" alt="许可证" />
  </p>

  <p>
    <a href="https://centrio.me">🌐 官网</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/download">📥 下载</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/faq">❓ 常见问题</a>
    &nbsp;·&nbsp;
    <a href="mailto:support@centrio.me">💬 支持</a>
  </p>

  <p>
    <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <b>中文</b> · <a href="README.fr.md">Français</a> · <a href="README.it.md">Italiano</a>
  </p>


</div>

---

## 为什么选择 Centrio？

Telegram 开一个窗口，WhatsApp 开另一个，Discord 再开一个。Gmail 在浏览器里，Notion 在别的地方，Slack 在后台不停弹消息。

**Centrio 把这一切汇聚在同一个地方** — 一个桌面应用，每个服务都有自己的标签页，通知统一管理，终于可以关掉那 14 个浏览器标签了。

---

## 功能特点

### 100+ 服务，一个侧边栏

Telegram · WhatsApp · Discord · VK · Slack · Notion · Gmail · Signal · Zoom · WeChat · LINE · Figma · Jira · 以及任何你手动添加的网址。

### 内置 VPN

无需第三方软件。导入配置链接，一键连接。

| 协议 | 导入格式 |
|------|---------|
| VLESS | `vless://...` |
| VMess | `vmess://...` |
| Trojan | `trojan://...` |
| Shadowsocks | `ss://...` |
| Hysteria2 | `hy2://...` |
| 订阅链接 | 包含配置列表的 URL |

延迟指示器（绿/黄/红）、国旗、连接计时器，所有会话流量统一路由。

### Chrome 扩展

直接在 Centrio 内安装 AdBlock、Grammarly、翻译等扩展 — 无需单独开浏览器。*(Pro)*

### 免费与 Pro 版

| 功能 | 免费 | Pro |
|------|:----:|:---:|
| 消息服务数量 | ✅ 无限制 | ✅ 无限制 |
| 内置 VPN | ✅ | ✅ |
| AdBlock | ✅ | ✅ |
| Chrome 扩展 | — | ✅ |
| 文件夹与分组 | — | ✅ |
| 云同步 | — | ✅ |
| 优先支持 | — | ✅ |

### 其他功能

- 🔔 **智能通知** — 每个服务单独静音、勿扰模式、自定义提示音
- 📌 **PIN 锁定** — 可配置自动锁定超时
- 🎨 **主题** — 深色、浅色、跟随系统
- 🌍 **5 种语言** — 中文、English、Русский、Français、Italiano
- ⌨️ **快捷键** — `Ctrl+,` 设置，`Ctrl+K` 快速搜索
- 🔄 **自动更新** — 后台静默更新

---

## 下载

| 平台 | 文件 | 系统要求 |
|------|------|---------|
| **Windows** | `.exe` NSIS 安装包 | Windows 10/11 · x64 |
| **macOS** | `.dmg` 磁盘映像 | macOS 12 Monterey+ · x64 |
| **Linux** | `.AppImage` / `.deb` | Ubuntu 20.04+ / Debian / Arch |

**👉 [centrio.me/download](https://centrio.me/download)**

或从 [GitHub Releases](https://github.com/ArtemkaFreedom/centrio-app/releases/latest) 获取最新构建。

---

## 最新版本 — v1.6.76

**翻译、截图与全新服务目录** *(2026 年 5 月)*

- **划词翻译** — 选中文字 → 右键 → 翻译。即时悬浮显示，无需打开浏览器。
- **截图工具** — 直接从菜单栏截取当前服务窗口。
- **服务目录重制** — 分类浏览、搜索与一键添加。

<details>
<summary>历史版本</summary>

### v1.6.75
- 内置 **AdBlock** — 无需扩展即可屏蔽所有服务中的广告
- **强制深色模式** — 为任意网站注入深色主题
- **斜杠命令** (`/add`、`/search`、`/settings`) 通过 Ctrl+K 面板调用
- URL 搜索，支持 DuckDuckGo / Google 备选

### v1.6.74
- **Chrome 扩展支持** — 从精选目录安装（AdBlock、Grammarly、Google 翻译）
- **快速切换器** `Ctrl+K` — 即时跳转到任意服务
- 每个服务独立 DevTools，自定义 MIME 类型处理

### v1.6.73
- Rambox 风格 CORS/CSP 绕过 — 修复损坏服务（Notion、Figma 等）
- 每个会话的 `allowServiceWorkers` 标志

</details>

---

## 从源码构建

```bash
git clone https://github.com/ArtemkaFreedom/centrio-app.git
cd centrio-app
npm install
cp .env.example .env   # 填写 OAuth 凭据
```

```bash
npm start              # 开发模式
npm run build:win      # → dist/Centrio Setup x.x.x.exe
npm run build:mac      # → dist/Centrio-x.x.x.dmg
npm run build:linux    # → dist/Centrio-x.x.x.AppImage + .deb
```

**环境要求：** Node.js 22+，npm 10+

---

## 许可证

MIT © 2026 [Centrio](https://centrio.me)
