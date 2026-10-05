// Password import wizard (the "import" view of the passwords panel): choose the source -> step-by-step export
// instructions -> pick the file -> preview -> done. The file is read and parsed in the main process; this code only
// ever sees counts and a few site names, never a password.
const { importCopy, importSources } = require('./passwords-import-texts')

function createImportView({ lang, invokeIpc, onClose, onImported }) {
    const text = (key, params = {}) => {
        const dict = importCopy[lang() === 'ru' ? 'ru' : 'en']
        return String(dict[key] || importCopy.en[key] || key).replace(/\{(\w+)\}/g, (_m, name) => (params[name] != null ? params[name] : ''))
    }
    const pick = (map) => map[lang() === 'ru' ? 'ru' : 'en'] || map.en

    let step = 'source' // 'source' | 'steps' | 'preview' | 'done'
    let source = null
    let preview = null
    let result = null
    let message = ''
    let busy = false
    let deleteAfter = true
    let container = null

    const el = (tag, className, content) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (content !== undefined) node.textContent = content
        return node
    }
    const button = (label, className, onClick) => {
        const b = el('button', className, label)
        b.type = 'button'
        b.addEventListener('click', onClick)
        return b
    }
    const sourceName = (s) => s.name || pick(s.nameKey)

    function go(next) { step = next; message = ''; render() }

    async function chooseFile() {
        busy = true
        message = text('reading')
        render()
        let picked = null
        try { picked = await invokeIpc('pm:import-pick') } catch { picked = null }
        busy = false
        if (!picked || picked.error === 'CANCELED') { message = ''; render(); return }
        if (!picked.success) { message = text(`err${picked.error}`) || text('errFAILED'); render(); return }
        preview = picked
        go('preview')
    }

    async function runImport() {
        if (busy || !preview) return
        busy = true
        message = text('importing')
        render()
        let done = null
        try { done = await invokeIpc('pm:import-commit', preview.token, deleteAfter) } catch { done = null }
        busy = false
        if (!done || !done.success) { message = text(`err${(done && done.error) || 'FAILED'}`); render(); return }
        result = done
        preview = null
        onImported()
        go('done')
    }

    function renderSource() {
        const box = el('div', 'pmi')
        box.appendChild(el('div', 'pmi-title', text('title')))
        box.appendChild(el('div', 'pmi-text', text('intro')))
        const grid = el('div', 'pmi-grid')
        importSources.forEach((s) => {
            const card = button('', 'pmi-card', () => { source = s; go('steps') })
            const badge = el('span', 'pmi-badge', s.icon)
            badge.style.setProperty('--pmi-hue', String(s.hue))
            card.append(badge, el('span', 'pmi-card-name', sourceName(s)))
            grid.appendChild(card)
        })
        box.appendChild(grid)
        box.appendChild(button(text('back'), 'pm-link-btn pmi-back', onClose))
        return box
    }

    function renderSteps() {
        const box = el('div', 'pmi')
        box.appendChild(button(`← ${text('back')}`, 'pm-link-btn pmi-back', () => go('source')))
        box.appendChild(el('div', 'pmi-title', text('howTitle', { name: sourceName(source) })))
        const list = el('ol', 'pmi-steps')
        pick(source.steps).forEach((line) => list.appendChild(el('li', '', line)))
        box.appendChild(list)
        box.appendChild(el('div', 'pmi-note', text('stepsNote')))
        box.appendChild(el('div', 'pmi-warn', text('fileNote')))
        const action = button(busy ? text('reading') : text('pickFile'), 'qr-btn-primary pmi-main', chooseFile)
        action.disabled = busy
        box.appendChild(action)
        if (message) box.appendChild(el('div', 'pm-editor-error', message))
        return box
    }

    function stat(label) {
        return el('div', 'pmi-stat', label)
    }

    function renderPreview() {
        const box = el('div', 'pmi')
        box.appendChild(button(`← ${text('back')}`, 'pm-link-btn pmi-back', () => go('steps')))
        box.appendChild(el('div', 'pmi-title', preview.fileName || text('title')))
        const stats = el('div', 'pmi-stats')
        stats.appendChild(stat(text('found', { n: preview.found })))
        stats.appendChild(stat(text('add', { n: preview.add })))
        if (preview.update) stats.appendChild(stat(text('update', { n: preview.update })))
        stats.appendChild(stat(text('same', { n: preview.same })))
        if (preview.skipped) stats.appendChild(stat(text('skipped', { n: preview.skipped })))
        box.appendChild(stats)
        if (preview.skipped) box.appendChild(el('div', 'pmi-note', text('skippedWhy')))
        if (preview.sample && preview.sample.length) {
            box.appendChild(el('div', 'pmi-note', text('examples')))
            const sample = el('ul', 'pmi-sample')
            preview.sample.forEach((row) => sample.appendChild(el('li', '', `${row.title}${row.login ? ' · ' + row.login : ''}`)))
            box.appendChild(sample)
        }
        const total = preview.add + preview.update
        if (total === 0) box.appendChild(el('div', 'pmi-warn', text('nothing')))

        const label = el('label', 'pmi-check')
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.checked = deleteAfter
        checkbox.addEventListener('change', () => { deleteAfter = checkbox.checked })
        label.append(checkbox, el('span', '', text('deleteAfter')))
        box.appendChild(label)

        const row = el('div', 'pm-editor-buttons')
        row.appendChild(button(text('pickAgain'), 'qr-btn-ghost', () => { invokeIpc('pm:import-cancel', preview.token); chooseFile() }))
        const go_ = button(busy ? text('importing') : text('doImport', { n: total }), 'qr-btn-primary', runImport)
        go_.disabled = busy || total === 0
        row.appendChild(go_)
        box.appendChild(row)
        if (message) box.appendChild(el('div', 'pm-editor-error', message))
        return box
    }

    function renderDone() {
        const box = el('div', 'pmi')
        box.appendChild(el('div', 'pmi-title', text('doneTitle')))
        const stats = el('div', 'pmi-stats')
        stats.appendChild(stat(text('added', { n: result.added })))
        if (result.updated) stats.appendChild(stat(text('updated', { n: result.updated })))
        box.appendChild(stats)
        const fileText = result.erased === true ? text('erased') : result.erased === false ? text('notErased') : text('kept')
        box.appendChild(el('div', result.erased === true ? 'pmi-ok' : 'pmi-warn', fileText))
        box.appendChild(el('div', 'pmi-note', text('browserTip')))
        box.appendChild(button(text('close'), 'qr-btn-primary pmi-main', onClose))
        return box
    }

    function render() {
        if (!container) return
        container.textContent = ''
        container.appendChild(step === 'source' ? renderSource() : step === 'steps' ? renderSteps() : step === 'preview' ? renderPreview() : renderDone())
    }

    return {
        mount(target) { container = target; step = 'source'; source = null; preview = null; result = null; message = ''; busy = false; render() },
        reset() { if (preview) invokeIpc('pm:import-cancel', preview.token); preview = null }
    }
}

module.exports = { createImportView }
