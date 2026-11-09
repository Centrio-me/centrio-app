// Every 30 minutes: sign-ups that came from an ad go to Metrica as goal "signup" (offline conversions),
// so Direct counts and learns on registrations. Each sign-up is sent once (signupSource.offlineSentAt).
const cron = require('node-cron')
const FormData = require('form-data')
const prisma = require('../utils/prisma')
const metrika = require('../lib/metrika')
const { pendingSignups, buildUploadCsv, parseSource } = require('../lib/metrika-offline')

const COUNTER = 108785516
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
let running = false

async function uploadSignups(now = new Date()) {
    if (running) return { sent: 0 }
    running = true
    try {
        const users = await prisma.user.findMany({
            where: { createdAt: { gt: new Date(now - LOOKBACK_MS) }, signupSource: { not: null } },
            select: { id: true, createdAt: true, signupSource: true }
        })
        const rows = pendingSignups(users)
        if (rows.length === 0) return { sent: 0 }
        const form = new FormData()
        form.append('file', Buffer.from(buildUploadCsv(rows)), { filename: 'signups.csv', contentType: 'text/csv' })
        await metrika.apiSend('post', `/management/v1/counter/${COUNTER}/offline_conversions/upload`, {
            params: { client_id_type: 'CLIENT_ID', comment: 'Centrio signups' },
            data: form,
            headers: form.getHeaders()
        })
        const sentAt = now.toISOString()
        for (const r of rows) {
            const u = users.find((x) => x.id === r.userId)
            const src = parseSource(u.signupSource) || {}
            await prisma.user.update({ where: { id: r.userId }, data: { signupSource: JSON.stringify({ ...src, offlineSentAt: sentAt }) } })
        }
        console.log(`[metrika-offline] sent ${rows.length} signup(s)`)
        return { sent: rows.length }
    } finally {
        running = false
    }
}

function startMetrikaOfflineCron() {
    cron.schedule('*/30 * * * *', () => { uploadSignups().catch((e) => console.error('[metrika-offline] failed:', e.response?.data?.message || e.message)) })
    console.log('[metrika-offline] cron scheduled (every 30 minutes)')
}

module.exports = { startMetrikaOfflineCron, uploadSignups }
