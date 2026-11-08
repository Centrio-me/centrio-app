# TEAM Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a TEAM owner order (strict mode), live visibility (presence board), levers (remote commands, notes), work hours with reports, and a real wipe on dismissal — across the API, the desktop app and the site's team admin.

**Architecture:** The API gets an in-process event bus with a per-org SSE stream, presence beats rolled up per day, and per-device commands confirmed by device key. The desktop opens that stream from the main process, applies strict mode in the renderer and navigation lock in the main process, sends presence every 30 s and executes commands. The site admin `/team` gets «Сейчас» and «Отчёты» tabs and the controls. The TEAM sales page is a separate plan written after this one ships (spec goal 7).

**Tech Stack:** Node/Express 5 + Prisma/Postgres (pm2 single fork) · Electron 39 desktop (CommonJS, esbuild `npm run build:renderer`) · Next.js site · `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-08-team-control-design.md`

## Global Constraints

- Server code is NOT in git today; this plan authors new server modules under `server-src/src/` in this repo and copies them to `/var/www/centrio-api/src/` (ssh `-i ~/.ssh/id_ed25519_centrio root@5.42.110.20`), each edited live file backed up as `<file>.bak-teamctl-<timestamp>` first; restart with `sudo -u webapps -H pm2 restart centrio-api --update-env`.
- Site source of truth is `/var/www/centrio-web` on the server; deploy through a copy (`/var/www/centrio-web-tmp`, `cp -al node_modules`, `npx next build --webpack` as webapps, check on a free port — 3099 is taken — then swap dirs and `pm2 restart centrio-web`).
- Prisma schema changes on production only after the owner's yes (Task 1 asks once).
- Never collect message content, screenshots or input; presence carries only: app open, idle seconds bucket, front team messenger id, unread per team messenger.
- Reaction time is named «время реакции», never «время ответа».
- Data retention: raw presence 7 days, daily rollups 90 days.
- Default time zone `Europe/Moscow`; one schedule per team.
- Strict mode default: `false` for existing members, `true` for members joining after release.
- Desktop strings in all 7 locales (ru en de es fr it zh); site strings in the languages `/team` has today. Geist, no emoji, «ПРО»/«TEAM» as on the site.
- Desktop work goes into 3.7, no release without the owner's explicit word; no Co-Authored-By trailer in centrio-app commits; commit only when the owner asks (steps say «stage» — commit when allowed).
- API envelope stays `{ success, data | error }` like `routes/org.js`.

## Review Focus

1. Strict mode turned on while the employee has personal messengers → they are hidden, not deleted; turning it off or leaving the team brings them back. (Task 9 test `hides personal messengers without deleting them`.)
2. The SSE stream drops (sleep, Wi‑Fi change, server restart) → reconnects with backoff 2 s→60 s and runs one full resync after reconnect; no duplicate tabs. (Task 11 tests.)
3. Employee removed while his app is closed → on next launch the device fetches the pending wipe with its device key and clears team sessions even though the org endpoints now answer 403. (Task 5 + Task 13 tests.)
4. A messenger paused while it is the active tab → the app switches to the next tab, never shows a blank view; un-pausing restores the signed-in session. (Task 13 test.)
5. Work hours across midnight (22:00–06:00) and a device in another time zone → status and alerts follow the team's time zone. (Task 4 tests.)

---

## Phase 0 — Audit of what exists (owner, 2026-11-08: «Старые функции тоже проверь на работоспособность и ошибки»)

### Task 0: Audit existing TEAM features

**Files:** read-only first: live `src/routes/org.js`, `org-vault.js`, `org-compat.js`, `lib/org.js`, `lib/org-alerts.js`, `cron/orgExpiry.js`, site `src/app/team/*`, desktop `renderer/org-team.js`, `renderer/team-tasks.js`, `renderer/quick-replies-bind.js`, `main/services/vault.js`. Output: `docs/superpowers/specs/2026-11-08-team-audit.md` (finding, evidence `file:line`, severity, fix).

- [ ] For each feature — invites/accept, roles, member removal, seat limits and billing modes (new/renew/add), assignments (add/edit/delete/folder/VPN), password vault, shared VPN, forced theme, `canAddOwnMessengers`, workspaces/folders, tasks + comments, quick replies, alerts (waiting/sign-in, Telegram link, test), audit log, org expiry emails — trace the request path end to end (site → API → DB → desktop) and note every break, wrong permission, unhandled error, envelope mismatch (the `{success,data:{success,data}}` double wrap noted in `org-team.js`), and missing i18n.
- [ ] Fix confirmed bugs inside the task that touches the same code (Phase A/B/C), or as a small separate fix when no task touches it; security fixes are not mentioned in changelogs or posts.

