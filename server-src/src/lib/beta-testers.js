// Beta testers — «Друзья Centrio» (owner, 2026-11-12). The list lives in data/beta-testers.json: people the owner adds by
// hand (source "owner") and people who ticked «Участвовать в тестировании» in Settings → Система (source "self", 3.8.2+).
// /api/auth/me returns betaTester: true for them, their Centrio (3.8.1+) reads the beta update channel, the profile shows
// «Друг Centrio» and they get the «Друг Centrio» achievement. The file is read again when it changes: no restart needed.
const fs = require("fs")
const path = require("path")

const FILE = process.env.BETA_TESTERS_FILE || path.join(__dirname, "..", "..", "data", "beta-testers.json")
const ABOUT = "Друзья Centrio (бета-тестировщики): получают тестовые версии раньше всех. source owner — добавил владелец, self — сами в настройках."
const MAX_NAME = 80
let cache = { mtime: 0, data: null }

function readList() {
  try {
    const mtime = fs.statSync(FILE).mtimeMs
    if (cache.data && mtime === cache.mtime) return cache.data
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))
    const testers = (Array.isArray(raw.testers) ? raw.testers : []).filter((t) => t && typeof t.userId === "string")
    cache = { mtime, data: { about: raw.about || ABOUT, testers } }
  } catch (err) {
    if (err.code !== "ENOENT") console.error("[beta-testers] cannot read the list:", err.message)
    cache = { mtime: 0, data: { about: ABOUT, testers: [] } }
  }
  return cache.data
}

function writeList(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  const temp = `${FILE}.tmp`
  fs.writeFileSync(temp, JSON.stringify(data, null, 1) + "\n")
  fs.renameSync(temp, FILE)
  cache = { mtime: 0, data: null }
}

function isBetaTester(userId) {
  return !!userId && readList().testers.some((t) => t.userId === String(userId))
}

// The person's own choice from the app. Leaving removes them whoever added them: it is their computer that gets test versions.
function setSelf(userId, enabled, name) {
  const id = String(userId || "")
  if (!id) throw new Error("no user")
  const list = readList()
  const others = list.testers.filter((t) => t.userId !== id)
  const mine = list.testers.find((t) => t.userId === id)
  if (enabled && mine) return true
  if (!enabled && !mine) return false
  const testers = enabled
    ? [...others, { userId: id, name: String(name || "").slice(0, MAX_NAME), since: new Date().toISOString().slice(0, 10), source: "self" }]
    : others
  writeList({ about: list.about, testers })
  return enabled
}

module.exports = { isBetaTester, setSelf }
