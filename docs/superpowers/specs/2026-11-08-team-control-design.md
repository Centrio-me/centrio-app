# Centrio TEAM: control for managers, then the TEAM page

Date: 2026-11-08. Owner request: «Нужно поработать с командной подпиской. Сначала довести её до идеала, добавить новые функции управления, чтобы начальники хотели контролировать своих сотрудников. Сделай это удобно в админке. И после этого оформи страницу для команды» (a full page with screenshots of how it works).

The owner handed the product judgement to the builder («ты лучше меня знаешь, что нужно руководителю»). His own words on what a manager wants: full control over the list of messengers, no extra tabs, restrictions, watching the work roughly live, making changes live. Everything below that goes past those words is the builder's call and is marked **[call]**.

## Why

TEAM is sold per seat (389 ₽/seat/month, 349 ₽/seat/month yearly). Today it is bought by almost nobody (3 orgs, 1 active). A manager pays when Centrio becomes the place where he sees and steers the work of people who talk to his clients. The page cannot sell what the product does not do, so the product comes first, the page second, and the page shows real screens of the real product.

## Who

The buyer: an owner or head of a small team (2–20 people: sales, support, SMM, dispatchers) whose people answer clients in Telegram, WhatsApp, MAX, VK, Avito and similar from work accounts the company owns. He wants three things:

1. **Order.** The employee has the work messengers and nothing else, and cannot change that.
2. **Visibility.** A live picture: who is at work, where clients wait, who reacts slowly. A daily summary without opening anything.
3. **Levers.** Changes reach the employee in seconds; he can switch a messenger off for someone, reload it, broadcast a note to everyone, and on dismissal end every work sign-in on that person's computer with one button.

## What exists today (verified in code 2026-11-08)

Server `/var/www/centrio-api/src/routes/org.js`, `org-vault.js` (Express 5, Prisma/Postgres, pm2 single fork process). Site admin `/var/www/centrio-web/src/app/team/page.tsx` (tabs: Обзор, Сотрудники, Оплата, Управление, Задачи, Папки, Быстрые ответы, Оповещения, Журнал). Desktop `renderer/org-team.js`.

- Owner assigns messengers per employee (`OrgMessengerAssignment`), with folder, VPN flag, encrypted saved password (vault, owner never sees it back).
- `OrgMember.canAddOwnMessengers` — desktop only locks the "+" button (`renderer.js:2173`).
- `Organization.forcedSettingsJson` — only `theme` is applied by the desktop.
- Shared team VPN, workspaces/folders, tasks with comments, quick replies, audit log.
- `OrgMessengerStat`: unread per messenger, lastReadAt/lastMessageAt, `waitingSince`, sign-in state. Desktop pushes 15 s after an unread change plus a 2-minute heartbeat.
- `OrgAlert`: "client waiting" and "needs sign-in" alerts to the owner in Telegram and in the app.
- Desktop pulls assignments/settings/structure every **2 minutes**; there is no push channel.
- When an assignment or membership disappears, the desktop removes the tab (`removeOrgAssignedMessenger`) but **does not clear the stored session** (`persist:org:<id>` partition stays on disk with cookies).

## Goals

### 1. Strict mode («Строгий режим») — order
Per employee, set by owner/admin on the site; default off for existing members, default on for newly invited members **[call]**. When on, in the employee's app:
- cannot add own messengers or custom links (existing flag folds into this);
- cannot delete, rename, reorder or re-icon team messengers, cannot move them out of their folder;
- inside a team messenger tab, navigation stays on that messenger's site and the known sign-in providers (the same domain list the vault autofill already trusts). Links to other sites open in the system browser, never inside Centrio **[call]**;
- notifications for team messengers cannot be muted, «Не беспокоить» cannot cover them during work hours;
- the employee sees a small lock and the line «Это настроил руководитель» wherever a control is locked, never a broken-looking button.

Own (personal) messengers the employee added before strict mode was turned on stay but are hidden while the team workspace is active **[call]**.

### 2. Live channel — changes in seconds
Server-Sent Events endpoint per org (`GET /api/org/:orgId/events`, auth as today). The pm2 process is a single fork, so an in-process emitter is enough. Events: `assignments`, `settings`, `structure`, `member`, `command`. The desktop keeps its current polling as fallback but resyncs immediately on an event. Target: an owner change shows up in the employee's app within 5 seconds while it is online.

### 3. Presence and the live board («Сейчас») — visibility
Desktop sends a presence beat every 30 s while in a team: app open, active or idle (OS idle time > 5 min = «Отошёл»), which team messenger is in front (name only), unread per team messenger. Nothing from inside chats.

New first tab on the site admin, «Сейчас», live (SSE, fallback refresh every 15 s):
- one row per employee: status (В работе / Отошёл N мин / Не в сети с HH:MM / Вне рабочего времени), the messenger in front, total unread, the longest-waiting client (messenger + minutes), sign-in problems;
- the team at a glance on top: on shift now, clients waiting now, longest wait;
- click an employee → his messengers with unread, waiting time, sign-in state, today's numbers, and the action buttons (goal 4).

