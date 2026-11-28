// The reader's tab strip: one tab per open document, a plus after the last one. Main (services/pdfViewer.js) owns the state.
import { t } from './i18n.js'

const strip = document.getElementById('strip')
const CLOSE_SVG = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
const PLUS_SVG = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'

function render(state) {
  const tabs = (state && state.tabs) || []
  strip.replaceChildren()
  for (const tab of tabs) {
    const node = document.createElement('div')
    node.className = 'tab' + (tab.id === state.active ? ' on' : '')
    node.setAttribute('role', 'tab')
    node.setAttribute('aria-selected', String(tab.id === state.active))
    node.title = tab.title
    const mark = document.createElement('span')
    mark.className = 'mark'
    mark.textContent = 'PDF'
    const name = document.createElement('span')
    name.className = 'name'
    name.textContent = tab.title
    const close = document.createElement('button')
    close.className = 'x'
    close.type = 'button'
    close.title = t('tabClose')
    close.setAttribute('aria-label', t('tabClose'))
    close.innerHTML = CLOSE_SVG
    close.addEventListener('click', (e) => { e.stopPropagation(); window.centrioPdfTabs.close(tab.id) })
    node.append(mark, name, close)
    node.addEventListener('mousedown', (e) => { if (e.button === 0) window.centrioPdfTabs.activate(tab.id); if (e.button === 1) { e.preventDefault(); window.centrioPdfTabs.close(tab.id) } })
    strip.append(node)
  }
  const plus = document.createElement('button')
  plus.className = 'plus'
  plus.type = 'button'
  plus.title = t('tabNew')
  plus.setAttribute('aria-label', t('tabNew'))
  plus.innerHTML = PLUS_SVG
  plus.addEventListener('click', () => window.centrioPdfTabs.add())
  strip.append(plus)
  const active = strip.querySelector('.tab.on')
  if (active) active.scrollIntoView({ inline: 'nearest', block: 'nearest' })
}

window.centrioPdfTabs.onState(render)
window.centrioPdfTabs.getState().then(render).catch(() => {})
