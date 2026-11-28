'use strict'
// "таймер 15 мин", "timer 10m", "таймер 1:30", "через 20 минут", "таймер 2 часа чай": how long, and what for (the rest of the line).
// A bare "таймер" or "timer" asks to see the running ones.
const UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 }
const UNIT_OF = {
    с: 's', сек: 's', секунд: 's', секунду: 's', секунды: 's', s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
    м: 'm', мин: 'm', минут: 'm', минуту: 'm', минуты: 'm', m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
    ч: 'h', час: 'h', часа: 'h', часов: 'h', h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h'
}
const MAX_MS = 24 * 60 * 60 * 1000
const MAX_LABEL = 60

/** One part of a duration at `at`: "15 мин" (two words) or "15мин" (one); null when there is none */
function readPart(tokens, at) {
    const glued = /^(\d+(?:[.,]\d+)?)([a-zа-я]+)$/.exec(tokens[at])
    if (glued) {
        const unit = UNIT_OF[glued[2]]
        return unit ? { ms: Number(glued[1].replace(',', '.')) * UNIT_MS[unit], tokens: 1 } : null
    }
    if (/^\d+(?:[.,]\d+)?$/.test(tokens[at]) && UNIT_OF[tokens[at + 1]]) {
        return { ms: Number(tokens[at].replace(',', '.')) * UNIT_MS[UNIT_OF[tokens[at + 1]]], tokens: 2 }
    }
    return null
}

function parseDuration(tokens) {
    // "1:30" or "1:30:15"
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(tokens[0] || '')) {
        const parts = tokens[0].split(':').map(Number)
        const ms = parts.length === 3 ? parts[0] * UNIT_MS.h + parts[1] * UNIT_MS.m + parts[2] * UNIT_MS.s : parts[0] * UNIT_MS.m + parts[1] * UNIT_MS.s
        return { ms, used: 1 }
    }
    let total = 0
    let used = 0
    while (used < tokens.length) {
        // "15 мин", "15мин", "1,5 часа"
        const part = readPart(tokens, used)
        if (!part) break
        used += part.tokens
        total += part.ms
    }
    return used ? { ms: Math.round(total), used } : null
}

/**
 * @param {string} text
 * @returns {{ ms: number, label: string } | { list: true } | null}
 */
function parseTimerQuery(text) {
    const source = String(text || '').trim().toLowerCase()
    if (!source || source.length > 100) return null
    let tokens = source.split(/\s+/)
    const first = tokens[0]
    if (first === 'таймер' || first === 'timer' || first === 'таймеры') {
        tokens = tokens.slice(1)
        if (!tokens.length) return { list: true }
    } else if (first === 'через' || first === 'in' || first === 'remind') {
        tokens = tokens.slice(1)
    } else if (!/^\d/.test(first) || !/(мин|час|сек|min|hour|sec)/.test(source) || /\d\s*[smhсмч](\s|$)/.test(source)) {
        // without the word «таймер» only the full names of the time units count: «5 м» is five metres, not five minutes
        return null
    }
    const found = parseDuration(tokens)
    if (!found || found.ms <= 0 || found.ms > MAX_MS) return null
    // a plain "5" or "10 usd" is not a timer: without the word the line must be only a duration
    if (first !== 'таймер' && first !== 'timer' && first !== 'через' && first !== 'in' && first !== 'remind' && found.used !== tokens.length) return null
    return { ms: found.ms, label: tokens.slice(found.used).join(' ').slice(0, MAX_LABEL) }
}

/** 90000 -> "1:30", 3725000 -> "1:02:05" */
function formatClock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    const two = (n) => String(n).padStart(2, '0')
    return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`
}

module.exports = { parseTimerQuery, formatClock }
