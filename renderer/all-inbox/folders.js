// Own folders of «Все мессенджеры» (3.8.3, Oleg 2026-11-12: «сделать ручные папки как в ТГ или Максе»). A folder is a
// name and the ids of its chats (`<tab id>::<chat key>`, as in merge.js); the filters by kind stay beside them.
// Every change returns a new list.
const MAX_NAME = 32
const MAX_FOLDERS = 30
const MAX_CHATS = 1000

/** @typedef {{ id: string, name: string, chats: string[] }} Folder */

/** @returns {Folder[]} */
function cleanFolders(raw) {
    if (!Array.isArray(raw)) return []
    return raw
        .filter((f) => f && typeof f.id === 'string' && f.id && typeof f.name === 'string' && f.name.trim())
        .slice(0, MAX_FOLDERS)
        .map((f) => ({
            id: f.id,
            name: f.name.trim().slice(0, MAX_NAME),
            chats: [...new Set((Array.isArray(f.chats) ? f.chats : []).filter((c) => typeof c === 'string' && c))].slice(0, MAX_CHATS)
        }))
}

const newId = () => `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

function addFolder(folders, name, makeId = newId) {
    const clean = String(name || '').trim().slice(0, MAX_NAME)
    if (!clean || folders.length >= MAX_FOLDERS) return folders
    return [...folders, { id: makeId(), name: clean, chats: [] }]
}

function renameFolder(folders, id, name) {
    const clean = String(name || '').trim().slice(0, MAX_NAME)
    if (!clean) return folders
    return folders.map((f) => (f.id === id ? { ...f, name: clean } : f))
}

const deleteFolder = (folders, id) => folders.filter((f) => f.id !== id)

function addChat(folders, id, chatId) {
    return folders.map((f) => (f.id === id && !f.chats.includes(chatId) ? { ...f, chats: [...f.chats, chatId].slice(-MAX_CHATS) } : f))
}

const removeChat = (folders, id, chatId) => folders.map((f) => (f.id === id ? { ...f, chats: f.chats.filter((c) => c !== chatId) } : f))

const foldersOf = (folders, chatId) => folders.filter((f) => f.chats.includes(chatId)).map((f) => f.id)

module.exports = { cleanFolders, addFolder, renameFolder, deleteFolder, addChat, removeChat, foldersOf, MAX_NAME, MAX_FOLDERS }
