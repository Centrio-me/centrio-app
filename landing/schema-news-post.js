// Adds the NewsPost model — tracks what's already been published to the
// public @centrioapp news channel (both auto-suggested blog reposts and
// manual/ad-hoc posts written straight in the admin panel).
//
// Why a table instead of just calling postToNewsChannel() directly: without
// a record of "this blog slug was already posted", the admin "news"
// candidates list would re-suggest the same article forever and an admin
// could double-post it by clicking twice. slug is @unique (nullable — many
// manual posts with slug:null are fine, Postgres treats each NULL as
// distinct for a unique index) so a given blog article can only ever be
// recorded once.
//
// Run on server:
//   node /tmp/schema_news_post.js
//   cd /var/www/centrio-api && npx prisma db push && npx prisma generate
//   sudo -u webapps pm2 restart centrio-api --update-env
const fs = require('fs')
const path = '/var/www/centrio-api/prisma/schema.prisma'
let schema = fs.readFileSync(path, 'utf8')

if (schema.includes('model NewsPost')) {
  console.log('NewsPost model already exists — nothing to do.')
  process.exit(0)
}

const marker = 'model Broadcast {'
if (!schema.includes(marker)) {
  console.error('Broadcast model (insertion anchor) not found in expected shape — aborting, edit manually.')
  process.exit(1)
}

const newModel = `model NewsPost {
  id                String   @id @default(uuid())
  slug              String?  @unique
  title             String
  telegramMessageId Int?
  createdAt         DateTime @default(now())

  @@index([createdAt])
}

model Broadcast {`

schema = schema.replace(marker, newModel)

if (!schema.includes('model NewsPost')) {
  console.error('Replacement did not apply — schema unchanged, edit manually.')
  process.exit(1)
}

fs.writeFileSync(path, schema)
console.log('NewsPost model added')
