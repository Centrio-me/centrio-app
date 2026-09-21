# Mobile Companion — Backend Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the minimal, additive backend surface the Centrio mobile companion app needs — personal unread-summary storage, a per-device-type session limit, and mobile-native Google/Yandex login endpoints — without touching any existing desktop/web behavior.

**Architecture:** Three independent additions to the existing Express + Prisma API at `/var/www/centrio-api` (deployed from this repo's `landing/*.js` files via `scripts/deploy-backend.js`): (1) a new `UnreadSummary` Prisma model + route pair, modeled directly on the existing `OrgMessengerStat` pattern but scoped to a single user instead of an org; (2) an `isMobile` flag on `Session` so mobile logins get their own device-count slot instead of competing with the desktop/web slot; (3) two new POST endpoints (`/api/auth/google/mobile`, `/api/auth/yandex/mobile`) that verify a provider token the mobile app obtained itself, mirroring the existing `/google/electron-code` / `/yandex/electron` desktop patterns.

**Tech Stack:** Node.js, Express, Prisma 5.22, PostgreSQL. No test framework exists in this backend (`npm test` is a stub) — this plan follows the codebase's actual existing convention of `node --check` + live curl verification after deploy (see `scripts/deploy-backend.js`'s own health-check curl), not a fabricated test suite.

**Spec:** [C:\CentrioMobile\docs\superpowers\specs\2026-09-21-mobile-companion-v1-design.md](C:\CentrioMobile\docs\superpowers\specs\2026-09-21-mobile-companion-v1-design.md), sections "Backend changes required" (1-4).

## Global Constraints

- Server: `31.128.44.165`, deploy user `root` via SSH key `~/.ssh/id_ed25519_centrio`, app runs as `webapps` under pm2 as `centrio-api`, code root `/var/www/centrio-api`.
- Every deployed route file must pass `node --check` before `pm2 restart` (existing gate in `scripts/deploy-backend.js` — do not bypass it).
- No CORS changes needed anywhere in this plan — CORS is a browser mechanism; a native Android/iOS app's HTTP client is not subject to it.
- This backend has exactly one environment (production) — there is no separate dev/staging database. Every migration step in this plan runs directly against production data. All schema changes here are additive only (new table, new column with a default) — safe, non-locking, backward compatible — but treat the migration step with the care due any live production DB change.
- `generateRefreshToken`'s existing 3-argument call sites (every desktop/web login path already in the codebase) must keep working unchanged — the new 4th parameter (`isMobile`) must default to `false`.

---

### Task 1: `UnreadSummary` model + `Session.isMobile` column (Prisma migration)

