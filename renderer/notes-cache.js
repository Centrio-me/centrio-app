'use strict'
// Notes: what the app does with the list it holds when the account data is revalidated (on every return of focus to the
// window and now and then). Wiping it while the column stands beside a chat left the screen showing a list the program
// no longer held: a click on a card did nothing, switching the folder showed «Заметок пока нет» until the window was
// closed and opened again (Oleg, 2026-11-18: «после переключения все заметки пропали, переоткрыл окно — опять всё ок»).

/** @param {boolean} isOpen whether the notes list is on screen @returns {'refresh'|'drop'} */
function staleAction(isOpen) {
    return isOpen ? 'refresh' : 'drop'
}

const SHOWN = ['id', 'title', 'body', 'updatedAt', 'folderId', 'pinned', 'color', 'type', 'position', 'archived']

/** Whether two lists of notes are the same as far as the list on screen shows. */
function sameNotes(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((n, i) => SHOWN.every((k) => n[k] === b[i][k]) && JSON.stringify(n.items || null) === JSON.stringify(b[i].items || null))
}

module.exports = { staleAction, sameNotes }
