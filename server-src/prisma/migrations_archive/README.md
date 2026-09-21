# migrations_archive — pre-baseline history, retained for reference only

The 3 folders in this directory (`20260406081150_init`,
`20260406114032_add_messenger_sync`, `20260407134549_add_github_id`) are
**pre-baseline migrations**. They are kept here purely for historical
reference — to show how the schema evolved before the baseline was cut.

They are fully superseded by `0_baseline` in the parent `prisma/migrations/`
directory. `0_baseline` already contains everything these 3 folders would
have applied, generated as a single snapshot of the live database.

## Do not move these back into `prisma/migrations/`

**These folders must never be moved back into `prisma/migrations/`.** If a
future engineer sees `0_baseline` sitting next to this archive and assumes
the archive was accidental or "should really be restored," moving these 3
folders back in will make Prisma's shadow-database replay re-apply them on
top of `0_baseline` — and they collide on `CREATE TYPE "Plan"` (and other
`CREATE TYPE`/`CREATE TABLE` statements already present in the baseline).
This already happened once during the mobile companion backend work and
cost multiple blocked rounds before the cause was found. Leave this archive
exactly where it is.

## What actually reflects the live database

The live database's true current state is fully captured by `0_baseline`
plus everything committed after it in `prisma/migrations/`. This archive
is not part of that chain and Prisma never touches it — it's not read by
`prisma migrate deploy`, `prisma migrate dev`, or the shadow-database diff,
precisely because it lives outside `prisma/migrations/`.

## `schema.prisma` is a manually-maintained mirror

`server-src/prisma/schema.prisma` is a manually-maintained mirror of the
live server's schema — `scripts/deploy-backend.js` does **not** upload it
(schema changes need a real migration, not a file copy). After any future
schema change made on the server, remember to copy the server's
`schema.prisma` back into this mirror so the two don't drift apart.