**Files:**
- Create: `server-src/prisma/schema.prisma` (new local mirror of the server's live schema — this project has never kept one locally; every other schema edit to date has been made directly over SSH, which is what made this exact investigation slower during planning. Establishing the mirror here is a one-time, in-scope fix.)
- Modify (on server, via this local file): `/var/www/centrio-api/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma model `UnreadSummary { id, userId (unique), total: Int, byMessenger: Json, updatedAt }`, accessible in route code as `prisma.unreadSummary`. Produces `Session.isMobile: Boolean` (default `false`), accessible as `session.isMobile` / filterable via `prisma.session.findMany({ where: { isMobile: ... } })`. Both are consumed by Task 2 and Task 3.

- [ ] **Step 1: Fetch the live schema into the new local mirror**

```bash
mkdir -p server-src/prisma
ssh -i ~/.ssh/id_ed25519_centrio root@31.128.44.165 "cat /var/www/centrio-api/prisma/schema.prisma" > server-src/prisma/schema.prisma
```

Expected: `server-src/prisma/schema.prisma` now contains the full live schema (should end with the `DownloadStat` model — confirm with `tail -15 server-src/prisma/schema.prisma`).

- [ ] **Step 2: Add `isMobile` to the `Session` model**

In `server-src/prisma/schema.prisma`, find:

```prisma
model Session {
  id           String   @id @default(uuid())
  userId       String
  refreshToken String   @unique
  deviceInfo   String?
  ipAddress    String?
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

Replace with:

```prisma
model Session {
  id           String   @id @default(uuid())
  userId       String
  refreshToken String   @unique
  deviceInfo   String?
  ipAddress    String?
  // Mobile companion app sessions get their own device-count slot (see
  // utils/tokens.js MOBILE_DEVICE_LIMIT), independent of the existing
  // plan-based desktop/web MAX_DEVICES limit — logging into the mobile app
  // must never evict a FREE-plan user's only desktop session, or vice versa.
  isMobile     Boolean  @default(false)
  expiresAt    DateTime
  createdAt    DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 3: Add the `UnreadSummary` model**

In the same file, immediately after the `SyncSettings` model, add:

```prisma
// Personal unread-summary snapshot for the mobile companion app's Feed
// screen. Deliberately separate from the sync.js Messenger/Folder tables
// (those are deleteMany+recreated wholesale on every structural sync;
// unread counts change far more often and independently of messenger
// config). One row per user, upserted by the desktop app whenever its own
// local unread state changes — see renderer/unread.js updateUnreadCount().
// Modeled on OrgMessengerStat below, minus the org scoping.
model UnreadSummary {
  id          String   @id @default(uuid())
  userId      String   @unique
  total       Int      @default(0)
  byMessenger Json     @default("[]")
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 4: Add the inverse relation field on `User`**

Find the `User` model's relation list:

```prisma
  sessions         Session[]
  usageStats       UsageStat[]
  payments         Payment[]
```

Replace with:

```prisma
  sessions         Session[]
  usageStats       UsageStat[]
  payments         Payment[]
  unreadSummary    UnreadSummary?
```

- [ ] **Step 5: Upload the edited schema and run the migration**

```bash
scp -i ~/.ssh/id_ed25519_centrio server-src/prisma/schema.prisma root@31.128.44.165:/var/www/centrio-api/prisma/schema.prisma
ssh -i ~/.ssh/id_ed25519_centrio root@31.128.44.165 "cd /var/www/centrio-api && npx prisma migrate dev --name add_unread_summary_and_mobile_sessions"
```

Expected output ends with `Your database is now in sync with your schema` (or the migrate-dev equivalent success message) and a new folder under `/var/www/centrio-api/prisma/migrations/` timestamped today.

- [ ] **Step 6: Verify the migration applied and the Prisma Client regenerated**

```bash
ssh -i ~/.ssh/id_ed25519_centrio root@31.128.44.165 "cd /var/www/centrio-api && npx prisma migrate status && node -e \"const p=require('./node_modules/.prisma/client'); console.log(typeof p.PrismaClient)\""
```

Expected: `Database schema is up to date!` and `function` printed (confirms the generated client module loads without error after the schema change).

- [ ] **Step 7: Commit the new local schema mirror**

```bash
git add server-src/prisma/schema.prisma
git commit -m "chore: mirror live Prisma schema locally, add UnreadSummary + Session.isMobile

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Per-device-type session limit in `utils/tokens.js`

**Files:**
- Modify: `server-src/utils/tokens.js` (local mirror — deployed to `/var/www/centrio-api/src/utils/tokens.js` via `scripts/deploy-backend.js`, already in its `UPLOADS` list)

**Interfaces:**
- Consumes: `prisma.session`, `prisma.user` (Task 1's `isMobile` column must already be migrated).
- Produces: `generateRefreshToken(userId, deviceInfo, ipAddress, isMobile = false)` — the 4th parameter is new and optional; every existing 3-argument call site across `auth-server.js` keeps working unchanged. `refreshTokens(refreshToken, deviceInfo, ipAddress)` — signature unchanged, but now internally preserves the original session's `isMobile` flag across a refresh. Both consumed by Task 4's new mobile auth routes and by every existing auth route unchanged.

- [ ] **Step 1: Replace `generateRefreshToken` with the device-type-aware version**

In `server-src/utils/tokens.js`, replace the whole function (from `// Лимит активных устройств...` through its closing `}`, i.e. everything between `generateAccessToken` and `refreshTokens`):

```javascript
// Лимит активных устройств (сессий) по плану — применяется только к
// НЕ-мобильным сессиям (desktop/web). Мобильный компаньон получает
// отдельный, фиксированный слот (MOBILE_DEVICE_LIMIT) независимо от
// тарифа — вход в мобильное приложение не должен вытеснять единственную
// разрешённую FREE-пользователю десктопную сессию, и наоборот.
const MAX_DEVICES = { FREE: 1, PRO: 5, TEAM: 5 }
const MOBILE_DEVICE_LIMIT = 1

// Генерация refresh токена (30 дней)
const generateRefreshToken = async (userId, deviceInfo, ipAddress, isMobile = false) => {
  const token = uuidv4()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  // Удаляем предыдущие сессии с таким же deviceInfo И тем же типом
  // устройства (одно устройство — одна сессия того же типа)
  if (deviceInfo) {
    await prisma.session.deleteMany({
      where: { userId, deviceInfo, isMobile }
    })
  }

  if (isMobile) {
    const activeMobileSessions = await prisma.session.findMany({
      where: { userId, isMobile: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (activeMobileSessions.length >= MOBILE_DEVICE_LIMIT) {
      const excess = activeMobileSessions.length - MOBILE_DEVICE_LIMIT + 1
      const toRemove = activeMobileSessions.slice(0, excess).map(s => s.id)
      await prisma.session.deleteMany({ where: { id: { in: toRemove } } })
    }
  } else {
    // Ограничение по количеству устройств в зависимости от плана.
    // При превышении лимита освобождаем место, удаляя самые старые сессии
    // (пользователь просто "перелогинивается" на новом устройстве, старое отваливается).
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true } })
    const limit = MAX_DEVICES[user?.plan] || MAX_DEVICES.FREE

    const activeSessions = await prisma.session.findMany({
      where: { userId, isMobile: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true }
    })

    if (activeSessions.length >= limit) {
      const excess = activeSessions.length - limit + 1
      const toRemove = activeSessions.slice(0, excess).map(s => s.id)
      await prisma.session.deleteMany({ where: { id: { in: toRemove } } })
    }
  }

  await prisma.session.create({
    data: {
      userId,
      refreshToken: token,
      deviceInfo,
      ipAddress,
      isMobile,
      expiresAt
    }
  })

  // Обновить lastSeenAt пользователя
  await prisma.user.update({
    where: { id: userId },
    data: { lastSeenAt: new Date() }
  })

  return token
}
```

- [ ] **Step 2: Make `refreshTokens` preserve the original session's device type**

Find:

```javascript
  // Создаём новые токены
  const newAccessToken = generateAccessToken(session.userId)
  const newRefreshToken = await generateRefreshToken(session.userId, deviceInfo, ipAddress)
```

Replace with:

```javascript
  // Создаём новые токены — сохраняем тип устройства исходной сессии
  // (мобильная сессия остаётся мобильной при обновлении токена, и
  // наоборот), иначе refresh со стороны мобильного приложения начал бы
  // конкурировать за десктопный лимит устройств.
  const newAccessToken = generateAccessToken(session.userId)
  const newRefreshToken = await generateRefreshToken(session.userId, deviceInfo, ipAddress, session.isMobile)
```

- [ ] **Step 3: Syntax-check locally**

```bash
node --check server-src/utils/tokens.js
```

Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add server-src/utils/tokens.js
git commit -m "feat: give mobile app sessions their own device-count slot

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

(Not deployed yet — deploy happens once in Task 5 alongside every other changed file, via the existing `scripts/deploy-backend.js`.)

---

### Task 3: `/api/unread-summary` route

**Files:**
- Create: `landing/unread-server.js` (deployed to `/var/www/centrio-api/src/routes/unread.js`)
- Modify: `landing/api-index-server.js:51` (mount the new route)
- Modify: `scripts/deploy-backend.js` (add both new files to `UPLOADS`)

**Interfaces:**
- Consumes: `authMiddleware` (`../middleware/auth`, sets `req.user.id`), `prisma.unreadSummary` (Task 1).
- Produces: `POST /api/unread-summary` and `GET /api/unread-summary`, both Bearer-authenticated. Consumed by Task 4 of the **desktop** plan (`POST`) and by the mobile app's `UnreadRepository` (Task in the mobile plan) (`GET`).

- [ ] **Step 1: Write the route file**

Create `landing/unread-server.js`:

```javascript
const router = require('express').Router()
const authMiddleware = require('../middleware/auth')
const prisma = require('../utils/prisma')

// POST /api/unread-summary — Electron pushes the user's own personal
// unread summary (see renderer/assistant-tools.js get_unread_summary() for
// the client-side shape this mirrors: { total, byMessenger: [{id,name,unread}] }).
// Deliberately separate from POST /api/sync, which deleteMany+recreates
// Messenger/Folder/Workspace config rows on every call — bolting a
// constantly-changing counter onto that would mean either re-syncing config
// on every unread change, or always sending full config alongside a highly
// frequent counter push. One row per user, upserted.
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { total, byMessenger } = req.body || {}
    if (typeof total !== 'number' || !Array.isArray(byMessenger)) {
      return res.status(400).json({ error: 'total (number) и byMessenger (array) обязательны' })
    }

    const sanitizedTotal = Math.max(0, Math.floor(total))
    const sanitizedByMessenger = byMessenger.slice(0, 200).map(m => ({
      id: String(m?.id ?? '').slice(0, 200),
      name: String(m?.name ?? '').slice(0, 100),
      unread: Math.max(0, Math.floor(Number(m?.unread) || 0))
    }))

    await prisma.unreadSummary.upsert({
      where: { userId: req.user.id },
      create: { userId: req.user.id, total: sanitizedTotal, byMessenger: sanitizedByMessenger },
      update: { total: sanitizedTotal, byMessenger: sanitizedByMessenger }
    })

    res.json({ message: 'Сводка непрочитанных обновлена' })
  } catch (err) {
    console.error('Unread summary push error:', err)
    res.status(500).json({ error: 'Ошибка сохранения сводки непрочитанных' })
  }
})

// GET /api/unread-summary — mobile app reads the last snapshot the desktop
// app pushed. Returns a zeroed default (never 404) when nothing has been
// pushed yet — e.g. a brand-new account, or one whose desktop app predates
// this feature — so the mobile Feed screen always has a well-formed
// response to render instead of needing its own "not found" branch.
router.get('/', authMiddleware, async (req, res) => {
  try {
    const summary = await prisma.unreadSummary.findUnique({ where: { userId: req.user.id } })
    res.json({
      total: summary?.total || 0,
      byMessenger: summary?.byMessenger || [],
      updatedAt: summary?.updatedAt || null
    })
  } catch (err) {
    console.error('Unread summary get error:', err)
    res.status(500).json({ error: 'Ошибка получения сводки непрочитанных' })
  }
})

module.exports = router
```

- [ ] **Step 2: Mount the route**

In `landing/api-index-server.js`, find:

```javascript
app.use('/api/sync', require('./routes/sync'))
```

Replace with:

```javascript
app.use('/api/sync', require('./routes/sync'))
app.use('/api/unread-summary', require('./routes/unread'))
```

- [ ] **Step 3: Add both files to the deploy script**

In `scripts/deploy-backend.js`, find:

```javascript
    { local: path.join(__dirname, '..', 'landing', 'stats-route.js'),           remote: `${REMOTE_BASE}/src/routes/stats.js` },
```

Add immediately after it:

```javascript
    { local: path.join(__dirname, '..', 'landing', 'unread-server.js'),        remote: `${REMOTE_BASE}/src/routes/unread.js` },
```

- [ ] **Step 4: Syntax-check locally**

```bash
node --check landing/unread-server.js
node --check landing/api-index-server.js
node --check scripts/deploy-backend.js
```

Expected: no output, exit code 0 for all three.

- [ ] **Step 5: Commit**

```bash
git add landing/unread-server.js landing/api-index-server.js scripts/deploy-backend.js
git commit -m "feat: add /api/unread-summary route for mobile companion feed

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Mobile-native Google/Yandex login + login-header device typing

**Files:**
- Modify: `landing/auth-server.js`

**Interfaces:**
- Consumes: `generateAccessToken`, `generateRefreshToken` (Task 2), `googleWebClient` (already defined at the top of this file), `getOrgSummaryForUser`, `sendWelcomeEmail`, `recordLoginEvent` (all already defined/imported in this file).
- Produces: `POST /api/auth/google/mobile` (body `{ idToken }`), `POST /api/auth/yandex/mobile` (body `{ accessToken }`) — both return `{ user, accessToken, refreshToken }` on success, matching the shape of every other OAuth JSON endpoint in this file. `POST /api/auth/login` now honors an `X-Client-Platform: mobile` header to flag the created session as mobile. Consumed by the mobile app's `AuthRepository` (mobile plan).

- [ ] **Step 1: Add mobile device detection to `/login`**

Find:

```javascript
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Неверный email или пароль' })
    if (!user.isActive) return res.status(403).json({ error: 'Аккаунт заблокирован' })
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) return res.status(401).json({ error: 'Неверный email или пароль' })
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip)
```

Replace with:

```javascript
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Неверный email или пароль' })
    if (!user.isActive) return res.status(403).json({ error: 'Аккаунт заблокирован' })
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) return res.status(401).json({ error: 'Неверный email или пароль' })
    // Мобильное приложение шлёт этот заголовок на login — см. AuthRepository
    // в мобильном репозитории. Веб/десктоп его не отправляют, поэтому их
    // поведение не меняется (isMobile остаётся false).
    const isMobile = req.headers['x-client-platform'] === 'mobile'
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, isMobile)
```

- [ ] **Step 2: Add the mobile Google endpoint**

Find the end of the `/google/electron-code` handler (its closing `})` followed by the `// ===== YANDEX =====` comment):