### 4. Remote actions — levers
From an employee's row/panel, each one logged in the audit log and shown to the employee as a short note in the app:
- turn a team messenger off/on for him (assignment paused, tab disappears/returns, session kept);
- reload a messenger tab; ask him to sign in again (opens the tab with a banner);
- send a note to one employee or to everyone (appears as a pinned card in the app until he presses «Понятно»; owner sees who read it);
- «Завершить рабочие сеансы»: clears every team messenger session and saved password on that employee's devices. Also runs automatically when the person is removed from the team or the team ends.

### 5. Work time and reports
- Work hours and days per team (one schedule per team in v1 **[call]**). Presence outside them shows «Вне рабочего времени»; "client waiting" alerts fire only inside them.
- Daily summary to the owner's Telegram (existing alert channel) at the end of the work day: per employee — time at work, first/last activity, clients left waiting, longest wait, sign-in problems.
- «Отчёты» tab: 7 and 30 days per employee — active time, average reaction time, clients that waited over the alert threshold.
- "Reaction time" = time from a messenger getting unread to it being read (we never see replies). It is named «время реакции» everywhere, never «время ответа».

### 6. Fix the leak on dismissal
Removing an assignment or a member clears the stored session of that messenger on the device (not only the tab).

### 7. The TEAM page on the site
After 1–6 work, rebuild `/teams` as a full sales page with real screenshots: the live board, an employee's panel with actions, strict mode as the employee sees it, the daily Telegram summary, the password vault, pricing, FAQ, a CTA to start a team. Screens come from a demo team with invented names and numbers on a test profile, never real customers. Russian first; the same languages `/teams` has today.

## Decisions settled after the builder check (all **[call]**)
- **Employee signs out of Centrio or switches account while in a team:** team messenger sessions and saved passwords on that device are cleared, the same as on removal. Work accounts belong to the company and come back through the vault on the next sign-in, so nothing is lost for the owner.
- **Offline devices:** remote commands are kept on the server per device (the existing `OrgDeviceKey` is the device identity) until that device confirms them. A device removed from the team can still fetch and confirm its pending «Завершить рабочие сеансы» with its device key. The owner sees «выполнено на N из M устройств». Other commands (turn off, reload, note) are also delivered on the next launch.
- **Work hours:** one schedule per team, in the team's time zone chosen by the owner (default Europe/Moscow). The daily summary goes out at the end of that schedule. The scheduler follows the existing `cron/` pattern on the API.
- **Data kept:** raw presence beats 7 days, daily per-employee rollups 90 days, then deleted. Only the owner and admins of that team see them. The privacy policy and «Что видит руководитель» say exactly this. The customer company is the operator of its employees' data; Centrio processes it on its behalf.
- **Demo team for screenshots:** not in production. Screens are taken from the site and API run locally against a seeded demo database, and from the desktop app on a test profile pointed at that local API.
- **Where the board lives:** the site's team admin `/team` only in v1. The endpoints are plain JSON so a mobile owner view can come later; no mobile work now.
- **Several devices per employee:** the board shows one row per person; his status is that of his most active device, with the device count shown in the panel. A note read on any device counts as read. Turning a messenger off and strict mode apply to every device of that person.

## Anti-goals (would make it a failure even if it works)
- No reading message content, no screenshots or screen view of the employee, no keylogging, no tracking outside the Centrio window. Selling Centrio as spyware is a legal (152-ФЗ, labour law) and brand risk.
- The employee always knows what the manager sees: a notice when he joins a team and a permanent «Что видит руководитель» entry in the app; the privacy policy section is updated to match.
- Strict mode must never lock a person out of his personal Centrio once he leaves the team.
- Nothing slows the app down: presence beats are small, the live channel reconnects with backoff.

## Constraints
- Desktop changes go into version 3.7 together with the update strip already waiting; release only on the owner's explicit word. Server and site changes that the current 3.6.x app ignores may go live earlier; anything the old app would misread waits for 3.7.
- Prisma schema changes on production need the owner's yes before applying (ask once with the list of changes).
- Site source of truth is the server copy `/var/www/centrio-web` (local `C:\centrio-web-build` is outdated). Deploy through a copy, as done before.
- Geist font, no emoji, «ПРО»/«TEAM» naming as on the site today, all 7 app languages for desktop strings.
- No Co-Authored-By lines in centrio-app commits; commit only when asked.

## Left to the builder
Event payload shapes, table design for presence/commands/notes (or reuse of existing tables), how the board is laid out within the existing admin design, the exact strict-mode UI in the app, test approach (pure logic under `node --test`, desktop checked in the Electron test harness with a demo team), the order of work inside goals 1–6.
