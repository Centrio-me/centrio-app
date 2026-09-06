// Adds telegramTopicId to the Ticket model — links a support ticket to its
// forum-topic thread in the private Telegram tickets supergroup
// (chat -1004308868684, is_forum:true), so admin replies made directly in
// Telegram can be routed back to the correct ticket via the webhook.
//
// Run on server:
//   node /tmp/schema_ticket_telegram.js
//   cd /var/www/centrio-api && npx prisma db push && npx prisma generate
//   sudo -u webapps pm2 restart centrio-api --update-env
const fs = require('fs')
const path = '/var/www/centrio-api/prisma/schema.prisma'
let schema = fs.readFileSync(path, 'utf8')

if (schema.includes('telegramTopicId')) {
  console.log('telegramTopicId already exists on Ticket — nothing to do.')
  process.exit(0)
}

const marker = 'model Ticket {\n  id        String       @id @default(uuid())'
if (!schema.includes(marker)) {
  console.error('Ticket model start not found in expected shape — aborting, edit manually.')
  process.exit(1)
}

schema = schema.replace(
  'status    TicketStatus @default(OPEN)\n  createdAt DateTime     @default(now())',
  'status    TicketStatus @default(OPEN)\n  telegramTopicId Int?\n  createdAt DateTime     @default(now())'
)

if (!schema.includes('telegramTopicId')) {
  console.error('Replacement did not apply — schema unchanged, edit manually.')
  process.exit(1)
}

fs.writeFileSync(path, schema)
console.log('telegramTopicId added to Ticket model')
