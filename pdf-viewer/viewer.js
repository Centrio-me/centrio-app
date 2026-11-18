// The PDF reader page: pdf.js draws the pages, everything around them is ours.
import * as pdfjs from '../node_modules/pdfjs-dist/build/pdf.min.mjs'
import { t, applyI18n } from './i18n.js'
import { createTextTool } from './text-tool.js'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('../node_modules/pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
const ASSETS = new URL('../node_modules/pdfjs-dist/', import.meta.url).href
const $ = (id) => document.getElementById(id)
const CSS_PER_PT = 96 / 72 // 100% is the size Adobe shows: 1 pt = 1.333 css px
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 4, 5]
const MAX_LIVE_PAGES = 20
const PRINT_DPI = 150

const el = { scroller: $('scroller'), pages: $('pages'), thumbs: $('thumbs'), outline: $('outline'), side: $('side'), status: $('status'), toast: $('toast') }
const s = { doc: null, bytes: null, title: '', pages: [], zoom: 1, fit: 'width', rot: 0, current: 1, live: new Set(), search: null, hits: [], hitIndex: -1, token: 0 }

applyI18n()

// ── small helpers ──
let toastTimer = 0
function toast(text) { el.toast.textContent = text; el.toast.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.toast.hidden = true }, 4200) }
function showStatus(title, text) { el.status.hidden = false; el.status.replaceChildren(); const b = document.createElement('b'); b.textContent = title; el.status.appendChild(b); if (text) { const sp = document.createElement('span'); sp.textContent = text; el.status.appendChild(sp) } }
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const cssScale = () => s.zoom * CSS_PER_PT

// ── text tool (needs the page elements) ──
const textTool = createTextTool({
  getPageEl: (num) => s.pages[num - 1]?.div || null,
  getCssScale: cssScale,
  toast,
  canPlace: () => {
    if (!s.doc) return false
    if (s.rot % 360 !== 0) { toast(t('placeRotated')); return false }
    if (s.pages.some((p) => p.intrinsic !== 0)) { toast(t('placeUnsupported')); return false }
    return true
  }
})

// ── loading ──
async function loadDocument(bytes, title) {
  const token = ++s.token
  showStatus(t('loading'))
  if (s.doc) { try { await s.doc.destroy() } catch {} }
  textTool.clearAll()
  s.doc = null; s.pages = []; s.live.clear(); s.hits = []; s.hitIndex = -1; s.rot = 0; s.current = 1
  el.pages.replaceChildren(); el.thumbs.replaceChildren(); el.outline.replaceChildren()
  s.bytes = bytes; s.title = title || t('unnamed')
  $('docName').textContent = s.title; window.centrioPdf.setTitle(s.title)
  const task = pdfjs.getDocument({ data: bytes.slice(), cMapUrl: ASSETS + 'cmaps/', cMapPacked: true, standardFontDataUrl: ASSETS + 'standard_fonts/', wasmUrl: ASSETS + 'wasm/', iccUrl: ASSETS + 'iccs/' })
  task.onPassword = (provide, reason) => askPassword(reason === 2).then((pw) => (pw == null ? task.destroy() : provide(pw)))
  let doc
  try { doc = await task.promise } catch (err) {
    if (token !== s.token) return
    if (err && err.name === 'PasswordException') { showStatus(t('pwTitle')); return }
    showStatus(t('failedTitle'), t('failedText')); return
  }
  if (token !== s.token) { doc.destroy(); return }
  s.doc = doc
  $('pageTotal').textContent = '/ ' + doc.numPages
  await buildPages(token)
  if (token !== s.token) return
  el.status.hidden = true
  fitTo(s.fit || 'width', true)
  buildThumbs(); buildOutline()
  updateChrome()
  el.scroller.focus()
}

async function buildPages(token) {
  const total = s.doc.numPages
  for (let from = 1; from <= total; from += 24) {
    const batch = []
    for (let n = from; n < Math.min(total + 1, from + 24); n++) batch.push(s.doc.getPage(n))
    const pages = await Promise.all(batch)
    if (token !== s.token) return
    pages.forEach((page, i) => {
      const num = from + i
      const [x0, y0, x1, y1] = page.view
      const div = document.createElement('div')
      div.className = 'page loading'; div.dataset.num = num
      el.pages.appendChild(div)
      s.pages.push({ num, div, page, w: x1 - x0, h: y1 - y0, intrinsic: ((page.rotate % 360) + 360) % 360, rendered: false, key: '' })
      observer.observe(div)
    })
  }
}