```javascript
router.post('/google/electron-code', async (req, res) => {
  // ... existing body, unchanged ...
})

// ===== YANDEX =====
```

Insert a new route between them:

```javascript
// ===== GOOGLE (mobile) =====
// Flutter's google_sign_in plugin, configured with serverClientId =
// GOOGLE_CLIENT_ID (the same "Web" OAuth client the browser flow above
// already uses), returns an idToken audienced to that client directly — no
// authorization-code exchange needed, unlike the desktop's
// /google/electron-code flow above. Requires the Android app's SHA-1
// fingerprint to be registered against this OAuth client in Google Cloud
// Console (a one-time console step, not code — see the mobile app's own
// setup docs).
router.post('/google/mobile', async (req, res) => {
  try {
    const { idToken } = req.body
    if (!idToken) return res.status(400).json({ error: 'idToken обязателен' })
    const ticket = await googleWebClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID })
    const payload = ticket.getPayload()
    const { sub: googleId, email, name, picture } = payload
    let user = await prisma.user.findFirst({ where: { OR: [{ googleId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar: picture, googleId, emailVerified: true } })
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.googleId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { googleId, avatar: picture } })
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, true)
    recordLoginEvent(user.id, 'google', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Google mobile error:', err)
    res.status(401).json({ error: 'Ошибка Google авторизации' })
  }
})

// ===== YANDEX =====
```

