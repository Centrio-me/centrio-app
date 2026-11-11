'use strict'
// «Все мессенджеры»: voice messages play right in our conversation window. The sound is taken from the messenger's
// own page (its downloader, already signed in) once, and plays here; one message plays at a time, like in Telegram.
// The state lives here, not in the drawn bubbles: the conversation is drawn again on every change and the bubble of
// the playing message just shows this state again.

const QUIET_BAR = 0.18

/**
 * A waveform shrunk to `count` bars, each 0..1 against the loudest point (the messenger's 0..31 values).
 * @param {number[]} values
 * @param {number} count
 * @returns {number[]}
 */
function waveBars(values, count) {
    const list = Array.isArray(values) ? values.filter((v) => Number.isFinite(v)) : []
    if (!list.length) return Array.from({ length: count }, () => QUIET_BAR)
    const bars = []
    for (let i = 0; i < count; i++) {
        const from = Math.floor((i * list.length) / count)
        const to = Math.max(from + 1, Math.floor(((i + 1) * list.length) / count))
        bars.push(Math.max(...list.slice(from, to)))
    }
    const top = Math.max(...bars) || 1
    return bars.map((v) => Math.max(0.08, v / top))
}

/**
 * Telegram's waveform: 5-bit loudness values (0..31) packed one after another, lowest bits first.
 * @param {number[]} bytes
 * @returns {number[]}
 */
function decodeWave(bytes) {
    if (!Array.isArray(bytes) || !bytes.length) return []
    const count = Math.floor((bytes.length * 8) / 5)
    const out = []
    for (let i = 0; i < count; i++) {
        const at = Math.floor((i * 5) / 8)
        const pair = (bytes[at] | 0) | ((bytes[at + 1] | 0) << 8)
        out.push((pair >> ((i * 5) % 8)) & 31)
    }
    return out
}

/** @param {number} seconds @returns {string} m:ss */
function clock(seconds) {
    const s = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * @param {{ load: (id: string) => Promise<{ data: string, mime: string } | null>,
 *   makeAudio?: () => HTMLAudioElement, toUrl?: (data: string, mime: string) => string, revoke?: (url: string) => void,
 *   onChange?: (state: object) => void }} deps
 */
function createMediaPlayer({ load, makeAudio = () => new Audio(), toUrl, revoke = () => {}, onChange = () => {} }) {
    const audio = makeAudio()
    // what was taken from the page stays for this chat: pressing again does not ask the messenger again
    const urls = new Map()
    let id = ''
    let loading = false
    let failed = false
    let ended = false
    let token = 0

    const state = () => ({
        id, loading, failed,
        playing: !!id && !loading && !audio.paused,
        current: Number(audio.currentTime) || 0,
        duration: Number.isFinite(audio.duration) ? audio.duration : 0
    })
    const changed = () => onChange(state())
    for (const type of ['play', 'pause', 'timeupdate', 'loadedmetadata']) audio.addEventListener(type, changed)
    audio.addEventListener('ended', () => { ended = true; changed() })
    audio.addEventListener('error', () => { if (id) { failed = true; changed() } })

    async function start(nextId) {
        const mine = ++token
        audio.pause()
        id = nextId
        failed = false
        ended = false
        // a message still loading for an earlier press does not keep this one «loading»
        loading = false
        let url = urls.get(nextId)
        if (!url) {
            loading = true
            changed()
            const got = await Promise.resolve(load(nextId)).catch(() => null)
            if (mine !== token) return
            loading = false
            if (!got || typeof got.data !== 'string' || !got.data) { failed = true; changed(); return }
            try { url = toUrl(got.data, got.mime) } catch { url = '' }
            // what the window cannot read: failed, and the sound of the previous message is not left to play under this one
            if (!url) { audio.removeAttribute('src'); failed = true; changed(); return }
            urls.set(nextId, url)
        }
        audio.src = url
        audio.currentTime = 0
        // a start cut short by a pause is not a failure; a sound the window cannot play is
        await Promise.resolve(audio.play()).catch((e) => { if (!e || e.name !== 'AbortError') failed = true })
        changed()
    }

    /** Play, pause or go on with a message. */
    async function toggle(nextId) {
        const key = String(nextId)
        if (key !== id || failed) return start(key)
        if (loading) return
        if (!audio.paused) { audio.pause(); return }
        if (ended) { audio.currentTime = 0; ended = false }
        await Promise.resolve(audio.play()).catch(() => {})
        changed()
    }

    /** Jump to a part (0..1) of the message that is playing or paused. */
    function seek(key, part) {
        if (String(key) !== id || !Number.isFinite(audio.duration)) return
        audio.currentTime = Math.max(0, Math.min(1, part)) * audio.duration
        ended = false
        if (audio.paused) Promise.resolve(audio.play()).catch(() => {})
        changed()
    }

    /** Another chat: stop, and give back what was taken from the page. */
    function reset() {
        token++
        audio.pause()
        audio.removeAttribute('src')
        for (const url of urls.values()) revoke(url)
        urls.clear()
        id = ''
        loading = false
        failed = false
        ended = false
        changed()
    }

    return { toggle, seek, reset, state }
}

module.exports = { waveBars, decodeWave, clock, createMediaPlayer }