## Phase A — API

### Task 1: Schema for presence, commands, notes, strict mode, schedule

**Files:**
- Modify: `server-src/prisma/schema.prisma` (copy the live one from `/var/www/centrio-api/prisma/schema.prisma` first; the repo copy may be stale)
- Create: migration `server-src/prisma/migrations/2026110801_team_control/migration.sql`

**Interfaces — Produces:**
- `OrgMember.strictMode Boolean @default(false)`
- `OrgMessengerAssignment.paused Boolean @default(false)`
- `Organization.timeZone String @default("Europe/Moscow")`, `Organization.workSchedule Json?` — shape `{ days: number[] /*1=Mon..7=Sun*/, start: "HH:MM", end: "HH:MM" }`
- `OrgPresence { id, orgId, userId, deviceKeyId String?, at DateTime, open Boolean, idleSec Int, frontAssignmentId String?, unreadTotal Int }` index `(orgId, userId, at)`
- `OrgPresenceDaily { id, orgId, userId, day String /*YYYY-MM-DD in team tz*/, activeMin Int, firstAt DateTime?, lastAt DateTime?, reactionSecSum Int, reactionCount Int, overThreshold Int }` unique `(orgId, userId, day)`
- `OrgCommand { id, orgId, userId, deviceKeyId String, kind String /*pause|resume|reload|relogin|wipe|note*/, payload Json?, createdById String, createdAt, doneAt DateTime? }` index `(deviceKeyId, doneAt)`
- `OrgNote { id, orgId, toUserId String? /*null = everyone*/, text String, createdById, createdAt }`, `OrgNoteRead { noteId, userId, readAt }` unique `(noteId, userId)`

- [ ] **Step 1:** Write the schema additions and the SQL migration (additive only: new columns with defaults, new tables).
- [ ] **Step 2:** Send the owner the list above in Russian and wait for «да». Do not apply before.
- [ ] **Step 3:** Back up the DB (`pg_dump` of the affected tables), apply with `npx prisma migrate deploy` as webapps, `npx prisma generate`, restart API.
- [ ] **Step 4:** Verify: `psql … -c '\d "OrgCommand"'` lists the table; `GET /api/org/:id/members` still answers 200 for an existing org.
- [ ] **Step 5:** Stage `server-src/prisma`.

### Task 2: Event bus and SSE stream

**Files:**
- Create: `server-src/src/lib/team-events.js`, `server-src/src/routes/org-live.js`
- Modify (live): `src/routes/org.js` — call `emitOrgEvent` after every mutation of assignments, settings, structure, members, vpn, quick replies; `src/index.js` (or wherever `org.js` is mounted) — mount `org-live.js` under `/api/org`
- Test: `server-src/test/team-events.test.js`

**Interfaces — Produces:**
- `emitOrgEvent(orgId: string, type: 'assignments'|'settings'|'structure'|'member'|'command'|'note'|'presence', data?: object): void`
- `subscribeOrg(orgId: string, listener: (evt: {type, data, at}) => void): () => void` (returns unsubscribe)
- `GET /api/org/:orgId/events` (auth + any member role): `text/event-stream`, `event: <type>\ndata: <json>\n\n`, comment ping `: ping` every 25 s, header `X-Accel-Buffering: no`. MEMBER receives only events where `data.userId` is absent or equals his id; `presence` events go to OWNER/ADMIN only.

- [ ] **Step 1: Tests** — `delivers an event to subscribers of that org only`; `unsubscribe stops delivery`; `a throwing listener does not stop other listeners`.
- [ ] **Step 2:** `node --test server-src/test/team-events.test.js` → FAIL (module missing).
- [ ] **Step 3:** Implement with `EventEmitter`, `setMaxListeners(0)`.
- [ ] **Step 4:** Tests PASS. Deploy, then `curl -N -H "Authorization: Bearer <owner test token>" …/events` shows `: ping` and an `assignments` event after editing an assignment on the site. Check nginx does not buffer (add `proxy_buffering off` for `/api/org/` if needed, back up the config).
- [ ] **Step 5:** Stage.

### Task 3: Presence intake, live view, status rules

**Files:**
- Create: `server-src/src/lib/team-presence.js`
- Modify: `server-src/src/routes/org-live.js`
- Test: `server-src/test/team-presence.test.js`

