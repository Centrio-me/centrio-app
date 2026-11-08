// Parsing the team live stream (Server-Sent Events) and the reconnect delay (TEAM control, 2026-11-08).
const BASE_DELAY_MS = 2000
const MAX_DELAY_MS = 60000

function parseBlock(block) {
    let type = 'message'
    let data = ''
    for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue
        if (line.startsWith('event:')) type = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
    }
    if (!data && type === 'message') return null
    try {
        return { type, data: data ? JSON.parse(data) : {} }
    } catch {
        return { type, data: {} }
    }
}

function parseSse(chunk, carry) {
    const text = (carry + chunk).replace(/\r\n/g, '\n')
    const blocks = text.split('\n\n')
    const rest = blocks.pop()
    const events = blocks.map(parseBlock).filter(Boolean)
    return { events, carry: rest }
}

// 2 s, 4 s, 8 s… up to 60 s, ±20 % so a whole office does not reconnect in the same second.
function nextDelay(attempt, random = Math.random) {
    const base = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt)
    const jittered = base * (0.8 + 0.4 * random())
    return Math.min(MAX_DELAY_MS, Math.round(jittered))
}

module.exports = { parseSse, nextDelay }
