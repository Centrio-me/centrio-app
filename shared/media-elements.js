'use strict'
// <video>/<audio> elements of a page, including the ones a site keeps inside (open) shadow roots — VK Video does, so
// the mini-player used to say "nothing is playing" while a VK video played (3.7.2). The same function runs in the
// page: main/bootstrap/registerAppEvents.js polls with it, renderer/media-player-ui.js sends play/pause through it.
// Written in plain ES5 so its source can be injected into any page as is (FIND_MEDIA_SOURCE).

function findMediaElements(rootNode) {
    var MAX_NODES = 30000 // a huge page must not stall the poll
    var r0 = rootNode || document
    // Cheap path first: most sites keep media in the plain DOM; walking every element (every 2 s) only when needed.
    var direct = r0.querySelectorAll('video, audio')
    if (direct.length) return Array.prototype.slice.call(direct)
    var found = []
    var seen = 0
    function scan(r) {
        var media = r.querySelectorAll('video, audio')
        for (var i = 0; i < media.length; i++) found.push(media[i])
        var all = r.querySelectorAll('*')
        for (var j = 0; j < all.length && seen < MAX_NODES; j++) {
            seen++
            if (all[j].shadowRoot) scan(all[j].shadowRoot)
        }
    }
    scan(r0)
    return found
}

// The element to resume: a paused one that already played (or is loaded), not an empty ad slot.
function pickResumeTarget(elements) {
    var list = elements || []
    for (var i = 0; i < list.length; i++) {
        if (list[i].paused && (list[i].currentTime > 0 || list[i].readyState > 2)) return list[i]
    }
    return list[0] || null
}

// The page-side name is bound explicitly: the release build minifies this file and renames the functions, so a
// `function __centrioFindMedia(` declaration would not survive (the injected scripts call it by this name).
const FIND_MEDIA_SOURCE = `var __centrioFindMedia = ${findMediaElements.toString()};`
const PICK_RESUME_SOURCE = pickResumeTarget.toString()


// ── Volume per source (3.7.3) ─────────────────────────────────────
// Self-contained so their source can be injected into a page too: in a page the finder is __centrioFindMedia, in Node
// (tests) it is findMediaElements. A typeof check on a missing name is safe in both.
function clampVolume(value) {
    var n = Number(value)
    if (value === null || value === '' || !isFinite(n)) return null
    return n < 0 ? 0 : (n > 1 ? 1 : n)
}

function setMediaVolume(rootNode, value) {
    var n = Number(value)
    if (value === null || value === '' || !isFinite(n)) return 0
    var level = n < 0 ? 0 : (n > 1 ? 1 : n)
    var find = typeof __centrioFindMedia === 'function' ? __centrioFindMedia : findMediaElements
    var list = find(rootNode)
    for (var i = 0; i < list.length; i++) {
        try {
            list[i].volume = level
            // moving the slider up brings the sound back if the site had muted the element
            if (level > 0) list[i].muted = false
        } catch (e) {}
    }
    return list.length
}

function readMediaLevel(rootNode) {
    var find = typeof __centrioFindMedia === 'function' ? __centrioFindMedia : findMediaElements
    var list = find(rootNode)
    if (!list.length) return { hasElement: false, volume: 1, muted: false }
    var pick = list[0]
    for (var i = 0; i < list.length; i++) { if (!list[i].paused) { pick = list[i]; break } }
    var v = Number(pick.volume)
    return { hasElement: true, volume: isFinite(v) ? Math.round(v * 100) / 100 : 1, muted: !!pick.muted }
}

const SET_VOLUME_SOURCE = `var __centrioSetVolume = ${setMediaVolume.toString()};`
const READ_LEVEL_SOURCE = `var __centrioReadLevel = ${readMediaLevel.toString()};`

module.exports = { findMediaElements, pickResumeTarget, FIND_MEDIA_SOURCE, PICK_RESUME_SOURCE, clampVolume, setMediaVolume, readMediaLevel, SET_VOLUME_SOURCE, READ_LEVEL_SOURCE }