- [ ] **Step 3: Add the mobile Yandex endpoint**

Find the end of the `/yandex/electron` handler (its closing `})` followed by the `// ===== GITHUB =====` comment):

```javascript
router.post('/yandex/electron', async (req, res) => {
  // ... existing body, unchanged ...
})

// ===== GITHUB =====
```

Insert a new route between them:

```javascript
// ===== YANDEX (mobile) =====
// Mirrors /yandex/electron exactly: the Flutter app runs Yandex's implicit
// grant flow itself (system browser via flutter_web_auth_2, hitting
// oauth.yandex.ru/authorize?response_type=token with the mobile app's own
// registered redirect URI — a Yandex OAuth console setting, not code) and
// hands the resulting Yandex accessToken here for verification.
router.post('/yandex/mobile', async (req, res) => {
  try {
    const { accessToken: yandexToken } = req.body
    if (!yandexToken) return res.status(400).json({ error: 'accessToken обязателен' })
    const userRes = await axios.get('https://login.yandex.ru/info', {
      headers: { Authorization: `OAuth ${yandexToken}` }, params: { format: 'json' }
    })
    const { id: yandexId, default_email: email, real_name: name, default_avatar_id } = userRes.data
    const avatar = default_avatar_id ? `https://avatars.yandex.net/get-yapic/${default_avatar_id}/islands-200` : null
    let user = await prisma.user.findFirst({ where: { OR: [{ yandexId }, { email }] } })
    if (!user) {
      user = await prisma.user.create({ data: { email, name, avatar, yandexId, emailVerified: true } })
      sendWelcomeEmail(user).catch(e => console.error('[email] welcome send failed:', e.message))
    } else if (!user.yandexId) {
      user = await prisma.user.update({ where: { id: user.id }, data: { yandexId, avatar } })
    }
    const accessToken  = generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id, req.headers['user-agent'], req.ip, true)
    recordLoginEvent(user.id, 'yandex', req)
    const orgSummary = await getOrgSummaryForUser(user.id).catch(e => { console.error('[org] summary lookup failed:', e.message); return null })
    res.json({ user: { id: user.id, email: user.email, name: user.name, avatar: user.avatar, plan: user.plan, orgSummary }, accessToken, refreshToken })
  } catch (err) {
    console.error('Yandex mobile error:', err)
    res.status(401).json({ error: 'Ошибка Яндекс авторизации' })
  }
})

