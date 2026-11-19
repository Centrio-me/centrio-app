const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')

// The window reads the store from a cache that only holds the keys listed for hydration (renderer.js), and a profile keeps
// only the keys listed in main/ipc/profile.js. The per-tab microphone and camera switches (3.9.0) were in neither: after a
// restart the menu said «on» again, and the next click wrote a list with that one tab over all the others (Lucil, 2026-11-19:
// «перезапускаю программу — не сохраняет настройки»).
test('the microphone and camera switches of the tabs are loaded at the start of the window', () => {
    const src = fs.readFileSync(require.resolve('../renderer.js'), 'utf8')
    assert.match(src, /\['mediaPermissions',\s*\{\}\]/)
})

test('the microphone and camera switches belong to the profile of the account', () => {
    const src = fs.readFileSync(require.resolve('../main/ipc/profile.js'), 'utf8')
    assert.match(src, /'mediaPermissions'/)
})

test('the main process lets the window save the microphone and camera switches', () => {
    // store:set answers { success: false } for a key that is not in ALLOWED_STORE_ROOTS, and the window does not look at the
    // answer: until 3.9.1 the switches were thrown away without a word and never worked (Lucil, 2026-11-19)
    const src = fs.readFileSync(require.resolve('../main.js'), 'utf8')
    const start = src.indexOf('const ALLOWED_STORE_ROOTS = new Set([')
    const block = src.slice(start, src.indexOf('])', start))
    assert.ok(start > 0 && block.includes("'mediaPermissions'"))
})
