// Running a command the owner sent to this device (TEAM control, 2026-11-08).
// deps: wipe(ids|'all'), reload(messengerId), askRelogin(messengerId), confirm(commandId),
//       notice(key, name), nameOf(messengerId)
// A command is confirmed only after it worked, so a failed wipe is tried again on the next fetch.
async function runCommand(cmd, deps) {
    const messengerId = cmd.payload && cmd.payload.assignmentId ? `org:${cmd.payload.assignmentId}` : null
    if (cmd.kind === 'wipe') {
        await deps.wipe(cmd.payload && cmd.payload.assignmentIds ? cmd.payload.assignmentIds : 'all')
        deps.notice('sessionsEnded', null)
    } else if (cmd.kind === 'reload' && messengerId) {
        deps.reload(messengerId)
        deps.notice('reloaded', deps.nameOf(messengerId))
    } else if (cmd.kind === 'relogin' && messengerId) {
        deps.askRelogin(messengerId)
        deps.notice('relogin', deps.nameOf(messengerId))
    }
    await deps.confirm(cmd.id)
}

module.exports = { runCommand }