**Interfaces:**
- Consumes: `emitOrgEvent` (Task 2), `isWithinWorkHours` (Task 4)
- Produces:
  - `statusFor(lastBeat: {at: Date, open: boolean, idleSec: number} | null, now: Date, inHours: boolean): 'working'|'away'|'offline'|'off_hours'` — offline when no beat for 90 s or `open=false`; away when `idleSec >= 300`; off_hours when not in hours and not working.
  - `pickPersonBeat(beats: Beat[]): Beat` — most active device = open and lowest idleSec, ties → newest.
  - `POST /api/org/:orgId/presence` (any member) body `{ deviceKeyId?, open, idleSec, frontAssignmentId?, unread: {[assignmentId]: number} }` → stores a row, updates today's `OrgPresenceDaily.activeMin/firstAt/lastAt` (active = open and idleSec < 300; add 0.5 min per beat), emits `presence` with the computed person row. Rate limit 4/min per user.
  - `GET /api/org/:orgId/live` (OWNER/ADMIN) → `{ summary: {onShift, waitingNow, longestWaitMin}, people: [{userId, name, status, sinceAt, frontName, unreadTotal, longestWait: {assignmentName, minutes}|null, signInProblems: number, devices: number}] }` built from latest beats + `OrgMessengerStat`.
- [ ] **Step 1: Tests** — status rules incl. `no beat for 91 s is offline`, `idle 300 s is away`, `outside hours and idle is off_hours`; `pickPersonBeat prefers the open device with less idle time`.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS; `curl …/live` returns the shape for the test org. **Step 5:** Stage.

### Task 4: Work schedule

**Files:**
- Create: `server-src/src/lib/team-schedule.js`
- Modify: `src/routes/org.js` — `PATCH /:orgId/schedule` (OWNER) body `{ timeZone, workSchedule }`, validated (IANA zone via `Intl.DateTimeFormat`, `HH:MM`, days 1–7); include both in `GET /:orgId`; `src/lib/org-alerts.js` — skip "client waiting" alerts when `!isWithinWorkHours`
- Test: `server-src/test/team-schedule.test.js`

**Interfaces — Produces:**
- `isWithinWorkHours(schedule: {days, start, end} | null, timeZone: string, at: Date): boolean` — `null` schedule = always in hours; `end < start` means the shift crosses midnight and the after-midnight part belongs to the start day.
- `localDay(timeZone: string, at: Date): string` → `YYYY-MM-DD`
- `shiftEndAt(schedule, timeZone, day: string): Date`
- [ ] **Step 1: Tests** — `09:00–18:00 Mon–Fri, Tue 10:00 Moscow is in hours`; `Sat is out`; `22:00–06:00 Mon, Tue 03:00 is in hours`; `same instant in Asia/Vladivostok team is judged in its own zone`; `invalid zone rejected by the route validator`.
- [ ] **Step 2–4:** FAIL → implement (use `Intl.DateTimeFormat(..., {timeZone})` parts, no new deps) → PASS.
- [ ] **Step 5:** Stage.

### Task 5: Per-device commands and the dismissal wipe

**Files:**
- Create: `server-src/src/lib/team-commands.js`, `server-src/src/routes/org-device.js`
- Modify: `src/routes/org.js` — member removal (`DELETE /:orgId/members/:userId`), org end/deletion, and assignment delete → create `wipe` (or `pause`) commands for each of that user's `OrgDeviceKey`s **before** deleting membership rows; keep the device keys of a removed member until his wipe is confirmed
- Test: `server-src/test/team-commands.test.js`

