// Writing commands for a person's devices (TEAM control, 2026-11-08). Used by the owner's buttons
// and by member removal, which queues a wipe before the membership is gone.
const prisma = require('../utils/prisma')
const { planCommands } = require('./team-commands')
const { emitOrgEvent } = require('./team-events')

async function queueCommands({ orgId, userId, kind, payload, createdById }) {
    const devices = await prisma.orgDeviceKey.findMany({ where: { userId, orgId }, select: { id: true } })
    const rows = planCommands(kind, { orgId, userId, deviceKeyIds: devices.map((d) => d.id), payload, createdById })
    await prisma.orgCommand.createMany({ data: rows })
    emitOrgEvent(orgId, 'command', { userId, kind })
    return rows.length
}

module.exports = { queueCommands }
