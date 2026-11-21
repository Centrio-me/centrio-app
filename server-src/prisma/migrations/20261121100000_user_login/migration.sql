-- TEAM: accounts with a login and a password instead of an email (2026-11-21). Additive only.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "login" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_login_key" ON "User"("login");