function askPassword(wrong) {
  return new Promise((resolve) => {
    const modal = $('pwModal'), input = $('pwInput'), form = $('pwForm')
    $('pwText').textContent = wrong ? t('pwWrong') : t('pwText')
    input.value = ''; modal.hidden = false; input.focus()
    const done = (value) => { modal.hidden = true; form.onsubmit = null; $('pwCancel').onclick = null; resolve(value) }
    form.onsubmit = (e) => { e.preventDefault(); done(input.value) }
    $('pwCancel').onclick = () => done(null)
  })
}

// ── layout and zoom ──
const viewRotation = (p) => (p.intrinsic + s.rot) % 360
// The page as it is shown (turns taken into account), in points.
function dims(p) { const swap = viewRotation(p) % 180 !== 0; return swap ? { w: p.h, h: p.w } : { w: p.w, h: p.h } }
function pageSize(p) { const d = dims(p); return { w: d.w * cssScale(), h: d.h * cssScale() } }

function layout() {
  for (const p of s.pages) {
    const { w, h } = pageSize(p)
    p.div.style.width = Math.floor(w) + 'px'; p.div.style.height = Math.floor(h) + 'px'
    p.div.style.setProperty('--scale-factor', cssScale()); p.div.style.setProperty('--total-scale-factor', cssScale())
    if (p.rendered) { p.rendered = false; p.key = '' }
  }
}

function setZoom(zoom, fit) {
  if (!s.doc) return
  const anchor = anchorOf()
  s.zoom = clamp(zoom, 0.1, 6); s.fit = fit || null
  layout(); restoreAnchor(anchor)
  releaseAll(); renderVisible(); updateChrome()
}
function fitTo(kind, first) {
  if (!s.doc) return
  const p = s.pages[s.current - 1] || s.pages[0]
  if (!p) return
  const probe = dims(p)
  const availW = el.scroller.clientWidth - 64, availH = el.scroller.clientHeight - 36
  const byWidth = availW / (probe.w * CSS_PER_PT), byHeight = availH / (probe.h * CSS_PER_PT)
  const zoom = kind === 'page' ? Math.min(byWidth, byHeight) : Math.min(byWidth, 3)
  if (first) { s.zoom = clamp(zoom, 0.1, 6); s.fit = kind; layout(); renderVisible(); updateChrome() } else setZoom(zoom, kind)
}
function stepZoom(dir) {
  const cur = s.zoom
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > cur + 0.005) : [...ZOOM_STEPS].reverse().find((z) => z < cur - 0.005)
  setZoom(next || cur)
}
function anchorOf() {
  const p = s.pages[s.current - 1]
  if (!p) return null
  return { num: s.current, frac: (el.scroller.scrollTop - p.div.offsetTop + 8) / Math.max(1, p.div.offsetHeight) }
}
function restoreAnchor(a) {
  if (!a) return
  const p = s.pages[a.num - 1]
  if (p) el.scroller.scrollTop = p.div.offsetTop - 8 + a.frac * p.div.offsetHeight
}

// ── rendering (only pages near the viewport) ──
const observer = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) renderPage(s.pages[Number(e.target.dataset.num) - 1])
}, { root: el.scroller, rootMargin: '700px 0px' })

function renderVisible() {
  const top = el.scroller.scrollTop, bottom = top + el.scroller.clientHeight
  for (const p of s.pages) { const y = p.div.offsetTop; if (y + p.div.offsetHeight > top - 700 && y < bottom + 700) renderPage(p) }
}
function releaseAll() {
  for (const p of s.pages) { if (p.task) { try { p.task.cancel() } catch {} } clearPage(p) }
  s.live.clear()
}
function clearPage(p) { p.div.querySelectorAll('canvas, .textLayer').forEach((n) => n.remove()); p.div.classList.add('loading'); p.rendered = false; p.key = '' }

