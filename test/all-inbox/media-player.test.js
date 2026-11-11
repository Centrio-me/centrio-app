'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { waveBars, clock, createMediaPlayer } = require('../../renderer/all-inbox/media-player')

test('waveBars shrinks a long waveform to the number of bars, each 0..1 against the loudest', () => {
    const bars = waveBars([0, 31, 0, 31, 10, 10, 20, 20], 4)
    assert.deepStrictEqual(bars.map((x) => Math.round(x * 100) / 100), [1, 1, 0.32, 0.65])
})

test('waveBars gives a quiet even line when there is no waveform', () => {
    const bars = waveBars([], 5)
    assert.strictEqual(bars.length, 5)
    assert.ok(bars.every((x) => x > 0 && x < 1))
})

test('clock writes seconds as m:ss', () => {
    assert.strictEqual(clock(0), '0:00')
    assert.strictEqual(clock(29.6), '0:29')
    assert.strictEqual(clock(83), '1:23')
    assert.strictEqual(clock(NaN), '0:00')
})

function fakeAudio() {
    const a = { src: '', paused: true, currentTime: 0, duration: NaN, handlers: {} }
    a.addEventListener = (type, fn) => { (a.handlers[type] = a.handlers[type] || []).push(fn) }
    a.fire = (type) => (a.handlers[type] || []).forEach((fn) => fn())
    a.play = () => { a.paused = false; a.fire('play'); return Promise.resolve() }
    a.pause = () => { a.paused = true; a.fire('pause') }
    a.removeAttribute = () => { a.src = '' }
    return a
}

function setup(loadResult = { data: 'data:audio/ogg;base64,AA==', mime: 'audio/ogg' }) {
    const audio = fakeAudio()
    const loads = []
    const states = []
    const player = createMediaPlayer({
        load: (id) => { loads.push(id); return Promise.resolve(typeof loadResult === 'function' ? loadResult(id) : loadResult) },
        makeAudio: () => audio,
        toUrl: (data) => `blob:${data.length}`,
        revoke: () => {},
        onChange: (s) => states.push({ ...s })
    })
    return { audio, loads, states, player }
}

test('the first press loads the voice message from the messenger and plays it', async () => {
    const { audio, loads, player } = setup()
    await player.toggle('162327')
    assert.deepStrictEqual(loads, ['162327'])
    assert.strictEqual(audio.paused, false)
    assert.strictEqual(player.state().id, '162327')
    assert.strictEqual(player.state().playing, true)
})

test('a second press pauses, a third goes on from the same place without loading again', async () => {
    const { audio, loads, player } = setup()
    await player.toggle('1')
    audio.currentTime = 7
    await player.toggle('1')
    assert.strictEqual(audio.paused, true)
    await player.toggle('1')
    assert.strictEqual(audio.paused, false)
    assert.strictEqual(audio.currentTime, 7)
    assert.deepStrictEqual(loads, ['1'])
})

test('another voice message stops the one playing and starts from its beginning', async () => {
    const { audio, player } = setup()
    await player.toggle('1')
    audio.currentTime = 12
    await player.toggle('2')
    assert.strictEqual(player.state().id, '2')
    assert.strictEqual(audio.currentTime, 0)
    assert.strictEqual(audio.paused, false)
})

test('a message the messenger could not give is marked failed and nothing plays', async () => {
    const { audio, player } = setup(null)
    await player.toggle('9')
    assert.strictEqual(audio.paused, true)
    assert.strictEqual(player.state().failed, true)
})

test('a press on another message while the first is still loading wins', async () => {
    let release
    const audio = fakeAudio()
    const player = createMediaPlayer({
        load: (id) => id === 'slow' ? new Promise((r) => { release = () => r({ data: 'data:a', mime: 'audio/ogg' }) }) : Promise.resolve({ data: 'data:b', mime: 'audio/ogg' }),
        makeAudio: () => audio, toUrl: (d) => `blob:${d}`, revoke: () => {}, onChange: () => {}
    })
    const first = player.toggle('slow')
    await player.toggle('fast')
    release()
    await first
    assert.strictEqual(player.state().id, 'fast')
    assert.strictEqual(audio.src, 'blob:data:b')
})

test('seek moves to a part of the message and plays it', async () => {
    const { audio, player } = setup()
    await player.toggle('1')
    audio.duration = 30
    player.seek('1', 0.5)
    assert.strictEqual(audio.currentTime, 15)
})

test('at the end the message is marked not playing and starts again from the beginning next time', async () => {
    const { audio, player } = setup()
    await player.toggle('1')
    audio.paused = true
    audio.fire('ended')
    assert.strictEqual(player.state().playing, false)
    assert.strictEqual(player.state().id, '1')
    audio.currentTime = 30
    await player.toggle('1')
    assert.strictEqual(audio.currentTime, 0)
})

test('reset stops and forgets everything (another chat was opened)', async () => {
    const { audio, player } = setup()
    await player.toggle('1')
    player.reset()
    assert.strictEqual(audio.paused, true)
    assert.strictEqual(player.state().id, '')
})

test('decodeWave unpacks Telegram 5-bit waveform bytes', () => {
    const { decodeWave } = require('../../renderer/all-inbox/media-player')
    assert.deepStrictEqual(decodeWave([0xff, 0x03]), [31, 31, 0])
    assert.deepStrictEqual(decodeWave([0b11111, 0]), [31, 0, 0])
    assert.deepStrictEqual(decodeWave(null), [])
})

test('a start cut short by a quick pause is not taken for a failed message', async () => {
    const { audio, player } = setup()
    audio.play = () => { const e = new Error('interrupted by pause'); e.name = 'AbortError'; return Promise.reject(e) }
    await player.toggle('1')
    assert.strictEqual(player.state().failed, false)
})

test('a voice already taken, started while another is still loading, can be paused (no stuck spinner)', async () => {
    let release
    const audio = fakeAudio()
    const player = createMediaPlayer({
        load: (id) => id === 'slow' ? new Promise((r) => { release = () => r({ data: 'data:a', mime: 'audio/ogg' }) }) : Promise.resolve({ data: 'data:b', mime: 'audio/ogg' }),
        makeAudio: () => audio, toUrl: (d) => `blob:${d}`, revoke: () => {}, onChange: () => {}
    })
    await player.toggle('cached')
    const slow = player.toggle('slow')
    await player.toggle('cached')
    assert.strictEqual(player.state().loading, false)
    assert.strictEqual(player.state().playing, true)
    await player.toggle('cached')
    assert.strictEqual(audio.paused, true)
    release(); await slow
    assert.strictEqual(player.state().id, 'cached')
})

test('a sound the window cannot read is marked failed and the previous sound is not played under its name', async () => {
    const audio = fakeAudio()
    const player = createMediaPlayer({
        load: (id) => Promise.resolve({ data: id === 'bad' ? 'data:audio/ogg;base64,%%%' : 'data:x', mime: 'audio/ogg' }),
        makeAudio: () => audio, toUrl: (d) => { if (d.includes('%')) throw new Error('bad base64'); return `blob:${d}` }, revoke: () => {}, onChange: () => {}
    })
    await player.toggle('good')
    await player.toggle('good')
    await player.toggle('bad')
    assert.strictEqual(player.state().failed, true)
    assert.strictEqual(audio.paused, true)
})
