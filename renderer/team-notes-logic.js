// Which note from the owner to show next (TEAM control, 2026-11-08): the oldest one not dismissed.
function nextNoteToShow(notes, dismissedIds) {
    const pending = notes
        .filter((n) => !dismissedIds.has(n.id))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    return pending[0] || null
}

module.exports = { nextNoteToShow }
