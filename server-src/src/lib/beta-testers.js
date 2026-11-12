// Beta testers (owner, 2026-11-12): the owner marks them by hand, the list lives in data/beta-testers.json.
// /api/auth/me returns betaTester: true for them, and their Centrio (3.8.1+) reads the beta update channel.
// The file is read again when it changes, so editing it needs no restart.
const fs = require("fs")
const path = require("path")

const FILE = path.join(__dirname, "..", "..", "data", "beta-testers.json")
let cache = { mtime: 0, ids: new Set() }

function load() {
  try {
    const mtime = fs.statSync(FILE).mtimeMs
    if (mtime === cache.mtime) return cache.ids
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"))
    const ids = new Set((Array.isArray(data.testers) ? data.testers : []).map((t) => t && t.userId).filter(Boolean))
    cache = { mtime, ids }
  } catch (err) {
    if (err.code !== "ENOENT") console.error("[beta-testers] cannot read the list:", err.message)
    cache = { mtime: 0, ids: new Set() }
  }
  return cache.ids
}

function isBetaTester(userId) {
  return !!userId && load().has(String(userId))
}

module.exports = { isBetaTester }
