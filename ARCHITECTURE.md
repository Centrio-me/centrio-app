# Architecture

Centrio is an Electron desktop app that bundles web-based messengers (Telegram Web, WhatsApp Web, Discord, etc.) into a single window, each as an isolated `<webview>` tab. This document maps the codebase for a new contributor: process split, messenger/session model, renderer module pattern, IPC boundary, extensions system, i18n, and the build/publish pipeline.

All file:line references below were read directly from the repository at the time of writing (package.json version `1.8.0`).

## 1. Process split

Electron has two processes here, plus a preload bridge between them:

- **Main process** — `main.js` (entry point per `package.json:"main"`) and everything under `main/`. Owns the OS-level window, tray, VPN subprocess, file system, network calls, and all `session` (partition) management.
- **Renderer process** — `index.html` + `bundle.js` (built) + the legacy `renderer.js` (85KB, not yet fully split) + `renderer/*.js` modules. Runs the UI, webview tabs, settings screens, and talks to the main process only through `window.electronAPI` (exposed via `preload.js`).
- **Preload bridge** — `preload.js` uses `contextBridge` to expose a narrow, allowlisted API (`window.electronAPI`) to the renderer. Two explicit allowlists gate what the renderer can reach:
  - `validReceiveChannels` (`preload.js:3-18`) — channels the main process is allowed to `send()` to the renderer (e.g. `update-available`, `vpn-restored`).
  - `validInvokeChannels` (`preload.js:38+`) — channels the renderer is allowed to `invoke()`/`send()` on, grouped by the `main/ipc/*.js` file that registers the matching handler (e.g. `vpn-status`, `vpn-connect` under the `main/ipc/vpn.js` comment block). The comment at `preload.js:31-37` explains why this exists: without the allowlist, any renderer code (including a bug in a bundled dependency or a compromised webview) could reach *any* `ipcMain` handler.

### Main process entry flow

`main.js` wires together the pieces in `main/bootstrap/`:

- `main/bootstrap/initApp.js` — waits for `app.whenReady()`, then creates the window/tray, calls `registerIpc(...)`, starts the usage tracker (`main/services/tracker.js`) and anonymous visitor tracker (`main/services/visitor-tracker.js`), initializes the auto-updater (`main/services/updater.js`), applies adblock to all sessions, and schedules periodic update checks (first check after a random 10-20s delay, then every 12h).
- `main/bootstrap/registerIpc.js` — a flat list of `register*Ipc()` calls, one per `main/ipc/*.js` file (window, badge, notifications, downloads, autoLaunch, api, oauth, proxy, updater, sound, vpn, screenshot, settingsPortability, extensions). This is the single place that wires all IPC handlers into `ipcMain`.
- `main/bootstrap/registerAppEvents.js` — top-level Electron `app` event handlers (`open-url` for protocol links, `before-quit` with a timeout-guarded tracker flush, external link handling via `setWindowOpenHandler`).
- `main/window.js` — creates the `BrowserWindow`, wires VPN auto-restore on startup (re-applies proxy settings per messenger session partition), crash logging.
- `main/config/constants.js` — central constants: app name/protocol/API URL, default window size, all `IPC_CHANNELS` name constants, OAuth provider config (Google/GitHub/Yandex ports and URLs), and `PATHS` (assets, preload, index.html) resolved from `ROOT_DIR`.
- `main/utils/ipc.js` — `ok()`/`fail()`/`wrapIpc()` helpers that standardize IPC handler responses to `{ success, data }` / `{ success, error }`, used throughout `main/ipc/*.js`.

## 2. Messenger configuration & session partitioning

**Catalog of built-in messengers**: `renderer/constants.js` defines `popularMessengers`, a flat array of `{ name, url, icon, color }` entries (Telegram, WhatsApp, VK, Discord, Slack, Gmail, Notion, etc. — 100+ entries grouped by comment headers like "Топ-8", "Мессенджеры", "Почта", "Продуктивность").

**User's active messenger list**: when a user adds a messenger (from the catalog or a custom URL), it's stored as an object with an `id` field in the app's persistent store (`main/services/store.js`, backed by `electron-store`). That `id` is then used everywhere a stable per-messenger identifier is needed:

- `renderer/messengers.js:100` — sidebar list item: `item.id = \`sidebar-${messenger.id}\``
- `renderer/messengers.js:165` — tab bar item: `tab.id = \`tab-${messenger.id}\``
- `renderer/messengers.js:246,249` — the `<webview>` element itself: `webview.id = \`webview-${messenger.id}\`` and, critically, `webview.setAttribute('partition', \`persist:${messenger.id}\`)`

**Session partitioning pattern**: every messenger gets its own persistent Electron session, keyed as `persist:${messenger.id}`. This is what gives each messenger (Telegram, WhatsApp, etc.) isolated cookies/localStorage/cache — logging into one doesn't affect another, and clearing one doesn't clear the rest. The same `persist:${m.id}` string is derived independently in several places that all need to reach a given messenger's session:

| File | Purpose |
|---|---|
| `main/window.js:49` | VPN auto-restore on startup — re-applies proxy per messenger session |
| `main/services/adblock.js:65` | Applies adblock filtering to each messenger's session |
| `main/services/extensions.js:472` | Lists all messenger partitions to load enabled extensions into |
| `main/services/proxy.js:65` | Applies per-messenger proxy settings |
| `main/ipc/vpn.js:61` | VPN connect/disconnect handler, iterates messenger sessions |
| `main/ipc/window.js:144` | Validates that a requested partition belongs to a known messenger |
| `renderer/webview-tabs-bind.js:404,409,469` | Sets the partition attribute when creating a webview tab, and applies extensions to the new session immediately (`ext:apply-to-session` IPC call) |
| `renderer.js:1638` | Same `ext:apply-to-session` call from the legacy renderer bundle |

Because the partition string is derived from `messenger.id` independently in each of these files rather than being centrally computed, any change to the ID format needs to be applied consistently across all of them — there is no single `getPartitionFor(messenger)` helper today.

## 3. Renderer module structure — factory-function pattern

The renderer is transitioning from a single legacy file (`renderer.js`, ~85KB) to small modules under `renderer/`, but both currently coexist. `renderer/index.js` is the real esbuild entry point (see `build-renderer.js:9`) — its only job is to `require('../renderer.js')` (relative path from `renderer/index.js`), so the legacy file still runs; new functionality is being extracted into `renderer/*.js` modules that legacy `renderer.js` then instantiates and wires together.

**The pattern**: each renderer module exports a single `create<Thing>Api({ ...dependencies })` factory function that takes its dependencies as a destructured object (dependency injection, no module-level singletons) and returns an object of methods/handlers. `renderer.js` calls these factories near the top of its init flow and stores the results in local `const`s. Examples (from `renderer.js`):

```
renderer.js:533   const cloudApi          = createCloudApi({ ... })
renderer.js:655   const soundsApi         = createSoundsApi({ ... })
renderer.js:678   const statusBarApi      = createStatusBarApi({ store, state, tGet, getCurrentLocale })
renderer.js:701   const unreadApi         = createUnreadApi({ ... })
renderer.js:970   const contextMenusApi   = createContextMenusApi({ ... })
renderer.js:1254  const webviewTabsApi    = createWebviewTabsApi({ ... })
renderer.js:1502  const extensionsUiApi   = createExtensionsUiApi({ ... })
```

Each factory file itself starts with `function create<Thing>Api({ ...deps }) { ... return { ...publicMethods } }`. For example:

- `renderer/status-bar.js:1` — `function createStatusBarApi({ store, state, tGet, getCurrentLocale })`
- `renderer/messengers.js:1` — `function createMessengersApi({ state, store, ipcRenderer, invokeIpc, tGet, preloadPath, messengerList, tabsBar, tabsContent, welcomeScreen, webviewContextMenu, showTooltip, hideTooltip, playNotifSound, updateStatusBar, updateFolderBadge, updateUnreadCount, updateMuteIcon, isMessengerMuted, resetMessengerNotifyState, hideAllMenus, showContextMenu, initDrag, initDropTarget, saveData, getTabZoomLevel })`
- `renderer/webview-tabs-bind.js:1` — `function createWebviewTabsApi({ ... })`
- `renderer/tooltips.js:1` — `function createTooltipsApi({ state, tooltip })` (a minimal example)

These are plain script-global functions (no ES module `export`), consistent with the `iife` bundle format esbuild produces (`build-renderer.js` `format: 'iife'`). There are ~20 such `create*Api` factories today (cloud, sounds, status-bar, tooltips, unread, webview-notify, folders-ui, lock, cloud-ui, context-menus, search-ui, webview-tabs-bind, split, add-modal-ui, sidebar-dnd-bind, proxy, settings-ui, extensions-ui, change-icon-ui, messenger-sound-ui).