**Interfaces — Produces:**
- `planCommands(kind, {orgId, userId, deviceKeyIds: string[], payload, createdById}): Command[]` — one per device; `wipe` payload `{ assignmentIds: string[] | 'all' }`.
- `POST /api/org/:orgId/members/:userId/commands` (OWNER/ADMIN) body `{ kind: 'pause'|'resume'|'reload'|'relogin'|'wipe', assignmentId? }` → creates rows, emits `command` with `{userId}`, writes audit `command.<kind>`; `pause`/`resume` also set `OrgMessengerAssignment.paused` and emit `assignments`.
- `GET /api/org-device/commands` — auth by the user token **or**, when membership is gone, by header `X-Device-Key: <deviceKeyId>` + `X-Device-Proof` (ECDSA signature of the current minute with the device's P-256 key; verify against `OrgDeviceKey.publicKey`). Returns pending commands for that device.
- `POST /api/org-device/commands/:id/done` same auth → sets `doneAt`, emits `command` to OWNER/ADMIN.
- `GET /api/org/:orgId/members/:userId/commands` (OWNER/ADMIN) → recent commands with `doneAt` per device, used for «выполнено на N из M».
- [ ] **Step 1: Tests** — `wipe for a user with two devices makes two commands`; `a confirmed command is not returned again`; `proof older than 2 minutes is rejected`; `removing a member creates wipe commands before membership is gone`.
- [ ] **Step 2–4:** FAIL → implement → PASS; on the live server remove a test member and see his pending wipe via `curl` with device headers.
- [ ] **Step 5:** Stage.

### Task 6: Notes

**Files:** Modify `server-src/src/routes/org-live.js`; Test `server-src/test/team-notes.test.js` (pure helper `noteReadSummary(note, members, reads)`)

**Interfaces — Produces:**
- `POST /api/org/:orgId/notes` (OWNER/ADMIN) `{ toUserId: string|null, text: 1..1000 chars }` → emits `note`.
- `GET /api/org/:orgId/notes` → MEMBER: his unread notes; OWNER/ADMIN: last 50 with `{readBy: number, total: number}`.
- `POST /api/org/:orgId/notes/:id/read` (any member, idempotent).
- [ ] Steps: tests (`a note to everyone counts all members except the author`) → FAIL → implement → PASS → stage.

### Task 7: Strict mode on members

**Files:** Modify live `src/routes/org.js` (members GET/PATCH, invite accept); Test `server-src/test/team-strict.test.js` for `defaultStrictForJoin(joinedAt, releaseAt)`

**Interfaces — Produces:**
- `GET /:orgId/members` includes `strictMode`; `PATCH /:orgId/members/:userId` accepts `{ strictMode: boolean }` (audit `member.strict`), emits `member` with `{userId}`.
- Invite accept sets `strictMode = true` when the env flag `TEAM_STRICT_DEFAULT_FROM` (ISO date, set at 3.7 release) is in the past.
- Steps: tests → FAIL → implement → PASS → stage.

### Task 8: Daily summary, reports, retention

**Files:**
- Create: `server-src/src/cron/teamDaily.js`, `server-src/src/lib/team-report.js`
- Modify: `src/lib/org-alerts.js` reaction tracking — when `OrgMessengerStat.waitingSince` is cleared, add `(clearedAt - waitingSince)` to today's `OrgPresenceDaily.reactionSecSum/Count` and `overThreshold++` when above the team's alert threshold; register the cron where `cron/orgExpiry.js` is registered
- Test: `server-src/test/team-report.test.js`

**Interfaces — Produces:**
- `buildDailySummary(org, people: DailyRow[]): string` — Russian Telegram text: per person «время на работе Ч:ММ, с HH:MM до HH:MM, ждали дольше нормы N, самое долгое ожидание M мин, проблемы со входом K»; people with no activity listed last as «не выходил на связь».
- Cron every 5 min: for each org with a Telegram alert chat and a schedule, send once per day when `now >= shiftEndAt` (remember the sent day in `alertSettingsJson.lastDailyDay`); purge `OrgPresence` older than 7 days and `OrgPresenceDaily` older than 90 days.
- `GET /api/org/:orgId/reports?days=7|30` (OWNER/ADMIN) → `[{userId, name, activeMin, avgReactionSec, overThreshold, days}]`.
- [ ] Steps: tests (`summary formats minutes as Ч:ММ`, `inactive people go last`, `avg reaction is sum/count, null when count is 0`) → FAIL → implement → PASS → send the summary for the test org manually once and check it in Telegram → stage.

---

## Phase B — Desktop (this worktree)

### Task 9: Strict-mode policy in the renderer

**Files:**
- Create: `renderer/team-strict.js`
- Modify: `renderer/org-team.js` (`syncMemberPermission` reads `strictMode`, new `setStrictMode`), `renderer.js` (state `orgStrict`, add-button gate at `renderer.js:2173`), `renderer/context-menus.js`, `renderer/edit-modal-bind.js`, `renderer/sidebar-dnd-bind.js`, notification mute paths, `locales/*.js` (`team.lockedByManager` «Это настроил руководитель»)
- Test: `scripts/test-team-strict.js`

**Interfaces — Produces:**
- `canDo(action: 'add'|'addLink'|'remove'|'rename'|'reorder'|'icon'|'moveFolder'|'mute', messenger: {orgAssigned?: boolean}|null, strict: boolean): boolean`
- `visibleMessengers(list, {strict, teamWorkspaceActive}): list` — hides personal ones in strict mode while the team workspace is active, never mutates the stored list.
- `dndCoversTeam({strict, inWorkHours}): boolean` — false when strict and inside work hours (team schedule + time zone come from `GET /api/org/:orgId`; reuse a desktop copy of `isWithinWorkHours` from Task 4, same tests).
- [ ] **Step 1: Tests** — `strict blocks rename of a team messenger`; `non-strict keeps today's rules`; `hides personal messengers without deleting them`; `leaving the team shows them again`.
- [ ] **Step 2–4:** `node --test scripts/test-team-strict.js` FAIL → implement and wire every control to `canDo`, locked controls show a lock icon and the tooltip → PASS; `npm run build:renderer`.
- [ ] **Step 5:** Stage.

### Task 10: Navigation lock for team tabs

**Files:**
- Create: `main/services/orgNavigationPolicy.js`
- Modify: `main/bootstrap/registerAppEvents.js` (guest `will-navigate`/`will-frame-navigate` and `setWindowOpenHandler` for partitions `persist:org:*`), `main/services/vault.js` (export `allowedBaseDomains`), IPC `team:set-strict` to tell main the current strict flag
- Test: `scripts/test-org-navigation.js`

**Interfaces — Produces:**
- `decideNavigation({partition, targetUrl, assignedUrl, strict}): 'allow'|'external'` — non-org partitions and non-strict always `allow`; otherwise `allow` when the target host is in `allowedBaseDomains(assignedUrl)`, else `external` (prevent and `shell.openExternal` for http/https only).
- [ ] Steps: tests (`wa.me link from WhatsApp opens externally in strict mode`, `accounts.google.com from a Yandex mail tab is allowed`, `personal messenger is never restricted`) → FAIL → implement + wire → PASS → stage.

### Task 11: Live channel client

**Files:**
- Create: `main/services/teamEvents.js`, `main/ipc/teamEvents.js`
- Modify: `preload.js` allowlist (`team-event`, `team-events:start`, `team-events:stop`), `renderer/org-team.js` (on event: `assignments|structure` → `syncAssignments`, `settings` → settings sync, `member` → `syncMemberPermission`, `command|note` → Task 13/14 handlers; on `reconnected` → full `tick()`)
- Test: `scripts/test-team-events-client.js` (pure `parseSse(chunk, carry)` and `nextDelay(attempt)`)

**Interfaces — Produces:**
- `parseSse(chunk: string, carry: string): {events: {type, data}[], carry: string}`
- `nextDelay(attempt: number): number` — 2000·2^attempt capped at 60000, ±20 % jitter.
- Main opens the stream with `net.fetch` and the stored token, forwards `team-event {type, data}` and a synthetic `{type:'reconnected'}`.
- [ ] Steps: tests (`event split across two chunks is parsed once`, `ping comments are ignored`, `delay caps at 60 s`) → FAIL → implement → PASS → stage.

### Task 12: Presence beats

**Files:**
- Create: `renderer/team-presence.js`
- Modify: `main/ipc/window.js` (handler `team:idle-seconds` → `powerMonitor.getSystemIdleTime()`), `preload.js`, `api.js` + `main/ipc/api.js` (`api-org-push-presence`), `renderer/org-team.js` (start/stop with the org timers)
- Test: `scripts/test-team-presence.js` (pure `buildBeat(state, idleSec, deviceKeyId)`)

**Interfaces — Produces:**
- `buildBeat(state, idleSec, deviceKeyId) → { deviceKeyId, open: true, idleSec, frontAssignmentId: string|null /*only for org tabs*/, unread: {[assignmentId]: number} /*only org tabs*/ }`; every 30 s, plus `open:false` on quit (best effort).
- [ ] Steps: tests (`a personal tab in front sends frontAssignmentId null`, `only team messengers appear in unread`) → FAIL → implement → PASS → stage.

### Task 13: Command executor and wipe

**Files:**
- Create: `renderer/team-commands.js`, `main/services/teamWipe.js`
- Modify: `main/ipc/vault.js` (sign proof for `X-Device-Proof`), `renderer/org-team.js` (`handleMembershipLost` → wipe all; startup → fetch pending commands with device key even without org), cloud sign-out path (`renderer/cloud.js` sign-out) → wipe all team sessions, `renderer/messengers.js` (`pause` = remove tab keeping session; switch to the next tab if active)
- Test: `scripts/test-team-commands.js`

**Interfaces — Produces:**
- `teamWipe.wipe(assignmentIds: string[] | 'all'): Promise<{cleared: number}>` — `session.fromPartition('persist:org:<id>').clearStorageData()` + delete stored vault blobs; for `'all'` enumerate known org partitions (registered set + partitions dir names starting with `org_`/`org:`).
- `runCommand(cmd, deps): Promise<void>` — dispatch by kind; always POSTs `done` after success; unknown kinds are confirmed and ignored.
- [ ] Steps: tests (`wipe confirms after clearing`, `pause on the active tab switches to the next one`, `unknown kind is confirmed`, `pending wipe runs when membership is already lost`) → FAIL → implement → PASS; in the Electron harness on a test profile: sign in a demo team member, remove him on the local API, relaunch → session folder for that assignment is empty → stage.

### Task 14: Notes card and «Что видит руководитель»

**Files:**
- Create: `renderer/team-notes.js`, styles in `styles-cloud.css`
- Modify: `index.html` (note card slot), `renderer/org-team.js`, account window team section (`teamSubSection`) — entry «Что видит руководитель», first-join notice, `locales/*.js`
- Test: `scripts/test-team-notes.js` (pure `nextNoteToShow(notes, dismissedIds)`)

Copy (ru): «Что видит руководитель: вошли ли вы в рабочие мессенджеры, сколько в них непрочитанных и как долго ждут клиенты, открыто ли приложение и были ли вы у компьютера, какой рабочий мессенджер открыт. Руководитель не видит ваши переписки, экран и личные мессенджеры.»

- [ ] Steps: tests → FAIL → implement (pinned card under the update strip, button «Понятно» → `POST …/notes/:id/read`) → PASS → screenshots in the harness, light and dark → stage.

---

## Phase C — Site team admin (`/var/www/centrio-web/src/app/team`)

### Task 15: «Сейчас» tab

**Files:** Create `LiveBoard.tsx`, `EmployeePanel.tsx`, `live-board.css`; Modify `page.tsx` (NAV first item `now` for OWNER/ADMIN, default tab for them)

**Interfaces — Consumes:** `GET …/live`, `GET …/events` (EventSource with token via `?t=` is NOT allowed — use `fetch` streaming with the Authorization header), `POST …/members/:userId/commands`, `GET …/members/:userId/commands`, `POST …/notes`.

- Summary strip, one row per person (status chip colours: working green, away amber, offline grey, off_hours muted), panel with per-messenger unread/waiting/sign-in, today numbers, buttons: Выключить/Включить мессенджер, Перезагрузить, Попросить войти, Написать, Завершить рабочие сеансы (confirm dialog: «Сотрудник выйдет из всех рабочих мессенджеров на всех своих устройствах»), «выполнено на N из M устройств».
- [ ] Verify on the local stack (Task 18 seed): statuses change within 5 s of a beat; every button creates a command and the desktop test instance executes it.

### Task 16: Strict mode, schedule, notes, reports in the admin

**Files:** Modify `page.tsx` (members list: «Строгий режим» toggle per person with hint; Manage: «Рабочее время» — days, start, end, time zone), Create `ReportsPanel.tsx` (NAV `reports`, 7/30 days table, «время реакции»), `NotesPanel` inside EmployeePanel and a «Написать всем» action on the board.
- [ ] Verify on the local stack; deploy through the copy procedure; check the live `/team` for the existing org renders without errors (console clean).

### Task 17: Privacy policy

**Files:** Modify the policy page on the site (section 1.7 area, where the vault is described).
- [ ] Add what the manager sees, the 7/90-day retention, that the customer company is the operator of its employees' data and Centrio processes it on its behalf. Deploy with Task 16.

### Task 18: End-to-end on a local stack with a demo team

**Files:** Create `scripts/team-demo-seed.js` (seeds a local Postgres via the API's Prisma client: org «Демо-команда», owner + 4 employees with invented names, assignments Telegram/WhatsApp/MAX/Avito, schedule 09:00–18:00, a week of rollups)
- [ ] Run API and site locally (`.claude/launch.json` entries), desktop test profiles pointed at the local API (`CENTRIO_API_URL` override — add it to `main/services/api.js` if missing, dev builds only).
- [ ] Walk the five Review Focus cases and every board action; record results.
- [ ] The same seeded stack is what Plan B (TEAM page) screenshots.

---

## After this plan
- Plan B: rebuild `/teams` with real screenshots (spec goal 7), written once Phase C is live.
- Release 3.7 only on the owner's word; set `TEAM_STRICT_DEFAULT_FROM` to the release date.
