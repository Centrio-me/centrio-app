// New look of sidebar folders (concept agreed with the owner, 2026-10-02).
//
// - The folder icon shows a 2x2 mosaic of the services inside, a coloured rim
//   and the total unread counter.
// - Expanded sidebar: clicking a folder opens it in place (accordion).
// - Collapsed sidebar: clicking opens the side card with names, captions,
//   counters and folder actions.
// - Right click: pick a colour, mute the whole folder.
// - Settings -> Appearance -> "Folder view" switches back to the classic look.
//
// The look is a body class (folders-modern / folders-classic): classic keeps
// every old rule untouched, modern only adds rules under .folders-modern.
const { getCaption } = require('./add-modal-catalog')

const COLORS = ['#6366f1', '#f59e0b', '#22c55e', '#ef4444', '#06b6d4', '#ec4899']
// A folder with no saved colour (new, or created by the team owner) gets the default one, so every
// folder looks the same out of the box. "No colour" is an explicit choice, stored as NO_COLOR.
const DEFAULT_COLOR = COLORS[0]
const NO_COLOR = 'none'
const MOSAIC_MAX = 4

function createFoldersModern({ state, store, tGet, getLanguage, updateMuteIcon, saveData, pushToCloud, closeFolderPanel, openFolderMenu }) {
    const t = (key, fallback, params) => {
        let text = tGet(`foldersView.${key}`) || fallback || ''
        for (const [k, v] of Object.entries(params || {})) text = text.split(`{${k}}`).join(String(v))
        return text
    }

    const isModern = () => (store.get('foldersStyle', 'modern') || 'modern') !== 'classic'
    const isSidebarExpanded = () => !!document.getElementById('activityBar')?.classList.contains('sidebar-expanded')
    const colors = () => store.get('folderColors', {}) || {}
    const colorOf = (folderId) => {
        const saved = colors()[folderId]
        return saved === NO_COLOR ? null : (saved || DEFAULT_COLOR)
    }
    const members = (folderId) => state.activeMessengers.filter((m) => m.folderId === folderId)
    const unreadOf = (folderId) => members(folderId).reduce((sum, m) => sum + (state.unreadCounts[m.id] || 0), 0)

    function applyStyle() {
        const modern = isModern()
        document.body.classList.toggle('folders-modern', modern)
        document.body.classList.toggle('folders-classic', !modern)
        document.querySelectorAll('.settings-view-option[data-folders-style]').forEach((button) => {
            button.classList.toggle('on', button.dataset.foldersStyle === (modern ? 'modern' : 'classic'))
        })
    }

    function setStyle(style) {
        store.set('foldersStyle', style === 'classic' ? 'classic' : 'modern')
        applyStyle()
        refreshAll()
        pushToCloud?.()
    }

    function node(tag, className, text) {
        const element = document.createElement(tag)
        if (className) element.className = className
        if (text != null) element.textContent = text
        return element
    }

    // Always four slots: the services first, then dashed "+" placeholders.
    function fillMosaic(container, list) {
        container.textContent = ''
        for (let index = 0; index < MOSAIC_MAX; index++) {
            const messenger = list[index]
            if (messenger) {
                const image = document.createElement('img')
                image.alt = ''
                image.src = messenger.icon
                container.appendChild(image)
            } else {
                container.appendChild(node('span', 'mosaic-empty'))
            }
        }
    }

    // Header decorations (mosaic host, count pill, chevron) are created once.
    function decorateHeader(folderEl) {
        const header = folderEl.querySelector('.folder-header')
        const wrap = folderEl.querySelector('.folder-icon-wrap')
        if (!header || !wrap || header.querySelector('.folder-chevron')) return
        wrap.appendChild(node('div', 'folder-mosaic'))
        header.appendChild(node('span', 'folder-count'))
        const chevron = node('span', 'folder-chevron')
        chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'
        header.appendChild(chevron)
    }

    function refreshFolder(folderId) {
        const folderEl = document.getElementById(`folder-${folderId}`)
        if (!folderEl) return
        decorateHeader(folderEl)
        const list = members(folderId)
        folderEl.classList.toggle('has-members', list.length > 0)
        const color = colorOf(folderId)
        folderEl.classList.toggle('tinted', !!color)
        if (color) folderEl.style.setProperty('--folder-color', color)
        else folderEl.style.removeProperty('--folder-color')

        const mosaic = folderEl.querySelector('.folder-mosaic')
        if (mosaic) fillMosaic(mosaic, list)
        const count = folderEl.querySelector('.folder-count')
        if (count) {
            count.textContent = String(list.length)
            const unread = unreadOf(folderId)
            count.classList.toggle('has-unread', unread > 0)
        }
    }

    function refreshAll() {
        state.folders.forEach((folder) => refreshFolder(folder.id))
        if (state.activeFolderPanelId) decoratePanel(state.activeFolderPanelId)
    }

    // ---- accordion / card -------------------------------------------------
    const useInline = () => isModern() && isSidebarExpanded()

    function toggleInline(folderId) {
        document.getElementById(`folder-${folderId}`)?.classList.toggle('inline-open')
    }

    // The side card: header with mosaic, summary and actions, plus a caption
    // under every service name.
    function decoratePanel(folderId) {
        if (!isModern()) return
        const content = document.getElementById('folderPanelContent')
        const folder = state.folders.find((f) => f.id === folderId)
        if (!content || !folder) return
        content.querySelector('.fp-head')?.remove()

        const list = members(folderId)
        const unread = unreadOf(folderId)
        const head = node('div', 'fp-head')
        const color = colorOf(folderId)
        if (color) head.style.setProperty('--folder-color', color)

        const mosaic = node('div', 'fp-mosaic')
        fillMosaic(mosaic, list)
        head.appendChild(mosaic)

        const text = node('div', 'fp-text')
        text.appendChild(node('strong', '', folder.name))
        const summary = [t('services', 'Сервисов: {n}', { n: list.length })]
        if (unread > 0) summary.push(t('unread', 'непрочитанных: {n}', { n: unread }))
        text.appendChild(node('small', '', summary.join(' · ')))
        head.appendChild(text)

        const actions = node('div', 'fp-actions')
        const allMuted = list.length > 0 && list.every((m) => state.mutedMessengers[m.id])
        const mute = node('button', 'fp-btn')
        mute.type = 'button'
        mute.title = allMuted ? t('unmute', 'Включить уведомления папки') : t('mute', 'Заглушить папку')
        mute.setAttribute('aria-label', mute.title)
        // Single-colour line icon (currentColor), never an emoji.
        mute.innerHTML = allMuted
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'
        mute.addEventListener('click', () => { muteFolder(folderId); decoratePanel(folderId) })
        actions.appendChild(mute)
        if (!folder.orgManaged) {
            const more = node('button', 'fp-btn')
            more.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>'
            more.type = 'button'
            more.title = t('more', 'Ещё')
            more.setAttribute('aria-label', more.title)
            more.addEventListener('click', (event) => openFolderMenu?.(event, folderId))
            actions.appendChild(more)
        }
        head.appendChild(actions)
        content.insertBefore(head, content.firstChild)

        content.querySelectorAll('.messenger-item').forEach((item) => {
            const id = item.id.replace(/^sidebar-/, '')
            const messenger = state.activeMessengers.find((m) => m.id === id)
            const nameEl = item.querySelector('.messenger-name')
            if (!messenger || !nameEl || nameEl.querySelector('small')) return
            const caption = getCaption(messenger.name, getLanguage() || 'ru')
            if (caption) nameEl.appendChild(node('small', 'fp-caption', caption))
        })
    }

    // ---- actions ----------------------------------------------------------
    function muteFolder(folderId) {
        const list = members(folderId)
        if (list.length === 0) return
        const mute = !list.every((m) => state.mutedMessengers[m.id])
        list.forEach((m) => {
            state.mutedMessengers[m.id] = mute
            updateMuteIcon?.(m.id)
        })
        saveData()
    }

    function setColor(folderId, color) {
        const map = { ...colors() }
        map[folderId] = color || NO_COLOR
        store.set('folderColors', map)
        refreshFolder(folderId)
        if (state.activeFolderPanelId === folderId) {
            // The open card changes colour right away, not on the next open.
            const panel = document.getElementById('folderPanel')
            if (panel) {
                panel.classList.toggle('tinted', !!color)
                if (color) panel.style.setProperty('--folder-color', color)
                else panel.style.removeProperty('--folder-color')
            }
            decoratePanel(folderId)
        }
        pushToCloud?.()
    }

    function bindControls() {
        document.querySelectorAll('.settings-view-option[data-folders-style]').forEach((button) => {
            button.addEventListener('click', () => setStyle(button.dataset.foldersStyle))
        })
        const colorRow = document.getElementById('ctxFolderColors')
        if (colorRow && !colorRow.children.length) {
            COLORS.forEach((color) => {
                const swatch = node('button', 'ctx-color')
                swatch.type = 'button'
                swatch.style.setProperty('--c', color)
                swatch.setAttribute('aria-label', color)
                swatch.addEventListener('click', (event) => {
                    event.stopPropagation()
                    const folderId = state.contextTargetFolderId
                    document.getElementById('folderContextMenu')?.classList.remove('show')
                    if (folderId) setColor(folderId, color)
                })
                colorRow.appendChild(swatch)
            })
            const reset = node('button', 'ctx-color ctx-color-reset', '×')
            reset.type = 'button'
            reset.setAttribute('aria-label', t('colorReset', 'Без цвета'))
            reset.addEventListener('click', (event) => {
                event.stopPropagation()
                const folderId = state.contextTargetFolderId
                document.getElementById('folderContextMenu')?.classList.remove('show')
                if (folderId) setColor(folderId, null)
            })
            colorRow.appendChild(reset)
        }
        document.getElementById('ctxFolderMute')?.addEventListener('click', () => {
            const folderId = state.contextTargetFolderId
            document.getElementById('folderContextMenu')?.classList.remove('show')
            if (folderId) { muteFolder(folderId); refreshAll() }
        })
    }

    // The floating card closes on a click outside it or on Escape.
    document.addEventListener('mousedown', (event) => {
        if (!isModern() || !state.activeFolderPanelId) return
        if (event.target.closest('#folderPanel, .folder-header, #folderContextMenu')) return
        closeFolderPanel()
    })
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isModern() && state.activeFolderPanelId) closeFolderPanel()
    })

    applyStyle()
    bindControls()

    return { isModern, applyStyle, setStyle, refreshFolder, refreshAll, decorateHeader, useInline, toggleInline, decoratePanel, setColor, muteFolder }
}

module.exports = { createFoldersModern }
