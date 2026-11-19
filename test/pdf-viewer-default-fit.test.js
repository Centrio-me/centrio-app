const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const src = fs.readFileSync(path.join(__dirname, '..', 'pdf-viewer', 'viewer.js'), 'utf8')

test('a PDF opens fitted as a whole page, not by width (owner, 2026-11-19)', () => {
    assert.match(src, /const s = \{[^}]*\bfit: 'page'/)
    assert.match(src, /fitTo\(s\.fit \|\| 'page', true\)/)
})