async function renderPage(p) {
  if (!p || !s.doc) return
  const key = `${s.zoom.toFixed(4)}|${s.rot}`
  if (p.key === key) return
  p.key = key
  const token = s.token
  if (p.task) { try { p.task.cancel() } catch {} }
  p.div.querySelectorAll('canvas, .textLayer').forEach((n) => n.remove())
  const viewport = p.page.getViewport({ scale: cssScale(), rotation: viewRotation(p) })
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width * dpr); canvas.height = Math.floor(viewport.height * dpr)
  canvas.style.width = Math.floor(viewport.width) + 'px'; canvas.style.height = Math.floor(viewport.height) + 'px'
  p.div.insertBefore(canvas, p.div.firstChild)
  p.task = p.page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null })
  try { await p.task.promise } catch (err) { if (err && err.name === 'RenderingCancelledException') return; if (p.key === key) p.key = ''; return }
  if (token !== s.token || p.key !== key) return
  p.div.classList.remove('loading')
  const layer = document.createElement('div'); layer.className = 'textLayer'
  p.div.appendChild(layer)
  try {
    await new pdfjs.TextLayer({ textContentSource: p.page.streamTextContent(), container: layer, viewport }).render()
  } catch {}
  if (token !== s.token || p.key !== key) return
  p.rendered = true
  s.live.add(p.num)
  textTool.reattach(p.num)
  applyHighlights(p)
  trimLive()
}
function trimLive() {
  if (s.live.size <= MAX_LIVE_PAGES) return
  const far = [...s.live].sort((a, b) => Math.abs(b - s.current) - Math.abs(a - s.current))
  while (s.live.size > MAX_LIVE_PAGES) { const n = far.shift(); const p = s.pages[n - 1]; if (p) clearPage(p); s.live.delete(n) }
}

// ── page tracking, navigation ──
let ticking = false
el.scroller.addEventListener('scroll', () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { ticking = false; trackCurrent() }) })
function trackCurrent() {
  if (!s.pages.length) return
  const mid = el.scroller.scrollTop + el.scroller.clientHeight * 0.35
  let n = s.current
  for (const p of s.pages) { if (p.div.offsetTop <= mid) n = p.num; else break }
  if (n !== s.current) { s.current = n; updateChrome() }
}
function goTo(num, smooth) {
  const p = s.pages[clamp(num, 1, s.pages.length) - 1]
  if (!p) return
  el.scroller.scrollTo({ top: p.div.offsetTop - 12, behavior: smooth ? 'smooth' : 'auto' })
  s.current = p.num; updateChrome()
}
function updateChrome() {
  if (!s.doc) return
  $('zoomLabel').textContent = Math.round(s.zoom * 100) + '%'
  const input = $('pageInput'); if (document.activeElement !== input) input.value = s.current
  $('btnPrev').disabled = s.current <= 1; $('btnNext').disabled = s.current >= s.pages.length
  document.querySelectorAll('.thumb').forEach((b) => { const on = Number(b.dataset.num) === s.current; b.classList.toggle('on', on); if (on && b.dataset.seen) b.scrollIntoView({ block: 'nearest' }) })
}

