// Folders of notes (2026-11-11): a person sorts notes into folders of their own. Names are plain text.
const MAX_FOLDER_NAME = 60
const MAX_FOLDERS = 100

function cleanFolderName(value) {
    if (typeof value !== 'string') return ''
    return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FOLDER_NAME)
}

module.exports = { cleanFolderName, MAX_FOLDERS, MAX_FOLDER_NAME }
