// Repairs a folder list that shows the same folder twice (reported 2026-10-05: three populated folders plus three
// empty ones with the same names). Two kinds of copies are removed, nothing else is ever touched:
//  1. the same folder id listed more than once (only the first stays);
//  2. an EMPTY folder that has the same name as a team-owner folder (orgManaged) in the same workspace: it carries
//     no data and only repeats the folder the owner created. An empty folder the user made on purpose next to
//     another of the user's own folders is never touched.
// Folders of a team owner (orgManaged) are managed on the server and are left alone.
const normalize = (name) => String(name == null ? '' : name).trim().toLowerCase()

function dedupeFolders(folders, messengers) {
    const list = Array.isArray(folders) ? folders : []
    const used = new Set((Array.isArray(messengers) ? messengers : []).map((m) => m && m.folderId).filter(Boolean))

    const seenIds = new Set()
    const uniqueById = list.filter((folder) => {
        if (!folder || !folder.id) return false
        if (seenIds.has(folder.id)) return false
        seenIds.add(folder.id)
        return true
    })

    const ownerKeys = new Set(
        uniqueById.filter((f) => f.orgManaged).map((f) => `${normalize(f.name)}|${f.workspaceId || ''}`)
    )
    const result = uniqueById.filter((f) => f.orgManaged || used.has(f.id) || !ownerKeys.has(`${normalize(f.name)}|${f.workspaceId || ''}`))
    return { folders: result, removed: list.length - result.length }
}

module.exports = { dedupeFolders }
