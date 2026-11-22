// Draws a .docx into the page (docx-preview) so that main can print it to PDF. Called by main/services/docxToPdf.js:
//   window.renderDocx(base64) → { pages, widthPx, heightPx }
'use strict'

const PX_PER_INCH = 96

function bytesOf(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

window.renderDocx = async function renderDocx(base64) {
  const host = document.getElementById('doc')
  host.replaceChildren()
  await window.docx.renderAsync(bytesOf(base64), host, null, {
    className: 'docx',
    inWrapper: true,
    ignoreWidth: false,
    ignoreHeight: false,
    breakPages: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    useBase64URL: true
  })
  if (document.fonts && document.fonts.ready) await document.fonts.ready
  const sections = host.querySelectorAll('section.docx')
  const first = sections[0]
  const box = first ? first.getBoundingClientRect() : { width: 0, height: 0 }
  return { pages: sections.length, widthPx: Math.round(box.width), heightPx: Math.round(box.height), inch: PX_PER_INCH }
}
