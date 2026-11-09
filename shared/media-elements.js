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

module.exports = { findMediaElements, pickResumeTarget, FIND_MEDIA_SOURCE, PICK_RESUME_SOURCE }
