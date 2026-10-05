// Password import (2026-10-06): reads the CSV a browser or another password manager exports and turns it into
// entries for the vault. Pure functions, no Electron: unit-testable. Passwords exist here only while the file is
// being parsed in the main process; they never go to the renderer.
//
// One tolerant parser covers Chrome, Edge, Yandex Browser, Opera, Brave, Firefox, Bitwarden, 1Password, LastPass and
// KeePass: every one of them exports a table, they only name the columns differently.
const MAX_FILE_BYTES = 8 * 1024 * 1024
const MAX_ROWS = 5000

// A column header (lower-cased, trimmed) -> what it holds.
const HEADER_ALIASES = {
    url: ['url', 'login_uri', 'web site', 'website', 'web_site', 'site', 'uri', 'address', 'origin', 'hostname', 'login uri'],
    login: ['username', 'login', 'login_username', 'login name', 'user', 'user name', 'email', 'login_name', 'логин'],
    password: ['password', 'login_password', 'pass', 'пароль'],
    title: ['name', 'title', 'account', 'account name', 'label', 'название', 'site name'],
    note: ['note', 'notes', 'comment', 'comments', 'extra', 'заметка']
}

function stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function detectDelimiter(firstLine) {
    const counts = { ',': 0, ';': 0, '\t': 0 }
    let quoted = false
    for (const ch of firstLine) {
        if (ch === '"') quoted = !quoted
        else if (!quoted && ch in counts) counts[ch] += 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

/** RFC 4180 CSV: quoted fields, doubled quotes, line breaks inside quotes. Returns an array of rows. */
function parseCsv(text) {
    const source = stripBom(String(text || ''))
    const firstLine = source.split(/\r?\n/, 1)[0] || ''
    const delimiter = detectDelimiter(firstLine)
    const rows = []
    let row = []
    let field = ''
    let quoted = false
    for (let i = 0; i < source.length; i += 1) {
        const ch = source[i]
        if (quoted) {
            if (ch === '"') {
                if (source[i + 1] === '"') { field += '"'; i += 1 } else quoted = false
            } else field += ch
        } else if (ch === '"') quoted = true
        else if (ch === delimiter) { row.push(field); field = '' }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && source[i + 1] === '\n') i += 1
            row.push(field)
            field = ''
            if (row.some((cell) => cell !== '')) rows.push(row)
            row = []
            if (rows.length > MAX_ROWS + 1) break
        } else field += ch
    }
    row.push(field)
    if (row.some((cell) => cell !== '')) rows.push(row)
    return rows
}

function columnIndexes(header) {
    const names = header.map((h) => String(h || '').trim().toLowerCase())
    const index = {}
    for (const [kind, aliases] of Object.entries(HEADER_ALIASES)) {
        const found = names.findIndex((name) => aliases.includes(name))
        if (found >= 0) index[kind] = found
    }
    return index
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

/**
 * @returns {{ entries: Array<{title,url,login,password}>, skipped: number, error?: string }}
 * error: 'EMPTY' | 'TOO_BIG' | 'NO_COLUMNS'
 */
function parseImport(text, normalizeUrl) {
    if (Buffer.byteLength(String(text || ''), 'utf8') > MAX_FILE_BYTES) return { entries: [], skipped: 0, error: 'TOO_BIG' }
    const rows = parseCsv(text)
    if (rows.length < 2) return { entries: [], skipped: 0, error: 'EMPTY' }
    const index = columnIndexes(rows[0])
    if (index.password === undefined || (index.url === undefined && index.title === undefined)) {
        return { entries: [], skipped: 0, error: 'NO_COLUMNS' }
    }
    const cell = (row, kind) => (index[kind] === undefined ? '' : String(row[index[kind]] || '').trim())

    const entries = []
    let skipped = 0
    for (const row of rows.slice(1, MAX_ROWS + 1)) {
        const password = index.password !== undefined ? String(row[index.password] || '') : ''
        let url = cell(row, 'url')
        const title = cell(row, 'title')
        if (!password) { skipped += 1; continue }
        if (/^android:\/\//i.test(url)) { skipped += 1; continue } // app passwords from Chrome on Android have no site
        if (!url && /^[\w-]+(\.[\w-]+)+$/.test(title)) url = title // some managers keep only the site name
        const normalized = typeof normalizeUrl === 'function' ? normalizeUrl(url) : url
        if (!normalized) { skipped += 1; continue }
        entries.push({ title: title || hostOf(normalized) || normalized, url: normalized, login: cell(row, 'login'), password })
    }
    return { entries, skipped }
}

module.exports = { parseCsv, parseImport, MAX_FILE_BYTES, MAX_ROWS }
