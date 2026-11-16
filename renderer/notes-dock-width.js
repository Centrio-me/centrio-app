'use strict'
// The notes column beside a «Все мессенджеры» chat: its width is the person's. The edge next to the chat is dragged,
// the width is kept on this computer; a double click on the edge brings back the usual one (Oleg, 2026-11-13: «нужна
// возможность двигать разделитель»).

const MIN_DOCK = 340
const MIN_CHAT = 380
const USUAL_MIN = 420
const USUAL_MAX = 760
const KEY = 'centrio-notes-dock-width'

/**
 * The width the column takes in an area this wide.
 * @param {*} saved a width kept earlier (a number, text, or nothing)
 * @param {number} areaWidth the width of the content area
 */
function dockWidth(saved, areaWidth) {
    const n = Number(saved)
    const usual = Math.round(Math.max(USUAL_MIN, Math.min(USUAL_MAX, areaWidth * 0.46)))
    const wanted = saved == null || saved === '' || !Number.isFinite(n) ? usual : n
    const most = Math.max(MIN_DOCK, areaWidth - MIN_CHAT)
    return Math.round(Math.max(MIN_DOCK, Math.min(most, wanted)))
}

function readSaved() { try { return localStorage.getItem(KEY) } catch { return null } }
function saveWidth(w) { try { localStorage.setItem(KEY, String(w)) } catch {} }
function forgetWidth() { try { localStorage.removeItem(KEY) } catch {} }

module.exports = { dockWidth, readSaved, saveWidth, forgetWidth, MIN_DOCK, MIN_CHAT }
