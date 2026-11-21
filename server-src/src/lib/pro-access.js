'use strict'
// Pro on the server side: a paid personal plan, OR a paid seat in a team. An employee on a seat has the plan FREE of
// their own, and every server gate that looked at the plan only cut them off from what the team paid for (notes, sync of
// more than 3 messengers, the online chat, the assistant, the number of devices). One place decides it now.

// every employee of a team has this many devices (computers and the site; the phone has a slot of its own)
const SEAT_DEVICE_LIMIT = 3

const personalPro = (user) => !!user && !!user.plan && user.plan !== 'FREE' && (!user.planExpiresAt || new Date(user.planExpiresAt) > new Date())

// A team may have its own number of computers per employee (the owner of Centrio sets it, 2026-11-19: «один компьютер на одного
// менеджера»): data/org-device-limits.json, { "<orgId>": 1 }. Read again when the file changes, no restart needed.
const fs = require('fs')
const path = require('path')
const LIMITS_FILE = path.join(__dirname, '..', '..', 'data', 'org-device-limits.json')
let limitsCache = { mtime: -1, data: {} }
function orgDeviceLimits() {
  try {
    const st = fs.statSync(LIMITS_FILE)
    if (st.mtimeMs !== limitsCache.mtime) limitsCache = { mtime: st.mtimeMs, data: JSON.parse(fs.readFileSync(LIMITS_FILE, 'utf8')) }
  } catch { limitsCache = { mtime: -1, data: {} } }
  return limitsCache.data
}

/** The number of computers the owner of a team set for its employees (not the owner), whatever their own plan; null when none is set. */
async function teamDeviceLimit(userId) {
  if (!userId) return null
  try {
    const { getOrgSummaryForUser } = require('./org')
    const org = await getOrgSummaryForUser(userId)
    if (!org || org.orgIsOwner) return null
    const own = Number(orgDeviceLimits()[org.orgId])
    return Number.isInteger(own) && own >= 1 && own <= 10 ? own : null
  } catch { return null }
}

/** How many computers the person may have as an employee on a paid seat; null when they are not on a seat. */
async function seatDeviceLimit(userId) {
  if (!userId) return null
  try {
    const { getOrgSummaryForUser } = require('./org')
    const org = await getOrgSummaryForUser(userId)
    if (!org || !org.orgProSeat) return null
    const own = Number(orgDeviceLimits()[org.orgId])
    return Number.isInteger(own) && own >= 1 && own <= 10 ? own : SEAT_DEVICE_LIMIT
  } catch { return null }
}

/** Whether the person sits on a paid seat of a team. */
async function hasSeatPro(userId) {
  if (!userId) return false
  try {
    const { getOrgSummaryForUser } = require('./org')
    const org = await getOrgSummaryForUser(userId)
    return !!(org && org.orgProSeat)
  } catch {
    return false
  }
}

/** Pro by a personal plan or by a paid team seat. */
async function hasProAccess(user) {
  if (!user) return false
  if (personalPro(user)) return true
  return hasSeatPro(user.id)
}

module.exports = { hasProAccess, hasSeatPro, seatDeviceLimit, teamDeviceLimit, personalPro, SEAT_DEVICE_LIMIT }
