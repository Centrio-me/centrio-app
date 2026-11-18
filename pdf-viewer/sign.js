// Signature tool of the reader: draw / type / take a picture of a signature, place it on a page, move and resize it, and
// write it into a copy of the file when saved (pdf-lib). The original file is never changed.
import { t } from './i18n.js'

const STORE_KEY = 'centrio.pdf.signatures'
const MAX_SAVED = 4
const INK = '#14213d'
const FONTS = [
  { label: 'Anna', css: "italic 84px 'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive" },
  { label: 'Marta', css: "italic 90px 'Lucida Handwriting', 'Segoe Print', 'Apple Chancery', cursive" },
  { label: 'Ivan', css: "italic 92px 'Ink Free', 'Bradley Hand', 'Comic Sans MS', cursive" }
]
const $ = (id) => document.getElementById(id)

function loadSaved() {
  try { const v = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.startsWith('data:image/png')).slice(0, MAX_SAVED) : [] } catch { return [] }
}
function storeSaved(list) { try { localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, MAX_SAVED))) } catch {} }

// The part of the canvas that has ink, as a transparent PNG (null when the canvas is empty).
function trimmedPng(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (data[(y * width + x) * 4 + 3] > 12) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  }
  if (maxX < 0) return null
  const pad = 6
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad)
  const out = document.createElement('canvas')
  out.width = maxX - minX + 1; out.height = maxY - minY + 1
  out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return { url: out.toDataURL('image/png'), width: out.width, height: out.height }
}

// A photo of a signature on white paper: the paper becomes transparent, the ink stays.
function inkFromPhoto(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    const alpha = Math.max(0, Math.min(255, (225 - lum) * 2.4))
    d[i] = 20; d[i + 1] = 33; d[i + 2] = 61; d[i + 3] = d[i + 3] === 0 ? 0 : alpha
  }
  ctx.putImageData(img, 0, 0)
}