Shared cross-module state lives in `renderer/state.js` (a plain object, passed into most factories as `state`).

## 4. IPC boundary (`main/ipc/*.js`)

Each file under `main/ipc/` registers a related group of `ipcMain.handle()`/`ipcMain.on()` channels and is required exactly once, from `main/bootstrap/registerIpc.js`. Business logic is kept out of the IPC layer where possible and delegated to `main/services/*.js` — e.g. `main/ipc/extensions.js` is a thin wrapper that validates input and calls into `main/services/extensions.js`.

Naming convention observed in `main/ipc/extensions.js`:

```js
function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch {}
    ipcMain.handle(channel, handler)
}
```

`safeHandle` removes any previously-registered handler for the same channel before re-registering — defensive against hot-reload/duplicate-registration in dev mode. Handlers return `{ success: true, ... }` / `{ success: false, error }` shaped responses (see `main/utils/ipc.js`'s `ok()`/`fail()`/`wrapIpc()` helpers), matching what `preload.js`'s renderer-side `invoke()` wrapper expects.

Files in `main/ipc/`: `window.js`, `badge.js`, `notifications.js`, `downloads.js`, `autoLaunch.js`, `api.js`, `oauth.js`, `proxy.js`, `updater.js`, `sound.js`, `vpn.js`, `screenshot.js`, `settingsPortability.js`, `extensions.js`.

Every channel a handler in this directory exposes must also appear in `preload.js`'s `validInvokeChannels` set (grouped by source file in comments, e.g. `// main/ipc/vpn.js` above `'vpn-status', 'vpn-connect', ...`) or the renderer cannot reach it — this is the enforcement point described in section 1.

## 5. Extensions system

Real Chrome extension support lives in `main/services/extensions.js` (main process, loads `.crx`-derived unpacked extensions into Electron sessions via `session.loadExtension()`) and `main/ipc/extensions.js` (IPC surface: `ext:list`, `ext:install`, `ext:uninstall`, `ext:toggle`, `ext:apply-to-session`), with the renderer side in `renderer/extensions-ui.js` (`createExtensionsUiApi`).

Key design points (documented in code comments at `main/services/extensions.js:1-40`):

- **Hardcoded catalog, not an open "install by ID" store.** `CATALOG` (`main/services/extensions.js:52-58`) currently has one entry, `translate-ext` (Google Translate, real Chrome Web Store ID `aapbdbdomjkkjkaonfhkkikfgjllcleb`).
- **Password managers are deliberately excluded** — their background service workers crash on Electron because `chrome.windows` isn't implemented and `chrome.webNavigation` is only partially implemented; this is a structural Electron gap, not a bug in a specific extension.
- **One targeted shim**: `chrome.contextMenus` (which Electron doesn't implement at all) is monkey-patched as a no-op in the extension's `background.service_worker` file, because an uncaught exception from `chrome.contextMenus.onClicked.addListener(...)` at the end of a background script kills the *entire* service worker registration, including unrelated listeners defined earlier in the file. The shim is applied both at install time and defensively on every session load, so extensions installed before the shim existed also get patched without reinstall.
- **Opt-in per user**: extensions are off by default (`extensionsState[key] !== true`) and, per the in-app changelog (v1.6.82), gated to the Pro plan.
- Extensions are applied to a messenger's session on-demand via the `ext:apply-to-session` IPC call, which the renderer fires every time it creates a new webview (`renderer/webview-tabs-bind.js:404`) — see section 2 for the `persist:${m.id}` partition it targets. `main/services/extensions.js:472` (`getPartitionsForMessengers`, roughly) enumerates all known messenger partitions so extensions can be (re)applied everywhere, e.g. after a toggle.

## 6. Internationalization (i18n)

Seven locale files under `locales/`: `en.js`, `ru.js`, `de.js`, `es.js`, `fr.js`, `it.js`, `zh.js`. Each is a CommonJS module exporting a nested plain object keyed by feature area (e.g. `ctx.*` for context-menu labels, `folders.*`, `modal.*`, `settings.*`) — see `locales/en.js:1-24` for the shape.

Renderer-side lookup logic is in `renderer/i18n.js`:

- All seven locales are **statically required** up front (`renderer/i18n.js:5-12`) — the comment explicitly notes this is required because esbuild cannot bundle a dynamic `require()` with a variable path.
- `initI18n()` reads the persisted `settings.language` value from the store (via `window.electronAPI.storeGet`) to pick the active language at startup.
- `tGet(key, params)` resolves a dot-path key (e.g. `'settings.language'`) against the active dictionary, falling back to the key itself if not found, and supports `{param}` interpolation.
- `applyI18n(root)` walks the DOM for `[data-i18n]`, `[data-i18n-placeholder]`, and `[data-i18n-title]` attributes and fills them in — this is how `index.html` markup (e.g. `<span data-i18n="ctx.reload"></span>`) gets translated without a templating framework.

Main-process i18n (`main/services/i18n.js`) exists separately for main-process-originated strings (e.g. tray menu, native dialogs).

## 7. Build & publish pipeline

- **Renderer bundling**: `build-renderer.js` uses esbuild to bundle `renderer/index.js` → `bundle.js` (IIFE, `target: chrome120`, minified only when `NODE_ENV=production`, inline sourcemaps otherwise). Electron/node built-ins are marked `external` since they run in a `nodeIntegration`-style context. `npm run watch:renderer` runs the same config in esbuild's incremental watch mode.
- **Packaging**: `electron-builder` config lives inline in `package.json` under `"build"`. Key points:
  - `appId: "me.centrio.app"`, output dir `dist/`, `compression: "maximum"`.
  - `files` allowlist explicitly excludes `dist*/`, `landing/`, `*.md`, `.git*`, `.claude/`, `*.py`, `telegram-claude/`, `scripts/`, and the *unbundled* `renderer/**/*.js` + `renderer.js` (since `bundle.js` is what actually ships).
  - Per-platform targets: Windows → NSIS installer (x64), macOS → DMG with a generic auto-update feed at `https://download.centrio.me/mac/`, Linux → `.deb` + AppImage with a `centrio-auth://` protocol registration and a generic update feed at `https://download.centrio.me/linux/`.
  - Top-level `publish.provider: "generic"` at `https://download.centrio.me/` backs `electron-updater` (`main/services/updater.js`).
- **npm scripts** (`package.json`):
  - `npm run build:renderer` — one-shot esbuild build.
  - `npm start` / `npm run dev` — build renderer then `electron .`.
  - `npm run build:win` / `:mac` / `:linux` — `rimraf dist` (win only), build renderer, then `electron-builder --<platform>`.
  - `npm run publish` — `build:win` then `node scripts/publish.js`.
- **`scripts/publish.js`** — uploads the built Windows installer (`latest.yml`, the `.exe`, and its `.blockmap`) to the update server over SFTP (`ssh2-sftp-client`), preferring an SSH key (`~/.ssh/centrio_deploy_tmp/centrio_deploy`) over a password, both configurable via `.env` (`UPLOAD_HOST`, `UPLOAD_USER`, `UPLOAD_PATH`, `UPLOAD_PRIVATE_KEY_PATH`/`UPLOAD_PASSWORD`).
- **`scripts/deploy-site.js`** — a separate deploy script for the marketing/landing site (`landing/`), unrelated to the desktop app's own release artifacts; not part of the `npm run publish` chain above.
- **CI**: `.github/workflows/build.yml` — per the root `README.md`, a `v*` git tag triggers parallel `windows-latest`/`macos-latest`/`ubuntu-latest` builds that produce `.exe`/`.dmg`/`.AppImage`+`.deb` and upload them to `download.centrio.me`. Required secrets: `SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `GOOGLE_DESKTOP_CLIENT_ID`, `GOOGLE_DESKTOP_CLIENT_SECRET`, `YANDEX_CLIENT_ID`, `YANDEX_CLIENT_SECRET`.

## 8. Other notable pieces (not detailed above)

- `vpn-manager.js` (repo root) — manages the `sing-box` subprocess that backs the built-in VPN (VLESS/VMess/Trojan/Shadowsocks/Hysteria2 protocols, per `README.md`).
- `webview-preload.js` — a second preload script, injected into the `<webview>` tags themselves (as opposed to `preload.js`, which is the main window's preload) — used for in-page notification interception, unread-count reporting (`webview.id` scheme from section 2), etc.
- `main/services/store.js` — wraps `electron-store` for plain settings; `main/services/secureStore.js` handles anything sensitive (tokens) separately, exposed via the `store:secure-*` IPC channels in `preload.js`.