// ── sidebar: thumbnails and outline ──
const thumbObserver = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { thumbObserver.unobserve(e.target); drawThumb(e.target) } }, { root: el.thumbs, rootMargin: '300px 0px' })
function buildThumbs() {
  const frag = document.createDocumentFragment()
  for (const p of s.pages) {
    const b = document.createElement('button'); b.className = 'thumb'; b.dataset.num = p.num; b.type = 'button'
    const d = p.intrinsic % 180 ? { w: p.h, h: p.w } : { w: p.w, h: p.h }, h = Math.round(d.h * 128 / d.w)
    const c = document.createElement('canvas'); c.width = 128; c.height = Math.max(24, h); c.style.width = '128px'; c.style.height = c.height + 'px'
    const label = document.createElement('span'); label.textContent = String(p.num)
    b.append(c, label); frag.appendChild(b); thumbObserver.observe(b)
    b.addEventListener('click', () => goTo(p.num, false))
  }
  el.thumbs.appendChild(frag)
}
async function drawThumb(b) {
  const p = s.pages[Number(b.dataset.num) - 1]; if (!p || !s.doc) return
  const c = b.querySelector('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1)
  const base = p.page.getViewport({ scale: 1 })
  const scale = 128 / base.width
  const vp = p.page.getViewport({ scale: scale * dpr })
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height); c.style.width = '128px'; c.style.height = Math.floor(vp.height / dpr) + 'px'
  try { await p.page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; b.dataset.seen = '1' } catch {}
}
async function buildOutline() {
  let items = null
  try { items = await s.doc.getOutline() } catch {}
  if (!items || !items.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = t('noOutline'); el.outline.appendChild(d); return }
  const make = (list) => {
    const ul = document.createElement('ul'); ul.className = 'ol'
    for (const it of list) {
      const li = document.createElement('li'); const b = document.createElement('button'); b.className = 'ol-item'; b.type = 'button'; b.textContent = it.title || '—'
      b.addEventListener('click', async () => {
        try {
          const dest = typeof it.dest === 'string' ? await s.doc.getDestination(it.dest) : it.dest
          if (Array.isArray(dest)) goTo((await s.doc.getPageIndex(dest[0])) + 1, false)
        } catch {}
      })
      li.appendChild(b); if (it.items && it.items.length) li.appendChild(make(it.items)); ul.appendChild(li)
    }
    return ul
  }
  el.outline.appendChild(make(items))
}
function setTab(which) {
  $('tabThumbs').classList.toggle('on', which === 'thumbs'); $('tabOutline').classList.toggle('on', which === 'outline')
  el.thumbs.hidden = which !== 'thumbs'; el.outline.hidden = which !== 'outline'
}

// ── search ──
const searchBar = $('searchBar'), searchInput = $('searchInput')
const textCache = new Map()
async function pageStrings(num) {
  if (!textCache.has(num)) { const tc = await s.pages[num - 1].page.getTextContent(); textCache.set(num, tc.items.filter((i) => i.str !== '' && i.str != null).map((i) => i.str)) }
  return textCache.get(num)
}
function countIn(str, q, cs) {
  const hay = cs ? str : str.toLowerCase(); const needle = cs ? q : q.toLowerCase(); let n = 0, i = 0
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += Math.max(1, needle.length) }
  return n
}
let searchRun = 0
async function runSearch() {
  const q = searchInput.value, cs = $('searchCase').checked, run = ++searchRun
  s.hits = []; s.hitIndex = -1; s.search = q ? { q, cs } : null
  document.querySelectorAll('.textLayer mark').forEach(unmark)
  if (!q || !s.doc) { $('searchCount').textContent = ''; return }
  for (let n = 1; n <= s.pages.length; n++) {
    const strs = await pageStrings(n)
    if (run !== searchRun) return
    let k = 0; for (const str of strs) k += countIn(str, q, cs)
    for (let i = 0; i < k; i++) s.hits.push({ page: n, nth: i })
    if (n % 20 === 0) await new Promise((r) => setTimeout(r))
  }
  if (run !== searchRun) return
  s.pages.filter((p) => p.rendered).forEach(applyHighlights)
  if (!s.hits.length) { $('searchCount').textContent = t('noMatches'); return }
  const from = s.hits.findIndex((h) => h.page >= s.current)
  focusHit(from === -1 ? 0 : from)
}
function unmark(m) { const parent = m.parentNode; if (!parent) return; parent.replaceChild(document.createTextNode(m.textContent), m); parent.normalize() }
function applyHighlights(p) {
  const layer = p.div.querySelector('.textLayer')
  if (!layer || !s.search) return
  layer.querySelectorAll('mark').forEach(unmark)
  const { q, cs } = s.search, needle = cs ? q : q.toLowerCase()
  const spans = [...layer.querySelectorAll('span')].filter((sp) => !sp.querySelector('span') && sp.textContent !== '' && !sp.classList.contains('markedContent'))
  for (const sp of spans) {
    const text = sp.textContent, hay = cs ? text : text.toLowerCase()
    if (!hay.includes(needle)) continue
    const frag = document.createDocumentFragment(); let i = 0, at
    while ((at = hay.indexOf(needle, i)) !== -1) {
      if (at > i) frag.appendChild(document.createTextNode(text.slice(i, at)))
      const m = document.createElement('mark'); m.textContent = text.slice(at, at + needle.length); frag.appendChild(m); i = at + needle.length
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)))
    sp.replaceChildren(frag)
  }
  const hit = s.hits[s.hitIndex]
  if (hit && hit.page === p.num) markCurrent(p, hit.nth)
}
function markCurrent(p, nth) {
  const marks = p.div.querySelectorAll('.textLayer mark')
  document.querySelectorAll('.textLayer mark.cur').forEach((m) => m.classList.remove('cur'))
  const m = marks[nth]; if (m) { m.classList.add('cur'); m.scrollIntoView({ block: 'center', inline: 'nearest' }) }
}
function focusHit(i) {
  if (!s.hits.length) return
  s.hitIndex = (i + s.hits.length) % s.hits.length
  const hit = s.hits[s.hitIndex]
  $('searchCount').textContent = t('matches', { n: s.hitIndex + 1, m: s.hits.length })
  const p = s.pages[hit.page - 1]
  if (p.rendered) markCurrent(p, hit.nth); else goTo(hit.page, false)
}
function openSearch() { searchBar.hidden = false; $('btnSearch').classList.add('on'); searchInput.focus(); searchInput.select() }
function closeSearch() { searchBar.hidden = true; $('btnSearch').classList.remove('on'); searchInput.value = ''; runSearch(); el.scroller.focus() }
searchInput.addEventListener('input', () => { clearTimeout(searchInput._t); searchInput._t = setTimeout(runSearch, 160) })
searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); focusHit(s.hitIndex + (e.shiftKey ? -1 : 1)) } })
$('searchCase').addEventListener('change', runSearch)
$('searchNext').addEventListener('click', () => focusHit(s.hitIndex + 1))
$('searchPrev').addEventListener('click', () => focusHit(s.hitIndex - 1))
$('searchClose').addEventListener('click', closeSearch)
$('btnSearch').addEventListener('click', () => (searchBar.hidden ? openSearch() : closeSearch()))

