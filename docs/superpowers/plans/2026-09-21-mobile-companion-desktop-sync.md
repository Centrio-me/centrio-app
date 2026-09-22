# Mobile Companion — Desktop Unread Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop Electron app push a personal unread-message summary to the server whenever its own local unread state changes, so the mobile companion app's Feed screen has something real to read.

**Architecture:** Hook into the single existing choke point where the desktop already recomputes its unread state (`renderer/unread.js`'s `updateUnreadCount()`), add a debounced call through a new `cloudPushUnreadSummary()` transport function (mirroring the existing `cloudSyncPush()` pattern in `renderer/cloud.js`), which invokes a new main-process IPC handler that calls the new `POST /api/unread-summary` endpoint (already deployed by the companion backend plan). No new timers, no new event wiring — reuses the existing debounce mechanism already in place for the exact same underlying state change.

**Tech Stack:** Electron (main + renderer processes), existing IPC (`ipcMain.handle`/`ipcRenderer.invoke`) and esbuild bundling already used throughout this app.

**Spec:** [C:\CentrioMobile\docs\superpowers\specs\2026-09-21-mobile-companion-v1-design.md](C:\CentrioMobile\docs\superpowers\specs\2026-09-21-mobile-companion-v1-design.md), section "Backend changes required → 4. Desktop-side hook point".

**Depends on:** [2026-09-21-mobile-companion-backend.md](2026-09-21-mobile-companion-backend.md) — `POST /api/unread-summary` must already be deployed and working (verified in that plan's Task 5) before Task 4 of this plan can be smoke-tested end-to-end. Tasks 1-3 of this plan can be written and committed independently of that.

## Global Constraints

- This app has no automated test suite (`npm test`/`__tests__` do not exist in this repo) — verification in this plan is manual, running the app locally and observing network requests/logs, matching how every other feature in this codebase has always been verified.
- `C:\MessengerApps` currently has many unrelated uncommitted changes from other in-progress work (see `git status`). Every commit in this plan must `git add` only the exact files this plan touches — never `git add -A` or `git add .`.
- Never use `await import()` in renderer code — esbuild's IIFE bundling doesn't resolve dynamic ESM here (existing project convention, see `renderer/` codebase-wide). Use `require()`.
- This plan does NOT build or ship a new installer/release — it only edits source and rebuilds `bundle.js` for local verification. Shipping a new Centrio version is a separate, explicit decision the user makes later (see the project's documented deploy workflow), out of scope here.

---

### Task 1: `pushUnreadSummary` API client method + main-process IPC handler

**Files:**
- Modify: `api.js` (root-level API client — after `syncPull`)
- Modify: `main/ipc/api.js` (after the `api-sync-pull` handler)

**Interfaces:**
- Produces: `api.pushUnreadSummary(token, total, byMessenger)` → `POST /api/unread-summary`. Produces IPC channel `api-unread-push(token, total, byMessenger)`. Consumed by Task 2 (`renderer/cloud.js`).

- [ ] **Step 1: Add the client method**

In `api.js`, find:

```javascript
    syncPull(token) {
        return request('GET', '/api/sync', null, token)
    },
```

Add immediately after it:

```javascript
    // Personal unread-summary push for the mobile companion app's Feed
    // screen — see renderer/unread.js scheduleUnreadSummaryPush() for the
    // caller and docs/superpowers/plans/2026-09-21-mobile-companion-backend.md
    // for the server side.
    pushUnreadSummary(token, total, byMessenger) {
        return request('POST', '/api/unread-summary', { total, byMessenger }, token)
    },
```

- [ ] **Step 2: Add the IPC handler**

In `main/ipc/api.js`, find:

```javascript
    ipcMain.handle('api-sync-pull', async (event, token) => {
        return wrapApi(() => api.syncPull(token))
    })
```

Add immediately after it:

```javascript
    ipcMain.handle('api-unread-push', async (event, token, total, byMessenger) => {
        return wrapApi(() => api.pushUnreadSummary(token, total, byMessenger))
    })
```

- [ ] **Step 3: Verify no syntax errors**

```bash
node --check api.js
node --check main/ipc/api.js
```

Expected: no output, exit code 0 for both.

- [ ] **Step 4: Commit**

```bash
git add api.js main/ipc/api.js
git commit -m "feat: add unread-summary push IPC channel and API client method

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `cloudPushUnreadSummary()` transport in `renderer/cloud.js`

**Files:**
- Modify: `renderer/cloud.js`

**Interfaces:**
- Consumes: `api-unread-push` IPC channel (Task 1), `authorizedInvoke` (already defined in this file, handles token refresh on 401 the same way `cloudSyncPush` does), `cloudStore.getToken()` (already defined).
- Produces: `cloudPushUnreadSummary(total, byMessenger)` → `Promise<{success: boolean, ...}>`. Consumed by Task 3 (`renderer/unread.js`), passed in from `renderer.js` (Task 3).

- [ ] **Step 1: Add the function**

In `renderer/cloud.js`, find:

```javascript
    async function cloudSyncPull() {
```

Insert a new function immediately before it:

```javascript
    async function cloudPushUnreadSummary(total, byMessenger) {
        try {
            if (!cloudStore.getToken()) {
                return {
                    success: false,
                    error: 'Not authenticated',
                    code: 'unauthorized'
                }
            }

            return await authorizedInvoke('api-unread-push', total, byMessenger)
        } catch (e) {
            console.error('cloudPushUnreadSummary error:', e)
            return {
                success: false,
                error: e?.message || 'Unread summary push failed'
            }
        }
    }

    async function cloudSyncPull() {
```

- [ ] **Step 2: Export it**

Find:

```javascript
    return {
        cloudRefreshToken,
        cloudSyncPush,
        cloudSyncPull,
```

Replace with:

```javascript
    return {
        cloudRefreshToken,
        cloudSyncPush,
        cloudSyncPull,
        cloudPushUnreadSummary,
```

- [ ] **Step 3: Verify no syntax errors**

```bash
node --check renderer/cloud.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add renderer/cloud.js
git commit -m "feat: add cloudPushUnreadSummary transport function

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Hook into `updateUnreadCount()` and wire it up in `renderer.js`

**Files:**
- Modify: `renderer/unread.js`
- Modify: `renderer.js:885-892` (the `createUnreadApi({...})` call site)

**Interfaces:**
- Consumes: `pushUnreadSummary` (new dependency — `cloudApi.cloudPushUnreadSummary` from Task 2), `state.activeMessengers`, `getEffectiveUnreadCount()` (both already available inside this module).
- Produces: debounced live calls to `POST /api/unread-summary` (via Task 1-2) whenever the desktop's own unread state settles.

- [ ] **Step 1: Accept the new dependency and add the debounced push function**

In `renderer/unread.js`, find:

```javascript
function createUnreadApi({
    state,
    store,
    tGet,
    ipcRenderer,
    updateStatusBar,
    updateFolderBadge
}) {
    function isMessengerMuted(id) {
        return state.globalMuteAll || state.mutedMessengers[id] === true
    }
```

Replace with:

```javascript
function createUnreadApi({
    state,
    store,
    tGet,
    ipcRenderer,
    updateStatusBar,
    updateFolderBadge,
    pushUnreadSummary
}) {
    function isMessengerMuted(id) {
        return state.globalMuteAll || state.mutedMessengers[id] === true
    }

    let unreadSummaryPushTimer = null
    const UNREAD_SUMMARY_PUSH_DEBOUNCE_MS = 4000

    // Debounced separately from the per-messenger 250ms stabilize timer in
    // updateUnreadCount() below — a burst of several messengers updating in
    // the same second (e.g. on reconnect) would otherwise fire one network
    // push per messenger. This coalesces any such burst into a single
    // POST /api/unread-summary once things settle, for the mobile companion
    // app's Feed screen. Fire-and-forget by design (same rationale as the
    // tray badge update right above its call site): a network hiccup here
    // must never block or affect the local UI, which already updated.
    function scheduleUnreadSummaryPush() {
        if (typeof pushUnreadSummary !== 'function') return
        clearTimeout(unreadSummaryPushTimer)
        unreadSummaryPushTimer = setTimeout(() => {
            const byMessenger = state.activeMessengers
                .map(m => ({ id: m.id, name: m.name, unread: getEffectiveUnreadCount(m.id) }))
                .filter(m => m.unread > 0)
            const total = byMessenger.reduce((sum, m) => sum + m.unread, 0)
            pushUnreadSummary(total, byMessenger)
        }, UNREAD_SUMMARY_PUSH_DEBOUNCE_MS)
    }
```

- [ ] **Step 2: Call it from `updateUnreadCount()`**

Find:

```javascript
            const settings = store.get('settings', {})
            const count = settings.trayBadge === false ? 0 : totalUnread
            ipcRenderer.send('update-badge', count)
            ipcRenderer.send('tray:update-menu', count)
            updateStatusBar()
        }, 250)
    }
```

Replace with:

```javascript
            const settings = store.get('settings', {})
            const count = settings.trayBadge === false ? 0 : totalUnread
            ipcRenderer.send('update-badge', count)
            ipcRenderer.send('tray:update-menu', count)
            updateStatusBar()
            scheduleUnreadSummaryPush()
        }, 250)
    }
```

- [ ] **Step 3: Wire the dependency in `renderer.js`**

In `renderer.js`, find:

```javascript
    const unreadApi = createUnreadApi({
        state,
        store,
        tGet,
        ipcRenderer,
        updateStatusBar,
        updateFolderBadge: (...args) => updateFolderBadge(...args)
    })
```

Replace with:

```javascript
    const unreadApi = createUnreadApi({
        state,
        store,
        tGet,
        ipcRenderer,
        updateStatusBar,
        updateFolderBadge: (...args) => updateFolderBadge(...args),
        pushUnreadSummary: cloudApi.cloudPushUnreadSummary
    })
```

(`cloudApi` is already in scope here — it's created earlier in the same function, at `renderer.js:637`, well before this call site at `renderer.js:885`.)

- [ ] **Step 4: Verify no syntax errors**

```bash
node --check renderer/unread.js
node --check renderer.js
```

Expected: no output, exit code 0 for both.

- [ ] **Step 5: Commit**

```bash
git add renderer/unread.js renderer.js
git commit -m "feat: push personal unread summary to server on unread state change

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Build and manually verify locally

**Files:** none (build + manual verification only)

**Interfaces:**
- Consumes: everything produced by Tasks 1-3, plus the live `POST /api/unread-summary` endpoint from the backend plan.

- [ ] **Step 1: Rebuild the renderer bundle**

```bash
npm run build:renderer
```

Expected: completes without errors, `bundle.js` timestamp updates.

- [ ] **Step 2: Run the app and generate an unread message**

```bash
npm start
```

Log into a Centrio account with at least one messenger configured, then trigger a new unread message in one of the configured services (or use the existing dev/test messenger tile if one exists) so `updateUnreadCount()` fires.

- [ ] **Step 3: Confirm the push fires and succeeds**

Open DevTools in the running app (existing app convention — check `main/` for how DevTools is toggled, e.g. a menu item or shortcut already wired up) and watch the Network tab for a request to `/api/unread-summary` appearing roughly `UNREAD_SUMMARY_PUSH_DEBOUNCE_MS` (4s) after the unread count changes, with status `200`.

Cross-check directly against the API:

```bash
TOKEN=$(node -e "
const Store = require('electron-store');
// Adjust to however this app's store is actually read outside Electron if needed —
// simplest is to copy the access token from DevTools > Application > the app's
// config file, or from the Network tab request's Authorization header directly.
")
curl -s https://api.centrio.me/api/unread-summary -H "Authorization: Bearer $TOKEN"
```

(Simplest in practice: copy the `Authorization` header value straight out of the DevTools Network tab request captured in this step, rather than trying to read the encrypted local store from a standalone script.)

Expected: the GET response's `total`/`byMessenger` matches what the desktop UI is currently showing (tray badge count, sidebar badges).

- [ ] **Step 4: No commit needed** — this task is manual verification only; Tasks 1-3 are already committed.
