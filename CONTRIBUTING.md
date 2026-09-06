# Contributing to Centrio

This is a working guide for contributors, based on what's actually in the codebase today (not an aspirational style guide). See `ARCHITECTURE.md` for the deeper structural walkthrough referenced below.

## Development setup

Requirements (per `README.md`): Node.js 22+, npm 10+.

```bash
git clone https://github.com/ArtemkaFreedom/centrio-app.git
cd centrio-app
npm install
cp .env.example .env   # fill in OAuth credentials and any UPLOAD_* deploy vars you need
```

Run in dev mode (`package.json` `scripts`):

```bash
npm start        # == npm run dev: builds the renderer bundle, then launches `electron .`
```

Other relevant scripts:

```bash
npm run build:renderer   # one-shot esbuild bundle of renderer/index.js -> bundle.js
npm run watch:renderer   # same, in esbuild watch mode (rebuilds on save)
npm run build            # build:renderer + electron-builder (current platform)
npm run build:win        # rimraf dist + build:renderer + electron-builder --win
npm run build:mac        # build:renderer + electron-builder --mac
npm run build:linux      # build:renderer + electron-builder --linux
npm run publish           # build:win + node scripts/publish.js (uploads installer via SFTP)
```

There is no separate "watch main process" script — after editing anything under `main/`, `main.js`, or `preload.js`, restart `npm start`. Editing files under `renderer/` only requires the bundle to rebuild (`npm run watch:renderer` in a second terminal keeps `bundle.js` fresh while `electron .` is running, though you'll still need to reload the window to pick up the new bundle).

## Coding conventions observed in this codebase

These are patterns actually used throughout `main/` and `renderer/` — follow them for consistency rather than introducing a different style in new files.

- **No semicolons** in renderer module files (`renderer/*.js`). Statement-ending semicolons are effectively absent from files like `renderer/status-bar.js`, `renderer/i18n.js`, `renderer/tooltips.js`, `renderer/messengers.js`. Match this in new renderer code.
- **CommonJS throughout**, not ES modules — `require()`/`module.exports`, everywhere in both `main/` and `renderer/`. The esbuild config (`build-renderer.js`) bundles to an IIFE, and renderer factory files are plain script-global functions, not `export`ed.
- **Factory-function pattern for renderer modules**: each `renderer/*.js` file exports one `create<Thing>Api({ ...destructuredDeps })` function that takes its dependencies as a single destructured object (no module-level singletons, no direct imports of shared mutable state — it's passed in). See `ARCHITECTURE.md` section 3 for concrete examples (`createStatusBarApi`, `createMessengersApi`, etc.). When adding a new renderer feature, follow this shape:

  ```js
  function createFooApi({ state, store, tGet /* , ...whatever you need */ }) {
      function doSomething() { /* ... */ }

      return {
          doSomething
      }
  }
  ```

  Then wire it up in `renderer.js` (or wherever the caller lives) as `const fooApi = createFooApi({ ... })`.

- **camelCase** for variables, functions, and object keys (including locale keys — see below). No `PascalCase` for functions; `PascalCase`-like factory names (`createStatusBarApi`) follow the `create<Noun>Api` convention specifically, not general PascalCase usage.
- **IPC handlers** in `main/ipc/*.js` use the `safeHandle(channel, handler)` helper pattern (remove any existing handler for the channel, then re-register) rather than calling `ipcMain.handle()` directly — see `main/ipc/extensions.js`. Handler return values follow the `{ success: true, data }` / `{ success: false, error }` shape (`main/utils/ipc.js`'s `ok()`/`fail()`/`wrapIpc()` helpers).
- **Comments in Russian** are common throughout the codebase, including explaining non-obvious workarounds (see e.g. `main/services/extensions.js:1-40`). Follow the existing language of the file/area you're editing rather than switching everything to English mid-file.

## Adding a new IPC channel

1. Add the handler in the relevant `main/ipc/*.js` file (or create a new one and register it from `main/bootstrap/registerIpc.js`).
2. Add the channel name to `preload.js`'s `validInvokeChannels` (if renderer calls it via `invoke`/`send`) or `validReceiveChannels` (if main pushes it to the renderer via `webContents.send`). **This is not optional** — without it, `window.electronAPI` silently refuses to reach the channel (see `ARCHITECTURE.md` section 1 and 4 for why this allowlist exists).

## Adding a new locale key

All UI strings are looked up via `renderer/i18n.js`'s `tGet('some.dot.path')`, which resolves the key against the active locale dictionary and falls back to the raw key string if missing. There are **7 locale files**, all under `locales/`, and a new key must be added to **all 7** or non-English/Russian users will see the raw key instead of translated text:

```
locales/en.js
locales/ru.js
locales/de.js
locales/es.js
locales/fr.js
locales/it.js
locales/zh.js
```

Steps:

1. Pick (or create) a nested section matching the feature area, e.g. `ctx.*` for context-menu items, `settings.*` for the settings panel, `modal.*` for dialogs (see `locales/en.js:1-40` for the existing shape).
2. Add the same key path with a translated string in each of the 7 files. Keep key order roughly consistent across files so diffs stay easy to review.
3. Reference it from markup with `data-i18n="section.key"` (text content), `data-i18n-placeholder="section.key"` (input placeholder), or `data-i18n-title="section.key"` (title attribute) — `applyI18n()` in `renderer/i18n.js` wires all three automatically. Alternatively call `tGet('section.key')` directly from renderer JS.
4. If the string needs interpolation, use `{paramName}` in the value and pass `{ paramName: value }` as the second argument to `tGet()`.

Do not add a new locale-loading mechanism — `renderer/i18n.js` statically `require()`s all 7 dictionaries up front (esbuild cannot bundle a dynamic `require()` with a variable path), so a new locale file would also need a new static `require()` line there, not just a new file on disk.

## Adding a new messenger definition

Built-in messengers live in the `popularMessengers` array in `renderer/constants.js`. Add a new entry in the appropriate comment-delimited group (e.g. `// ── Мессенджеры ───`, `// ── Почта ───`, `// ── Продуктивность ───`):

```js
{ name: 'ServiceName', url: 'https://service.example.com', icon: 'assets/logomessenger/servicename.png', color: '#RRGGBB' }
```

Notes:

- `icon` must point to an actual file under `assets/logomessenger/` — add the PNG there first.
- `color` is the brand accent color, used for sidebar/tab styling.
- You do **not** set an `id` here — the catalog entry's `id` is generated when a user actually adds the messenger to their list (persisted via `main/services/store.js`), and that generated `id` is what drives the per-messenger session partition `persist:${messenger.id}` (see `ARCHITECTURE.md` section 2). If you're changing how `id` itself is generated, check every file listed there — the partition string is derived independently in ~8 places, not from one shared helper.
- If the service should be localized in the "Add messenger" catalog UI or elsewhere, follow the "Adding a new locale key" section above.

## Linting / formatting

No ESLint or Prettier configuration exists in this repository at the moment (no `eslint.config.js`, `.eslintrc*`, or `.prettierrc*` found at the repo root). There is currently no `npm run lint` or `npm run format` script. Match the surrounding code style manually (see "Coding conventions" above) until tooling is added — if you add ESLint/Prettier config, update this section with the actual commands.

## Changelog

The in-app version history (`#changelogPopup` in `index.html`) is the source of truth for what shipped in each release, shown to end users inside the app. `CHANGELOG.md` at the repo root is a technical companion transcribed from it. When you ship a user-facing change that will be called out in a release, add it to both:

1. A new `<div class="changelog-entry">` block in `index.html`'s `#changelogPopup` (Russian, matching the existing entries' tone/format).
2. A matching entry in `CHANGELOG.md` under `[Unreleased]` (or a new version heading at release time).