// ===== GITHUB =====
```

- [ ] **Step 4: Syntax-check locally**

```bash
node --check landing/auth-server.js
```

Expected: no output, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add landing/auth-server.js
git commit -m "feat: add mobile-native Google/Yandex login endpoints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Deploy and live-verify

**Files:** none (deploy + verification only)

**Interfaces:**
- Consumes: everything produced by Tasks 1-4.
- Produces: a live, working backend for the mobile app's implementation plan to build against.

- [ ] **Step 1: Run the deploy script**

```bash
node scripts/deploy-backend.js
```

Expected: uploads every file in `UPLOADS` (now including `unread-server.js` and `schema.prisma` is NOT in this list — it was already migrated directly in Task 1, deploy-backend.js only handles route/lib files, not schema), ends with `ALL_SYNTAX_OK`, then `✅ Backend deploy done.`

- [ ] **Step 2: Verify `/api/unread-summary` round-trips**

Requires a real test account's access token — obtain one via the existing login endpoint with a known test account (substitute real test credentials):

```bash
TOKEN=$(curl -s -X POST https://api.centrio.me/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_TEST_ACCOUNT_EMAIL","password":"YOUR_TEST_ACCOUNT_PASSWORD"}' \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")

curl -s -X POST https://api.centrio.me/api/unread-summary \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"total":3,"byMessenger":[{"id":"tg-1","name":"Telegram","unread":3}]}'

curl -s https://api.centrio.me/api/unread-summary -H "Authorization: Bearer $TOKEN"
```

Expected: POST returns `{"message":"Сводка непрочитанных обновлена"}`; GET returns `{"total":3,"byMessenger":[{"id":"tg-1","name":"Telegram","unread":3}],"updatedAt":"<ISO timestamp>"}`.

- [ ] **Step 3: Verify the mobile device slot doesn't evict the desktop slot**

Using the same test account (set to FREE plan for the strictest test), log in once with the ordinary login endpoint (simulating desktop), then again with the mobile header, then confirm the first refresh token still works:

```bash
DESKTOP_REFRESH=$(curl -s -X POST https://api.centrio.me/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"YOUR_TEST_ACCOUNT_EMAIL","password":"YOUR_TEST_ACCOUNT_PASSWORD"}' \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).refreshToken))")

curl -s -X POST https://api.centrio.me/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Client-Platform: mobile' \
  -d '{"email":"YOUR_TEST_ACCOUNT_EMAIL","password":"YOUR_TEST_ACCOUNT_PASSWORD"}' > /dev/null

curl -s -X POST https://api.centrio.me/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"$DESKTOP_REFRESH\"}"
```

Expected: the final `refresh` call succeeds (`{"accessToken":"...","refreshToken":"..."}`), proving the mobile login did NOT evict the desktop session — before this plan's changes, on a FREE-plan account, this would have returned `401 {"error":"Refresh токен недействителен или истёк"}`.

- [ ] **Step 4: No commit needed** — this task is verification-only; Tasks 1-4 are already committed.
