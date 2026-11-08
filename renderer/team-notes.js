// A note from the manager (TEAM control, 2026-11-08): a card in the lower right corner that stays
// until the employee presses «Понятно». Never covers the top of the app.
const { nextNoteToShow } = require('./team-notes-logic')
const { teamCornerHost } = require('./team-toast')

function createTeamNotes({ tGet, markRead }) {
    const dismissed = new Set()
    let notes = []
    let card = null

    function hide() {
        card?.remove()
        card = null
    }

    function render() {
        const note = nextNoteToShow(notes, dismissed)
        if (!note) return hide()
        if (card && card.dataset.noteId === note.id) return
        hide()
        card = document.createElement('section')
        card.className = 'team-note-card'
        card.dataset.noteId = note.id
        card.setAttribute('role', 'alertdialog')
        card.setAttribute('aria-labelledby', 'teamNoteTitle')

        const title = document.createElement('div')
        title.className = 'team-note-title'
        title.id = 'teamNoteTitle'
        title.textContent = tGet('teamControl.noteTitle')

        const text = document.createElement('div')
        text.className = 'team-note-text'
        text.textContent = note.text

        const ok = document.createElement('button')
        ok.type = 'button'
        ok.className = 'team-note-ok'
        ok.textContent = tGet('teamControl.noteOk')
        ok.addEventListener('click', () => {
            dismissed.add(note.id)
            markRead(note.id).catch(() => {})
            render()
        })

        card.append(title, text, ok)
        teamCornerHost().prepend(card)
    }

    function setNotes(list) {
        notes = Array.isArray(list) ? list : []
        render()
    }

    return { setNotes, clear: () => setNotes([]) }
}

module.exports = { createTeamNotes }
