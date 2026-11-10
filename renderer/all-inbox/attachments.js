'use strict'
// «Все мессенджеры»: the files waiting in the message field until «Отправить»

const MAX_ATTACH = 10

/** The staged list with the new files added: each file once, the order kept, no more than the limit. */
function addFiles(staged, incoming) {
    const out = [...(staged || [])]
    const seen = new Set(out.map((x) => x.path))
    for (const file of incoming || []) {
        if (out.length >= MAX_ATTACH) break
        if (!file || typeof file.path !== 'string' || !file.path || typeof file.name !== 'string' || seen.has(file.path)) continue
        seen.add(file.path)
        out.push({ path: file.path, name: file.name, size: Number(file.size) || 0, thumb: typeof file.thumb === 'string' ? file.thumb : '' })
    }
    return out
}

function removeFile(staged, path) {
    return (staged || []).filter((x) => x.path !== path)
}

function formatSize(bytes) {
    const units = ['Б', 'КБ', 'МБ', 'ГБ']
    let v = Number(bytes) || 0
    let i = 0
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
    const n = i === 0 ? String(Math.round(v)) : String(Math.round(v * 10) / 10).replace('.', ',')
    return `${n} ${units[i]}`
}

module.exports = { addFiles, removeFile, formatSize, MAX_ATTACH }
