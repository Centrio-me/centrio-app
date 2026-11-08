// The update strip: slides out between the titlebar and the app and pushes the app down,
// so it never covers a chat. While a version downloads only a thin line in the accent
// colour runs under the titlebar. The states live in renderer/update-strip-state.js.

const { initialState, reduce, isStripOpen } = require('./update-strip-state')

const SITE_DOWNLOAD_URL = 'https://centrio.me/download'
const INSTALL_TIMEOUT_MS = 60 * 1000
const UPDATED_VISIBLE_MS = 15 * 1000
const SLIDE_MS = 280

const ICONS = {
    ready: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 16.5v-9M8 11l4-4 4 4"/></svg>',
    updated: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    failed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v5.5M12 16.5v.2"/></svg>',
    close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
}

function createEl(tag, className, text) {
    const el = document.createElement(tag)
    if (className) el.className = className
    if (text) el.textContent = text
    return el
}

function createButton(className, text, onClick) {
    const button = createEl('button', `update-strip-btn ${className}`, text)
    button.type = 'button'
    button.addEventListener('click', onClick)
    return button
}

function createCloseButton(label, onClick) {
    const button = createButton('update-strip-btn--icon', '', onClick)
    button.innerHTML = ICONS.close
    button.setAttribute('aria-label', label)
    return button
}

function createUpdateStrip({ invokeIpc, sendIpc, tGet }) {
    const strip = document.getElementById('updateStrip')
    const titleText = document.getElementById('updateDownloadText')
    const line = document.getElementById('updateDownloadLine')
    const lineFill = document.getElementById('updateDownloadFill')
    const statusButton = document.getElementById('statusUpdateBtn')
    const statusButtonText = document.getElementById('statusUpdateBtnText')
    const statusDivider = document.getElementById('statusUpdateSep')

    let state = initialState
    let installTimer = null
    let updatedTimer = null
    let settleTimer = null
    let appliedHeight = 0

    const text = (key) => tGet(`updater.${key}`).replace('{v}', state.version)

    function dispatch(event) {
        const next = reduce(state, event)
        if (next === state) return
        const phaseChanged = next.phase !== state.phase
        state = next
        if (phaseChanged) onPhaseChange()
        render()
    }

    function onPhaseChange() {
        clearTimeout(installTimer)
        clearTimeout(updatedTimer)
        if (state.phase === 'installing') {
            installTimer = setTimeout(() => dispatch({ type: 'install-timeout' }), INSTALL_TIMEOUT_MS)
        }
        if (state.phase === 'updated') {
            updatedTimer = setTimeout(() => dispatch({ type: 'close' }), UPDATED_VISIBLE_MS)
        }
    }

    function install() {
        dispatch({ type: 'install' })
        invokeIpc('install-update')
    }

    function retry() {
        const wasInstall = state.failure === 'install'
        dispatch({ type: 'retry' })
        if (wasInstall) {
            invokeIpc('install-update')
            return
        }
        invokeIpc('app:checkForUpdates')
    }

    function contentFor() {
        if (state.phase === 'ready') {
            return {
                icon: 'ready',
                title: text('stripReady'),
                hint: text('stripReadyHint'),
                actions: [
                    createButton('update-strip-btn--quiet', text('stripLater'), () => dispatch({ type: 'later' })),
                    createButton('update-strip-btn--primary', text('stripRestart'), install),
                ],
            }
        }
        if (state.phase === 'installing') {
            return { title: text('stripInstalling'), hint: text('stripInstallingHint'), actions: [] }
        }
        if (state.phase === 'updated') {
            return {
                icon: 'updated',
                title: text('stripUpdated'),
                actions: [
                    createCloseButton(text('stripClose'), () => dispatch({ type: 'close' })),
                ],
            }
        }
        if (state.phase === 'failed') {
            return {
                icon: 'failed',
                title: text(state.failure === 'install' ? 'stripInstallFailed' : 'stripDownloadFailed'),
                actions: [
                    createButton('update-strip-btn--ghost', text('stripRetry'), retry),
                    createButton('update-strip-btn--primary', text('stripFromSite'), () => sendIpc('open-url', SITE_DOWNLOAD_URL)),
                    createCloseButton(text('stripClose'), () => dispatch({ type: 'close' })),
                ],
            }
        }
        return null
    }

    function renderContent(content) {
        const row = createEl('div', 'update-strip-row')
        if (content.icon) {
            const icon = createEl('span', `update-strip-icon update-strip-icon--${content.icon}`)
            icon.innerHTML = ICONS[content.icon]
            row.appendChild(icon)
        }
        row.appendChild(createEl('span', 'update-strip-title', content.title))
        if (content.hint) row.appendChild(createEl('span', 'update-strip-hint', content.hint))
        const actions = createEl('div', 'update-strip-actions')
        actions.append(...content.actions)
        row.appendChild(actions)
        strip.replaceChildren(row)
    }

    // scrollHeight never reports less than the current height, so collapsing needs the children.
    function contentHeight() {
        return [...strip.children].reduce((sum, child) => sum + child.offsetHeight, 0)
    }

    // Everything measured from the window edge (Ctrl+F, the folder panel) follows this value.
    // Overlays pinned to the content area are repositioned once the slide has finished.
    function applyHeight() {
        const height = isStripOpen(state) ? contentHeight() : 0
        if (height === appliedHeight) return
        appliedHeight = height
        strip.style.height = `${height}px`
        document.documentElement.style.setProperty('--update-strip-h', `${height}px`)
        clearTimeout(settleTimer)
        settleTimer = setTimeout(() => window.dispatchEvent(new Event('resize')), SLIDE_MS + 40)
    }

    function renderDownload() {
        const isDownloading = state.phase === 'downloading'
        line.hidden = !isDownloading
        titleText.hidden = !isDownloading
        if (!isDownloading) return
        lineFill.style.transform = `scaleX(${state.percent / 100})`
        titleText.textContent = text('stripDownloading').replace('{n}', state.percent)
    }

    function renderStatusButton() {
        const isSnoozed = state.phase === 'snoozed'
        statusButton.hidden = !isSnoozed
        statusDivider.hidden = !isSnoozed
        if (isSnoozed) statusButtonText.textContent = text('statusUpdate')
    }

    function render() {
        renderDownload()
        renderStatusButton()

        const content = contentFor()
        strip.inert = !content
        if (content) renderContent(content)
        applyHeight()
    }

    statusButton.addEventListener('click', () => dispatch({ type: 'show' }))
    window.addEventListener('resize', applyHeight)

    return { dispatch }
}

function bindUpdater({ ipcRenderer, invokeIpc, tGet }) {
    const strip = createUpdateStrip({
        invokeIpc,
        sendIpc: (channel, ...args) => ipcRenderer.send(channel, ...args),
        tGet,
    })

    ipcRenderer.on('update-status', (data = {}) => {
        if (!data || typeof data !== 'object') {
            console.warn('[updater] Invalid update-status payload:', data)
            return
        }

        const { status = 'unknown', version = '', percent = 0, error = null, failedBefore = false } = data
        if (status === 'error') console.warn('[updater] Update error:', error)

        strip.dispatch({
            type: 'status',
            status,
            version,
            percent: Math.round(percent || 0),
            failedBefore,
        })
    })

    invokeIpc('update:just-updated')
        .then((updated) => {
            if (updated?.version) strip.dispatch({ type: 'updated', version: updated.version })
        })
        .catch((error) => console.warn('[updater] Could not read the last update:', error))
}

module.exports = {
    bindUpdater,
}