// ── print, save, open ──
async function doPrint() {
  if (!s.doc) return
  const root = $('printRoot'); root.replaceChildren()
  const urls = []
  try {
    for (const p of s.pages) {
      showStatus(t('printing', { n: p.num, m: s.pages.length }))
      const vp = p.page.getViewport({ scale: PRINT_DPI / 72, rotation: viewRotation(p) })
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      await p.page.render({ canvasContext: ctx, viewport: vp }).promise
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92))
      const url = URL.createObjectURL(blob); urls.push(url)
      const img = new Image(); img.src = url; await img.decode().catch(() => {}); root.appendChild(img)
    }
    el.status.hidden = true
    const res = await window.centrioPdf.print()
    if (res && res.ok === false && res.reason && res.reason !== 'cancelled' && res.reason !== 'Print job canceled') toast(t('printFailed'))
  } catch { el.status.hidden = true; toast(t('printFailed')) } finally { root.replaceChildren(); urls.forEach((u) => URL.revokeObjectURL(u)) }
}
async function doSave() {
  if (!s.doc) return
  try {
    const signed = textTool.hasAny()
    const bytes = signed ? await textTool.embed(s.bytes) : s.bytes
    const name = signed ? s.title.replace(/\.pdf$/i, '') + t('editedSuffix') + '.pdf' : s.title
    const res = await window.centrioPdf.saveAs(bytes, name)
    if (res && res.ok) toast(t(signed ? 'editedSaved' : 'saved', { name: res.path.split(/[\\/]/).pop() }))
    else if (res && !res.canceled) toast(t('saveFailed'))
  } catch { toast(t('saveFailed')) }
}
async function doOpen() {
  const res = await window.centrioPdf.openDialog()
  if (res && res.ok) loadDocument(res.bytes, res.title); else if (res && !res.canceled && res.error) toast(t('failedTitle'))
}
function rotate() {
  if (textTool.hasAny()) { toast(t('rotateEdited')); return }
  const anchor = anchorOf(); s.rot = (s.rot + 90) % 360
  layout(); restoreAnchor(anchor); releaseAll(); renderVisible()
  if (s.fit) fitTo(s.fit)
}