export function createSigner({ getPageEl, toast, canPlace }) {
  const placed = [] // { num, fx, fy, fw, fh, url, el }
  let pending = null // { url, width, height } waiting for a click on a page
  let saved = loadSaved()
  let mode = 'draw'
  let fontIndex = 0
  const refs = { modal: $('sigModal'), bar: $('signBar'), hint: $('signHint'), scroller: $('scroller') }

  // ── the dialog ──
  const draw = $('sigCanvas'), dctx = draw.getContext('2d')
  const typed = $('sigTypeCanvas'), tctx = typed.getContext('2d')
  const photo = $('sigImgCanvas'), pctx = photo.getContext('2d', { willReadFrequently: true })
  let drawing = false, last = null

  function eraseDraw() { dctx.clearRect(0, 0, draw.width, draw.height) }
  function pos(ev, c) { const r = c.getBoundingClientRect(); return { x: (ev.clientX - r.left) * (c.width / r.width), y: (ev.clientY - r.top) * (c.height / r.height) } }
  draw.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e, draw); draw.setPointerCapture(e.pointerId); dctx.fillStyle = INK; dctx.beginPath(); dctx.arc(last.x, last.y, 2.2, 0, 7); dctx.fill() })
  draw.addEventListener('pointermove', (e) => {
    if (!drawing) return
    const p = pos(e, draw)
    dctx.strokeStyle = INK; dctx.lineWidth = 4.2; dctx.lineCap = 'round'; dctx.lineJoin = 'round'
    dctx.beginPath(); dctx.moveTo(last.x, last.y); dctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2); dctx.stroke()
    last = p
  })
  const stop = () => { drawing = false }
  draw.addEventListener('pointerup', stop); draw.addEventListener('pointercancel', stop)
  $('sigErase').addEventListener('click', eraseDraw)

  function paintTyped() {
    tctx.clearRect(0, 0, typed.width, typed.height)
    const text = $('sigText').value.trim()
    if (!text) return
    tctx.fillStyle = INK; tctx.textBaseline = 'middle'; tctx.font = FONTS[fontIndex].css
    let size = 92
    while (tctx.measureText(text).width > typed.width - 40 && size > 24) { size -= 4; tctx.font = FONTS[fontIndex].css.replace(/\d+px/, size + 'px') }
    tctx.fillText(text, 20, typed.height / 2)
  }
  const fontsBox = $('sigFonts')
  FONTS.forEach((f, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = f.label; b.style.font = f.css.replace(/\d+px/, '20px')
    b.classList.toggle('on', i === 0)
    b.addEventListener('click', () => { fontIndex = i; fontsBox.querySelectorAll('button').forEach((x, j) => x.classList.toggle('on', j === i)); paintTyped() })
    fontsBox.appendChild(b)
  })
  $('sigText').placeholder = t('sigTypeHint')
  $('sigText').addEventListener('input', paintTyped)

  $('sigFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const img = new Image()
    img.onload = () => {
      pctx.clearRect(0, 0, photo.width, photo.height)
      const k = Math.min(photo.width / img.width, photo.height / img.height)
      pctx.drawImage(img, 0, 0, img.width * k, img.height * k)
      inkFromPhoto(photo)
      URL.revokeObjectURL(img.src)
    }
    img.src = URL.createObjectURL(file)
  })

  function setMode(next) {
    mode = next
    document.querySelectorAll('#sigModal [data-sig]').forEach((b) => b.classList.toggle('on', b.dataset.sig === next))
    $('sigDraw').hidden = next !== 'draw'; $('sigTypeP').hidden = next !== 'type'; $('sigImageP').hidden = next !== 'image'
    if (next === 'type') $('sigText').focus()
  }
  document.querySelectorAll('#sigModal [data-sig]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.sig)))

  function renderSaved() {
    const box = $('sigSavedList')
    box.replaceChildren()
    $('sigSaved').hidden = saved.length === 0
    saved.forEach((url) => {
      const b = document.createElement('button'); b.type = 'button'
      const im = document.createElement('img'); im.src = url; im.alt = ''
      b.appendChild(im)
      b.addEventListener('click', () => { const i = new Image(); i.onload = () => { closeDialog(); beginPlacing({ url, width: i.width, height: i.height }) }; i.src = url })
      box.appendChild(b)
    })
  }

  function openDialog() {
    if (!canPlace()) return
    eraseDraw(); tctx.clearRect(0, 0, typed.width, typed.height); pctx.clearRect(0, 0, photo.width, photo.height); $('sigText').value = ''
    setMode('draw'); renderSaved()
    refs.modal.hidden = false
  }
  function closeDialog() { refs.modal.hidden = true }
  $('sigCancel').addEventListener('click', closeDialog)
  refs.modal.addEventListener('pointerdown', (e) => { if (e.target === refs.modal) closeDialog() })
  $('sigUse').addEventListener('click', () => {
    const source = mode === 'draw' ? draw : mode === 'type' ? typed : photo
    const result = trimmedPng(source)
    if (!result) { toast(t('sigEmpty')); return }
    saved = [result.url, ...saved.filter((s) => s !== result.url)].slice(0, MAX_SAVED)
    storeSaved(saved)
    closeDialog()
    beginPlacing(result)
  })

  // ── placing ──
  function setBar(text, withButtons) {
    refs.bar.hidden = !text
    refs.hint.textContent = text || ''
    $('signAgain').hidden = !withButtons; $('signClear').hidden = !withButtons
  }
  function beginPlacing(sig) {
    pending = sig
    document.body.classList.add('placing')
    setBar(t('sigHint'), false)
  }
  function endPlacing() { pending = null; document.body.classList.remove('placing'); setBar(placed.length ? t('sigPlaced') : '', placed.length > 0) }

  function addOverlay(entry) {
    const pageEl = getPageEl(entry.num)
    if (!pageEl) return
    const el = document.createElement('div'); el.className = 'sig'
    const img = document.createElement('img'); img.src = entry.url; img.alt = ''; img.draggable = false
    const x = document.createElement('button'); x.className = 'x'; x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', t('close'))
    const rz = document.createElement('span'); rz.className = 'rz'
    el.append(img, x, rz)
    const apply = () => { el.style.left = entry.fx * 100 + '%'; el.style.top = entry.fy * 100 + '%'; el.style.width = entry.fw * 100 + '%'; el.style.height = entry.fh * 100 + '%' }
    apply()
    entry.el = el
    pageEl.appendChild(el)

    x.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); placed.splice(placed.indexOf(entry), 1); setBar(placed.length ? t('sigPlaced') : '', placed.length > 0) })
    const drag = (ev, resize) => {
      ev.preventDefault(); ev.stopPropagation()
      const rect = pageEl.getBoundingClientRect()
      const start = { x: ev.clientX, y: ev.clientY, fx: entry.fx, fy: entry.fy, fw: entry.fw, fh: entry.fh }
      const ratio = (entry.fw * rect.width) / (entry.fh * rect.height)
      el.setPointerCapture(ev.pointerId)
      const move = (e) => {
        const dx = (e.clientX - start.x) / rect.width, dy = (e.clientY - start.y) / rect.height
        if (resize) {
          const fw = Math.max(0.05, Math.min(1 - start.fx, start.fw + dx))
          const fh = (fw * rect.width) / ratio / rect.height
          if (start.fy + fh <= 1) { entry.fw = fw; entry.fh = fh }
        } else {
          entry.fx = Math.max(0, Math.min(1 - start.fw, start.fx + dx)); entry.fy = Math.max(0, Math.min(1 - start.fh, start.fy + dy))
        }
        apply()
      }
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up) }
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up)
    }
    el.addEventListener('pointerdown', (e) => { if (e.target === x) return; document.querySelectorAll('.sig.sel').forEach((s) => s.classList.remove('sel')); el.classList.add('sel'); drag(e, e.target === rz) })
  }

  // A click on a page while a signature is waiting puts it there, centred on the click.
  refs.scroller.addEventListener('click', (e) => {
    if (!pending) return
    const pageEl = e.target.closest && e.target.closest('.page')
    if (!pageEl) return
    if (!canPlace()) { endPlacing(); return }
    const rect = pageEl.getBoundingClientRect()
    const fw = Math.min(0.32, Math.max(0.12, 190 / rect.width))
    const fh = (fw * rect.width * (pending.height / pending.width)) / rect.height
    const fx = Math.max(0, Math.min(1 - fw, (e.clientX - rect.left) / rect.width - fw / 2))
    const fy = Math.max(0, Math.min(1 - fh, (e.clientY - rect.top) / rect.height - fh / 2))
    const entry = { num: Number(pageEl.dataset.num), fx, fy, fw, fh, url: pending.url, el: null }
    placed.push(entry)
    addOverlay(entry)
    endPlacing()
  }, true)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending) endPlacing() })
  $('signAgain').addEventListener('click', openDialog)
  $('signClear').addEventListener('click', () => { placed.splice(0).forEach((p) => p.el && p.el.remove()); setBar('', false) })

  // ── saving ──
  // A copy of the file with every placed signature written onto its page. Pages with their own /Rotate are refused earlier.
  async function embed(bytes) {
    const { PDFDocument } = await import('../node_modules/pdf-lib/dist/pdf-lib.esm.min.js')
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const pages = doc.getPages()
    const cache = new Map()
    for (const s of placed) {
      const page = pages[s.num - 1]
      if (!page) continue
      let image = cache.get(s.url)
      if (!image) { image = await doc.embedPng(s.url); cache.set(s.url, image) }
      const { width, height } = page.getSize()
      page.drawImage(image, { x: s.fx * width, y: height - (s.fy + s.fh) * height, width: s.fw * width, height: s.fh * height })
    }
    return await doc.save()
  }

  return { open: openDialog, hasAny: () => placed.length > 0, embed, clearAll: () => $('signClear').click(), reattach: (num) => placed.filter((p) => p.num === num && !p.el.isConnected).forEach((p) => getPageEl(num)?.appendChild(p.el)) }
}
