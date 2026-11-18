// Text tool of the reader: any text, in a font of your choice, put anywhere on a page; moved, resized and removed on the
// page, and written into a copy of the file when saved. The text is drawn to a picture (so every font and every language
// works) and the picture is embedded with pdf-lib. The original file is never changed.
import { t } from './i18n.js'

const FONTS = [
  { name: 'Golos Text', stack: "'Golos Text', 'Segoe UI', system-ui, sans-serif" },
  { name: 'Arial', stack: "Arial, 'Helvetica Neue', Helvetica, sans-serif" },
  { name: 'Verdana', stack: "Verdana, Geneva, sans-serif" },
  { name: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { name: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  { name: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { name: 'Segoe Script', stack: "'Segoe Script', 'Brush Script MT', 'Snell Roundhand', cursive" },
  { name: 'Impact', stack: "Impact, 'Arial Black', Haettenschweiler, sans-serif" }
]
const COLORS = ['#111111', '#14213d', '#c0392b', '#1f6feb', '#1a7f37', '#8250df', '#6e7781']
const SCALE = 3 // the picture is drawn at three times the size so it stays sharp when the page is zoomed
const $ = (id) => document.getElementById(id)

// The text as a transparent PNG; wPt/hPt are its size in PDF points (what the picture is at 100%).
export function renderText({ text, font, size, color, bold, italic }) {
  const lines = String(text).replace(/\r/g, '').split('\n')
  const px = size * SCALE
  const face = `${italic ? 'italic ' : ''}${bold ? '700 ' : '400 '}${px}px ${font.stack}`
  const probe = document.createElement('canvas').getContext('2d')
  probe.font = face
  const lineH = Math.round(px * 1.25)
  const pad = Math.round(px * 0.12)
  const width = Math.max(1, Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + pad * 2)
  const height = lineH * lines.length + pad * 2
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.font = face; ctx.fillStyle = color; ctx.textBaseline = 'middle'
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + lineH * i + lineH / 2))
  return { url: canvas.toDataURL('image/png'), width, height, wPt: width / SCALE, hPt: height / SCALE }
}

export function createTextTool({ getPageEl, getCssScale, toast, canPlace }) {
  const placed = [] // { num, fx, fy, fw, fh, url, el }
  let pending = null // the picture waiting for a click on a page
  const st = { font: FONTS[0], size: 24, color: COLORS[0], bold: false, italic: false }
  const refs = { modal: $('textModal'), bar: $('placeBar'), hint: $('placeHint'), scroller: $('scroller'), input: $('textInput'), preview: $('textPreview') }

  // ── the dialog ──
  const fontSel = $('textFont')
  FONTS.forEach((f, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = f.name; o.style.fontFamily = f.stack; fontSel.appendChild(o) })
  const swatches = $('textColors')
  COLORS.forEach((c, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch' + (i === 0 ? ' on' : ''); b.style.background = c; b.setAttribute('aria-label', c)
    b.addEventListener('click', () => { st.color = c; swatches.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === b)); paint() })
    swatches.appendChild(b)
  })
  function paint() {
    const ctx = refs.preview.getContext('2d')
    ctx.clearRect(0, 0, refs.preview.width, refs.preview.height)
    const text = refs.input.value
    if (!text.trim()) return
    const shown = renderText({ text, font: st.font, size: Math.min(st.size, 44), color: st.color, bold: st.bold, italic: st.italic })
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, (refs.preview.width - 24) / img.width, (refs.preview.height - 16) / img.height)
      ctx.clearRect(0, 0, refs.preview.width, refs.preview.height)
      ctx.drawImage(img, 12, (refs.preview.height - img.height * k) / 2, img.width * k, img.height * k)
    }
    img.src = shown.url
  }
  refs.input.addEventListener('input', paint)
  fontSel.addEventListener('change', () => { st.font = FONTS[Number(fontSel.value)]; paint() })
  $('textSize').addEventListener('input', (e) => { st.size = Number(e.target.value); $('textSizeVal').textContent = st.size; paint() })
  for (const [id, key] of [['textBold', 'bold'], ['textItalic', 'italic']]) {
    $(id).addEventListener('click', (e) => { st[key] = !st[key]; e.currentTarget.classList.toggle('on', st[key]); e.currentTarget.setAttribute('aria-pressed', String(st[key])); paint() })
  }

  function openDialog() {
    if (!canPlace()) return
    refs.modal.hidden = false
    refs.input.focus()
    paint()
  }
  function closeDialog() { refs.modal.hidden = true }
  $('textCancel').addEventListener('click', closeDialog)
  refs.modal.addEventListener('pointerdown', (e) => { if (e.target === refs.modal) closeDialog() })
  $('textUse').addEventListener('click', () => {
    if (!refs.input.value.trim()) { toast(t('textEmpty')); refs.input.focus(); return }
    pending = renderText({ text: refs.input.value, font: st.font, size: st.size, color: st.color, bold: st.bold, italic: st.italic })
    closeDialog()
    document.body.classList.add('placing')
    setBar(t('placeHint'), false)
  })

  // ── placing ──
  function setBar(text, withButtons) {
    refs.bar.hidden = !text
    refs.hint.textContent = text || ''
    $('placeAgain').hidden = !withButtons; $('placeClear').hidden = !withButtons
  }
  function endPlacing() { pending = null; document.body.classList.remove('placing'); setBar(placed.length ? t('placed') : '', placed.length > 0) }

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

    x.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); placed.splice(placed.indexOf(entry), 1); setBar(placed.length ? t('placed') : '', placed.length > 0) })
    const drag = (ev, resize) => {
      ev.preventDefault(); ev.stopPropagation()
      const rect = pageEl.getBoundingClientRect()
      const start = { x: ev.clientX, y: ev.clientY, fx: entry.fx, fy: entry.fy, fw: entry.fw, fh: entry.fh }
      const ratio = (entry.fw * rect.width) / (entry.fh * rect.height)
      el.setPointerCapture(ev.pointerId)
      const move = (e) => {
        const dx = (e.clientX - start.x) / rect.width, dy = (e.clientY - start.y) / rect.height
        if (resize) {
          const fw = Math.max(0.04, Math.min(1 - start.fx, start.fw + dx))
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

  // A click on a page while a text is waiting puts it there (its top-left corner at the click), at its real size in points.
  refs.scroller.addEventListener('click', (e) => {
    if (!pending) return
    const pageEl = e.target.closest && e.target.closest('.page')
    if (!pageEl) return
    if (!canPlace()) { endPlacing(); return }
    const rect = pageEl.getBoundingClientRect()
    const k = getCssScale()
    const fw = Math.min(1, (pending.wPt * k) / rect.width), fh = Math.min(1, (pending.hPt * k) / rect.height)
    const fx = Math.max(0, Math.min(1 - fw, (e.clientX - rect.left) / rect.width - fw * 0.04))
    const fy = Math.max(0, Math.min(1 - fh, (e.clientY - rect.top) / rect.height - fh / 2))
    const entry = { num: Number(pageEl.dataset.num), fx, fy, fw, fh, url: pending.url, el: null }
    placed.push(entry)
    addOverlay(entry)
    endPlacing()
  }, true)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending) endPlacing() })
  $('placeAgain').addEventListener('click', openDialog)
  $('placeClear').addEventListener('click', () => { placed.splice(0).forEach((p) => p.el && p.el.remove()); setBar('', false) })

  // ── saving ──
  // A copy of the file with every placed text written onto its page. Pages with their own /Rotate are refused earlier.
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

  return { open: openDialog, hasAny: () => placed.length > 0, embed, clearAll: () => { placed.splice(0).forEach((p) => p.el && p.el.remove()); pending = null; document.body.classList.remove('placing'); setBar('', false) }, reattach: (num) => placed.filter((p) => p.num === num && !p.el.isConnected).forEach((p) => getPageEl(num)?.appendChild(p.el)) }
}
