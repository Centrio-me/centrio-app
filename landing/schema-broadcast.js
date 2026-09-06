// One-off schema migration script for the admin "Рассылки" (broadcast/email
// blast) feature — adds the Broadcast model. Same pattern as the earlier
// schema-addition.js (UsageStat). Run manually on the server:
//   node /var/www/centrio-api/schema-broadcast.js
// then `npx prisma generate` in /var/www/centrio-api.
// NOT executed as part of this session's changes — deploys are frozen
// (see project memory / session instructions) until the user tests locally
// and authorizes a release. Left here ready to run once that happens.
const fs = require('fs')
const path = '/var/www/centrio-api/prisma/schema.prisma'
let schema = fs.readFileSync(path, 'utf8')

const broadcastModel = `
model Broadcast {
  id          String   @id @default(uuid())
  subject     String
  bodyText    String
  audience    String   @default("ALL")
  status      String   @default("SENDING")
  totalCount  Int      @default(0)
  sentCount   Int      @default(0)
  failedCount Int      @default(0)
  createdAt   DateTime @default(now())
  finishedAt  DateTime?
  createdBy   String?

  @@index([createdAt])
}
`

if (!schema.includes('model Broadcast')) {
  schema += broadcastModel
  fs.writeFileSync(path, schema)
  console.log('Schema updated successfully — Broadcast model added')
} else {
  console.log('Broadcast model already exists')
}
