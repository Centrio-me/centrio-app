// Безопасная ручная выдача PRO (замена ad-hoc правки одного поля `plan`
// напрямую в БД). BUGFIX (2026-09-09, "PRO поставил ручками — не появляется,
// хотя перезапускал 2 раза"): выяснилось, что plan='PRO' был выставлен без
// обновления planExpiresAt, которое осталось в прошлом. Ежедневный крон
// автопродления (landing/auto-renew-cron.js runAutoRenew(), 10:00 UTC)
// откатывает НА FREE любого пользователя с plan='PRO' И planExpiresAt в
// прошлом — то есть ручная правка одного поля тикающая бомба, а не
// одноразовая ошибка: план держится ровно до следующего запуска крона.
// Этот скрипт всегда выставляет оба поля вместе, как это уже делает
// защищённый путь PATCH /api/admin/users/:id/plan (scripts/deploy-admin-full.js).
//
// Запуск НА СЕРВЕРЕ (там же лежит /var/www/centrio-api):
//   node grant-pro.js <email или user-id> [месяцев=12]
require('/var/www/centrio-api/node_modules/dotenv').config({ path: '/var/www/centrio-api/.env' })
const { PrismaClient } = require('/var/www/centrio-api/node_modules/@prisma/client')

const prisma = new PrismaClient()

const arg = process.argv[2]
const months = Number(process.argv[3]) || 12

if (!arg) {
    console.error('Использование: node grant-pro.js <email или user-id> [месяцев=12]')
    process.exit(1)
}

const isEmail = arg.includes('@')

async function main() {
    const where = isEmail ? { email: arg } : { id: arg }
    const user = await prisma.user.findUnique({ where, select: { id: true, email: true, plan: true, planExpiresAt: true } })
    if (!user) {
        console.error('Пользователь не найден:', arg)
        process.exit(1)
    }
    console.log('Before:', user)

    // Продлеваем от текущей даты истечения, если она ещё не наступила
    // (тот же паттерн, что и в auto-renew-cron.js/deploy-admin-full.js) —
    // иначе продление "сгорает" в уже прошедший срок.
    const now = new Date()
    const base = user.planExpiresAt && user.planExpiresAt > now ? user.planExpiresAt : now
    const exp = new Date(base)
    exp.setMonth(exp.getMonth() + months)

    const updated = await prisma.user.update({
        where: { id: user.id },
        data: { plan: 'PRO', planExpiresAt: exp },
        select: { id: true, email: true, plan: true, planExpiresAt: true }
    })
    console.log('After:', updated)
    await prisma.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
