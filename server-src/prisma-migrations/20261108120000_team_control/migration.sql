-- TEAM control (2026-11-08). Additive only.
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT 'Europe/Moscow';
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "workSchedule" JSONB;
ALTER TABLE "OrgMember" ADD COLUMN IF NOT EXISTS "strictMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OrgMessengerAssignment" ADD COLUMN IF NOT EXISTS "paused" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "OrgPresence" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "userId" TEXT NOT NULL, "deviceKeyId" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "open" BOOLEAN NOT NULL, "idleSec" INTEGER NOT NULL,
  "frontAssignmentId" TEXT, "unreadTotal" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OrgPresence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgPresence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrgPresence_orgId_userId_at_idx" ON "OrgPresence"("orgId", "userId", "at");
CREATE INDEX IF NOT EXISTS "OrgPresence_at_idx" ON "OrgPresence"("at");

CREATE TABLE IF NOT EXISTS "OrgPresenceDaily" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "userId" TEXT NOT NULL, "day" TEXT NOT NULL,
  "activeMin" DOUBLE PRECISION NOT NULL DEFAULT 0, "firstAt" TIMESTAMP(3), "lastAt" TIMESTAMP(3),
  "reactionSecSum" INTEGER NOT NULL DEFAULT 0, "reactionCount" INTEGER NOT NULL DEFAULT 0, "overThreshold" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OrgPresenceDaily_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgPresenceDaily_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgPresenceDaily_orgId_userId_day_key" ON "OrgPresenceDaily"("orgId", "userId", "day");
CREATE INDEX IF NOT EXISTS "OrgPresenceDaily_day_idx" ON "OrgPresenceDaily"("day");

CREATE TABLE IF NOT EXISTS "OrgCommand" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "userId" TEXT NOT NULL, "deviceKeyId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "payload" JSONB, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "doneAt" TIMESTAMP(3),
  CONSTRAINT "OrgCommand_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgCommand_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrgCommand_deviceKeyId_doneAt_idx" ON "OrgCommand"("deviceKeyId", "doneAt");
CREATE INDEX IF NOT EXISTS "OrgCommand_orgId_userId_createdAt_idx" ON "OrgCommand"("orgId", "userId", "createdAt");

CREATE TABLE IF NOT EXISTS "OrgNote" (
  "id" TEXT NOT NULL, "orgId" TEXT NOT NULL, "toUserId" TEXT, "text" TEXT NOT NULL, "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "OrgNote_orgId_createdAt_idx" ON "OrgNote"("orgId", "createdAt");

CREATE TABLE IF NOT EXISTS "OrgNoteRead" (
  "id" TEXT NOT NULL, "noteId" TEXT NOT NULL, "userId" TEXT NOT NULL, "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrgNoteRead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrgNoteRead_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "OrgNote"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrgNoteRead_noteId_userId_key" ON "OrgNoteRead"("noteId", "userId");
