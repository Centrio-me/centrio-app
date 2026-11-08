// Notes from the owner to one employee or to everyone (TEAM control, 2026-11-08).
const NOTE_MAX = 1000

function recipientsOf(note, members) {
    if (note.toUserId) return members.filter((m) => m.userId === note.toUserId)
    return members.filter((m) => m.userId !== note.createdById)
}

function noteReadSummary(note, members, reads) {
    const recipients = new Set(recipientsOf(note, members).map((m) => m.userId))
    const readBy = new Set(reads.filter((r) => r.noteId === note.id && recipients.has(r.userId)).map((r) => r.userId))
    return { readBy: readBy.size, total: recipients.size }
}

function parseNoteBody(body, memberIds) {
    const text = String(body?.text ?? '').replace(/\r\n?/g, '\n').trim()
    if (!text) return { error: 'Введите текст' }
    if (text.length > NOTE_MAX) return { error: `Не больше ${NOTE_MAX} символов` }
    const toUserId = body?.toUserId ? String(body.toUserId) : null
    if (toUserId && !memberIds.has(toUserId)) return { error: 'Сотрудник не найден' }
    return { text, toUserId }
}

function notesForMember(notes, userId, readIds) {
    return notes
        .filter((n) => (n.toUserId === userId || (n.toUserId === null && n.createdById !== userId)) && !readIds.has(n.id))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
}

module.exports = { noteReadSummary, parseNoteBody, notesForMember, NOTE_MAX }