// ── zoom menu ──
const zoomMenu = $('zoomMenu')
function openZoomMenu() {
  zoomMenu.replaceChildren()
  const add = (label, run, on) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.classList.toggle('on', !!on); b.addEventListener('click', () => { zoomMenu.hidden = true; run() }); zoomMenu.appendChild(b) }
  add(t('fitWidth'), () => fitTo('width'), s.fit === 'width'); add(t('fitPage'), () => fitTo('page'), s.fit === 'page')
  for (const z of [0.5, 0.75, 1, 1.25, 1.5, 2, 3]) add(Math.round(z * 100) + '%', () => setZoom(z), !s.fit && Math.abs(s.zoom - z) < 0.01)
  zoomMenu.hidden = false
}
$('zoomLabel').addEventListener('click', (e) => { e.stopPropagation(); zoomMenu.hidden ? openZoomMenu() : (zoomMenu.hidden = true) })
document.addEventListener('click', (e) => { if (!zoomMenu.hidden && !zoomMenu.contains(e.target)) zoomMenu.hidden = true })

// ── wiring ──
$('btnSidebar').addEventListener('click', () => { const closed = el.side.classList.toggle('closed'); $('btnSidebar').setAttribute('aria-pressed', String(!closed)); if (s.fit) setTimeout(() => fitTo(s.fit), 220) })
$('tabThumbs').addEventListener('click', () => setTab('thumbs')); $('tabOutline').addEventListener('click', () => setTab('outline'))
$('btnPrev').addEventListener('click', () => goTo(s.current - 1, true)); $('btnNext').addEventListener('click', () => goTo(s.current + 1, true))
$('btnZoomIn').addEventListener('click', () => stepZoom(1)); $('btnZoomOut').addEventListener('click', () => stepZoom(-1))
$('btnFit').addEventListener('click', () => fitTo(s.fit === 'width' ? 'page' : 'width'))
$('btnRotate').addEventListener('click', rotate)
$('btnText').addEventListener('click', () => textTool.open())
$('btnPrint').addEventListener('click', doPrint); $('btnSave').addEventListener('click', doSave); $('btnOpen').addEventListener('click', doOpen)
$('pageInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const n = parseInt(e.target.value, 10); if (n) goTo(n, false); e.target.blur() } })
$('pageInput').addEventListener('blur', () => { $('pageInput').value = s.current })
window.addEventListener('resize', () => { if (s.fit) fitTo(s.fit); else renderVisible() })

el.scroller.addEventListener('wheel', (e) => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(s.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)) }, { passive: false })
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey, typing = e.target instanceof HTMLInputElement
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); openSearch() }
  else if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); doPrint() }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); doSave() }
  else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); doOpen() }
  else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); stepZoom(1) }
  else if (mod && e.key === '-') { e.preventDefault(); stepZoom(-1) }
  else if (mod && e.key === '0') { e.preventDefault(); setZoom(1) }
  else if (e.key === 'Escape') { if (!searchBar.hidden) closeSearch(); else { $('textModal').hidden = true; zoomMenu.hidden = true } }
  else if (e.key === 'F3') { e.preventDefault(); focusHit(s.hitIndex + (e.shiftKey ? -1 : 1)) }
  else if (!typing && !mod) {
    if (e.key === 'PageDown' || (e.key === 'ArrowRight' && !e.shiftKey)) { e.preventDefault(); goTo(s.current + 1, true) }
    else if (e.key === 'PageUp' || e.key === 'ArrowLeft') { e.preventDefault(); goTo(s.current - 1, true) }
    else if (e.key === 'Home') { e.preventDefault(); goTo(1, false) }
    else if (e.key === 'End') { e.preventDefault(); goTo(s.pages.length, false) }
  }
})

// A PDF dropped on the window opens in it.
let dragDepth = 0
window.addEventListener('dragenter', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { dragDepth++; $('drop').hidden = false } })
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('drop').hidden = true })
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', async (e) => {
  e.preventDefault(); dragDepth = 0; $('drop').hidden = true
  const file = [...(e.dataTransfer?.files || [])].find((f) => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')
  if (file) loadDocument(new Uint8Array(await file.arrayBuffer()), file.name)
})

// ── start ──
;(async () => {
  showStatus(t('loading'))
  const first = await window.centrioPdf.init()
  if (!first || !first.ok) { showStatus(t('failedTitle'), t('failedText')); return }
  loadDocument(first.bytes, first.title)
})()
