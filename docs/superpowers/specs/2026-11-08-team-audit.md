# TEAM audit, 2026-11-08 (Task 0)

Scope: live API `/var/www/centrio-api/src` (routes/org.js, org-vault.js, org-compat.js, lib/org.js, lib/org-alerts.js, cron/*), site `/var/www/centrio-web/src/app/team/*`, desktop `renderer/org-team.js`, `api.js`. Local copies: `server-src/src/**`, `site-team/team/*`.

Every path the site and the desktop call exists on the API (checked by extracting all `/api/org/...` calls). Permission checks on tasks, folders, assignments and alerts are scoped to the org and role. Findings:

| # | Severity | Finding | Evidence | Fix (task) |
|---|---|---|---|---|
| A1 | High | Expiry reminders to the owner (7/3/1/0 days before the team ends) no longer exist: `cron/orgExpiry.js` and its emails were lost in the server move. Owners without auto-renew get no warning; the team silently loses PRO and alerts. `autoRenew.js` only covers auto-renewing teams. | `ls src/cron` (no orgExpiry.js), `index.js:125-141`, `lib/email.js` exports | Recreate `cron/orgExpiry.js` + `sendOrgExpiryEmail` (Task 8, same cron work) |
| A2 | High | A removed employee cannot be invited back: removal sets `OrgMember.status = SUSPENDED`, accept does `orgMember.create` → unique `(orgId,userId)` → «Вы уже состоите в этой организации». | `routes/org.js:538-541`, `:431-446` | On accept, reactivate the suspended row (update status/role/joinedAt, strictMode per Task 7) (Task 7) |
| A3 | High | Removing an employee leaves his work sessions on his computer (desktop removes tabs, never clears `persist:org:*`), and his assignments stay in the DB. | `renderer/org-team.js:114-127`, `renderer/messengers.js:474+`, `routes/org.js:522-550` | Tasks 5 and 13 (wipe commands; delete his assignments on removal) |
| A4 | Medium | Assignment URL is not checked for scheme: an admin can assign `file:`, `javascript:` or `data:` URLs that the employee's app loads in a webview. | `routes/org.js:757` | Accept only `http:`/`https:` (Task 5, same file area) |
| A5 | Medium | Invite accept checks seat capacity but not that the paid period is active; an invite sent before the team lapsed can still be accepted after. | `routes/org.js:426-429` vs `:333` | Same active-period check on accept (Task 7) |
| A6 | Low | `routes/org-compat.js` is not mounted anywhere (dead file). | `index.js:89` mounts only `routes/org` | Leave; note only |
| A7 | Low | Assignment rename/URL edit is not possible (PATCH accepts only folderId/useVpn); owners must delete and re-add, which drops the saved password. | `routes/org.js:1876-1903` | Accept `name`/`url` in PATCH with A4 validation (Task 16 uses it) |
| A8 | Info | Desktop applies only `theme` from forced settings; strict mode supersedes the idea. | `renderer/org-team.js:9-12` | Task 9 |
