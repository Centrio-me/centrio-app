// «Сохранить изображение» from a messenger page (3.9.3).
//
// The old way asked the PAGE to fetch the picture (blocked by the site's CORS rules for pictures of another address,
// impossible for blob/canvas/frames) and then did nothing at all when that failed; since 3.5.0 it did not even reach the
// file, because the renderer read `.success` from a plain path string. Now the main process gets the picture itself,
// in order, and the first way that gives real picture bytes wins:
//   1. a data: address        — decoded here
//   2. the address, over the network of the tab's own session (its cookies, the page as referrer, no CORS)
//   3. the page itself        — a blob: address, a picture only the page can read
//   4. a canvas               — its pixels
//   5. the screen             — a picture of the element as the tab shows it (always works for what is visible)
// Whatever happens, the caller gets a result to tell the person plainly: saved (where) or why it did not work.
'use strict'

const fs = require('fs')
const path = require('path')
const logic = require('../../shared/image-save')

const NET_TIMEOUT_MS = 20000
const MIN_PICTURE_PX = 80 // smaller things under the pointer (icons, avatars' dots) are not offered for saving
const PAGE_TIMEOUT_MS = 15000
const MAX_URL_FOR_NET = 20000
const RANDOM_ID = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// What is under the pointer: the picture element (or a CSS background), its place on the page, its address.
// Runs INSIDE the page (source of this function is sent), so it uses only the page's own objects.
function pageProbe(srcURL, px, py, lite) {
    function rectOf(el) {
        var r = el.getBoundingClientRect()
        var left = Math.max(0, r.left), top = Math.max(0, r.top)
        return { x: left, y: top, w: Math.min(r.right, innerWidth) - left, h: Math.min(r.bottom, innerHeight) - top }
    }
    var stack = isFinite(px) && isFinite(py) ? document.elementsFromPoint(px, py) : []
    var el = null, i
    for (i = 0; i < stack.length && !el; i++) {
        var tag = String(stack[i].tagName).toUpperCase()
        if (tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO') el = stack[i]
    }
    if (!el && srcURL) {
        for (i = 0; i < document.images.length && !el; i++) {
            if (document.images[i].currentSrc === srcURL || document.images[i].src === srcURL) el = document.images[i]
        }
    }
    var bgSrc = ''
    if (!el) {
        for (i = 0; i < stack.length && !el; i++) {
            var m = String(getComputedStyle(stack[i]).backgroundImage || '').match(/url\(["']?([^"')]+)/)
            if (m) { el = stack[i]; bgSrc = new URL(m[1], document.baseURI).href }
        }
    }
    if (!el) return null
    var out = { tag: String(el.tagName).toUpperCase(), rect: rectOf(el), src: '', canvas: '' }
    if (out.tag === 'IMG') out.src = el.currentSrc || el.src || ''
    else if (out.tag === 'VIDEO') out.src = el.poster || ''
    else if (out.tag === 'CANVAS') { if (!lite) { try { out.canvas = el.toDataURL('image/png') } catch (e) { out.canvas = '' } } }
    else out.src = bgSrc
    return out
}

// Reads an address with the page's own rights (blob:, relative, or anything only the page may fetch) into a data: address.
async function pageRead(src) {
    var res
    try { res = await fetch(src, { credentials: 'include' }) } catch (e) { res = await fetch(src, { credentials: 'omit', mode: 'cors' }) }
    if (!res.ok) throw new Error('HTTP ' + res.status)
    var blob = await res.blob()
    return await new Promise(function (resolve, reject) {
        var reader = new FileReader()
        reader.onload = function () { resolve(String(reader.result)) }
        reader.onerror = function () { reject(new Error('read')) }
        reader.readAsDataURL(blob)
    })
}

const withTimeout = (promise, ms, code) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(logic.failure(code)), ms)
    promise.then((v) => { clearTimeout(timer); resolve(v) }, (e) => { clearTimeout(timer); reject(e) })
})

function decodeDataUrl(src) {
    const m = String(src).match(/^data:([^;,]*)(;base64)?,(.*)$/s)
    if (!m) throw logic.failure('generic')
    const buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8')
    return { buffer, contentType: m[1], via: 'data' }
}

function netWay(guest, src, pageURL) {
    return async () => {
        if (!/^https?:\/\//i.test(src) || src.length > MAX_URL_FOR_NET) throw logic.failure('generic')
        const ctl = new AbortController()
        const timer = setTimeout(() => ctl.abort(), NET_TIMEOUT_MS)
        try {
            let res
            try {
                res = await guest.session.fetch(src, { signal: ctl.signal, credentials: 'include', referrer: pageURL || undefined })
            } catch { throw logic.failure('network') }
            if (!res.ok) throw logic.failure(logic.codeForStatus(res.status))
            const declared = Number(res.headers.get('content-length'))
            if (declared > logic.MAX_BYTES) throw logic.failure('tooBig')
            const buffer = Buffer.from(await res.arrayBuffer())
            return { buffer, contentType: res.headers.get('content-type'), contentDisposition: res.headers.get('content-disposition'), via: 'net' }
        } finally { clearTimeout(timer) }
    }
}

function pageWay(guest, src) {
    return async () => {
        let dataUrl
        try {
            dataUrl = await withTimeout(guest.executeJavaScript(`(${pageRead.toString()})(${JSON.stringify(src)})`), PAGE_TIMEOUT_MS, 'gone')
        } catch (err) { throw err && err.code ? err : logic.failure('gone') }
        return decodeDataUrl(dataUrl)
    }
}

function canvasWay(dataUrl) {
    return async () => decodeDataUrl(dataUrl)
}

function screenWay(guest, rect) {
    return async () => {
        const zoom = Number(guest.getZoomFactor && guest.getZoomFactor()) || 1
        const box = { x: Math.round(rect.x * zoom), y: Math.round(rect.y * zoom), width: Math.round(rect.w * zoom), height: Math.round(rect.h * zoom) }
        if (box.width < 4 || box.height < 4) throw logic.failure('gone')
        let image
        try { image = await withTimeout(guest.capturePage(box), PAGE_TIMEOUT_MS, 'gone') } catch { throw logic.failure('gone') }
        if (!image || image.isEmpty()) throw logic.failure('gone')
        return { buffer: image.toPNG(), contentType: 'image/png', via: 'screen' }
    }
}

// The ways for this picture, most faithful first. `probe` is what the page told about the element under the pointer.
function buildWays(guest, payload, probe) {
    const pageURL = String(payload.pageURL || '')
    const sources = []
    const add = (s) => { if (typeof s === 'string' && s && !sources.includes(s)) sources.push(s) }
    add(payload.srcURL)
    if (probe) add(probe.src)
    const ways = []
    for (const src of sources) {
        if (src.startsWith('data:')) ways.push(async () => decodeDataUrl(src))
        else if (/^https?:/i.test(src)) ways.push(netWay(guest, src, pageURL))
    }
    for (const src of sources) if (!src.startsWith('data:') || src.length < 2048) ways.push(pageWay(guest, src))
    if (probe && probe.canvas) ways.push(canvasWay(probe.canvas))
    if (probe && probe.rect) ways.push(screenWay(guest, probe.rect))
    return { ways, sources }
}

async function askWhere(deps, name, ext) {
    const prefs = deps.prefs()
    const startDir = prefs.downloadDir || deps.downloadsPath()
    if (prefs.askDownload || !prefs.downloadDir) {
        const win = deps.getMainWindow()
        const res = await deps.dialog.showSaveDialog(win || undefined, {
            title: deps.t('dialogs.saveImage'),
            defaultPath: path.join(startDir, name),
            filters: [{ name: deps.t('dialogs.saveImageFilter'), extensions: [ext] }]
        })
        if (res.canceled || !res.filePath) return null
        return res.filePath
    }
    const target = path.join(startDir, logic.uniqueName(name, (n) => fs.existsSync(path.join(startDir, n))))
    return target
}

/**
 * payload: { srcURL, x, y, pageURL } (x, y: the point in the page). Returns
 *   { ok: true, path, name, bytes, via, id } | { ok: false, canceled: true } | { ok: false, code, dir? }
 */
async function saveImage(guest, payload, deps) {
    const x = Number(payload && payload.x), y = Number(payload && payload.y)
    let probe = null
    try {
        probe = await withTimeout(guest.executeJavaScript(`(${pageProbe.toString()})(${JSON.stringify(String(payload.srcURL || '').slice(0, 20000))},${Number.isFinite(x) ? x : 'NaN'},${Number.isFinite(y) ? y : 'NaN'})`), PAGE_TIMEOUT_MS, 'gone')
    } catch { probe = null }

    const { ways, sources } = buildWays(guest, payload, probe)
    const got = await logic.obtainFirst(ways)
    if (!got.ok) {
        deps.log(`[image-save] failed: ${got.code} tried=${got.tried.join(',')} src=${String(sources[0] || '').slice(0, 80)}`)
        return { ok: false, code: got.code }
    }

    const name = logic.pickFileName({ contentDisposition: got.contentDisposition, url: sources.find((s) => /^https?:/i.test(s)) || '', ext: got.ext })
    let target
    try { target = await askWhere(deps, name, got.ext) } catch { return { ok: false, code: 'generic' } }
    if (!target) return { ok: false, canceled: true }

    try {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, got.buffer)
    } catch (err) {
        deps.log(`[image-save] cannot write ${target}: ${err && err.message}`)
        return { ok: false, code: 'folder', dir: path.dirname(target) }
    }

    const id = RANDOM_ID()
    try {
        deps.addRecord({ id, filename: path.basename(target), url: sources.find((s) => /^https?:/i.test(s)) || '', savePath: target, totalBytes: got.buffer.length, receivedBytes: got.buffer.length, state: 'completed', startTime: Date.now(), endTime: Date.now() })
    } catch { /* the list is a convenience; the file is saved */ }
    deps.log(`[image-save] saved ${path.basename(target)} ${got.buffer.length}B via ${got.via}`)
    return { ok: true, path: target, name: path.basename(target), bytes: got.buffer.length, via: got.via, id }
}

/** Is there a picture (an image, a canvas, a CSS background) under this point of the page? { found, tag, w, h } */
async function probeAt(guest, x, y) {
    try {
        const probe = await withTimeout(guest.executeJavaScript(`(${pageProbe.toString()})("",${Number.isFinite(x) ? x : 'NaN'},${Number.isFinite(y) ? y : 'NaN'},true)`), 1500, 'gone')
        if (!probe || !probe.rect) return { found: false }
        const big = probe.rect.w >= MIN_PICTURE_PX && probe.rect.h >= MIN_PICTURE_PX
        return { found: big, tag: probe.tag, w: Math.round(probe.rect.w), h: Math.round(probe.rect.h) }
    } catch { return { found: false } }
}

module.exports = { saveImage, probeAt, pageProbe, pageRead, buildWays }
