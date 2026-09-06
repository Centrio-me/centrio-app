// Менеджер загрузок: список последних загрузок (из главного окна и из
// сессий мессенджеров), с контекстным меню «Показать в папке» / «Открыть файл».
function bindDownloadsUi({
    invokeIpc,
    ipcRenderer,
    tGet
}) {
    const btn          = document.getElementById('downloadsBtn')
    const panel        = document.getElementById('downloadsPanel')
    const badge        = document.getElementById('downloadsBadge')
    const list         = document.getElementById('downloadsList')
    const clearAllBtn  = document.getElementById('downloadsClearAll')
    const contextMenu  = document.getElementById('downloadContextMenu')

    if (!btn || !panel) return {}

    let downloads = []
    let panelOpen = false
    let contextTargetId = null

    // ── Helpers ────────────────────────────────────────────────────────────────
    // Превью картинки в списке загрузок — как в браузере: для завершённых
    // загрузок изображений показываем реальную миниатюру (file:// на уже
    // скачанный файл), для остального — универсальную иконку документа.
    const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|svg|ico|avif)$/i

    function isImageFile(filename) {
        return IMAGE_EXT_RE.test(filename || '')
    }

    function toFileUrl(filePath) {
        let normalized = String(filePath || '').replace(/\\/g, '/')
        if (!normalized.startsWith('/')) normalized = '/' + normalized
        const segments = normalized.split('/').map((seg, i) => {
            // Буква диска ("C:") остаётся как есть — иначе encodeURIComponent
            // превратит двоеточие в %3A и получится невалидный file:// URL
            if (i === 1 && /^[a-zA-Z]:$/.test(seg)) return seg
            return encodeURIComponent(seg)
        })
        return 'file://' + segments.join('/')
    }

    const GENERIC_FILE_ICON = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `

    function thumbnailHtml(d) {
        if (d.state === 'completed' && d.savePath && isImageFile(d.filename)) {
            const url = toFileUrl(d.savePath)
            return `<img class="downloads-thumb" data-image-thumb="1" src="${escapeHtml(url)}" alt="">`
        }
        return `<div class="downloads-thumb downloads-thumb-generic">${GENERIC_FILE_ICON}</div>`
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }

    function formatBytes(n) {
        if (!n || n <= 0) return '0 B'
        const units = ['B', 'KB', 'MB', 'GB']
        let value = n
        let unitIndex = 0
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024
            unitIndex++
        }
        return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
    }

    function formatDate(ms) {
        try {
            const d = new Date(ms)
            const diffMins = Math.floor((Date.now() - ms) / 60000)
            if (diffMins < 1) return tGet('notifications.justNow') || 'just now'
            if (diffMins < 60) return (tGet('notifications.minAgo') || '{n} min ago').replace('{n}', diffMins)
            const diffH = Math.floor(diffMins / 60)
            if (diffH < 24) return (tGet('notifications.hAgo') || '{n} h ago').replace('{n}', diffH)
            return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
        } catch { return '' }
    }

    function stateLabel(d) {
        if (d.state === 'progressing') return tGet('downloads.inProgress') || 'Downloading…'
        if (d.state === 'cancelled') return tGet('downloads.cancelled') || 'Cancelled'
        if (d.state === 'interrupted') return tGet('downloads.failed') || 'Failed'
        return tGet('downloads.completed') || 'Completed'
    }

    // ── State ──────────────────────────────────────────────────────────────────
    function upsert(record) {
        if (!record || !record.id) return
        const idx = downloads.findIndex(d => d.id === record.id)
        if (idx === -1) downloads.unshift(record)
        else downloads[idx] = record
        updateBadge()
        if (panelOpen) renderPanel()
    }

    function updateBadge() {
        if (!badge) return
        const active = downloads.filter(d => d.state === 'progressing').length
        if (active > 0) {
            badge.textContent = active > 99 ? '99+' : String(active)
            badge.style.display = 'flex'
        } else {
            badge.style.display = 'none'
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    function renderPanel() {
        if (!list) return

        if (!downloads.length) {
            list.innerHTML = `<div class="app-notif-empty">${tGet('downloads.empty') || 'No downloads yet'}</div>`
            return
        }

        list.innerHTML = downloads.map(d => {
            const pct = d.totalBytes > 0
                ? Math.min(100, Math.round((d.receivedBytes / d.totalBytes) * 100))
                : 0

            const progressHtml = d.state === 'progressing'
                ? `<div class="downloads-progress-track"><div class="downloads-progress-fill" style="width:${pct}%"></div></div>`
                : ''

            const bodyText = d.state === 'progressing'
                ? `${formatBytes(d.receivedBytes)} / ${d.totalBytes > 0 ? formatBytes(d.totalBytes) : '?'}`
                : stateLabel(d)

            return `
                <div class="app-notif-item downloads-item" data-id="${escapeHtml(d.id)}" title="${escapeHtml(d.filename)}">
                    <div class="downloads-item-row">
                        ${thumbnailHtml(d)}
                        <div class="downloads-item-info">
                            <div class="app-notif-item-title">${escapeHtml(d.filename)}</div>
                            ${progressHtml}
                            <div class="app-notif-item-body">${escapeHtml(bodyText)}</div>
                            <div class="app-notif-item-time">${formatDate(d.startTime)}</div>
                        </div>
                    </div>
                </div>
            `
        }).join('')

        // Если файл-картинка удалили/переместили с диска после загрузки,
        // file:// не резолвится — откатываемся на обычную иконку документа
        // вместо сломанной иконки браузера.
        list.querySelectorAll('img.downloads-thumb[data-image-thumb]').forEach(img => {
            img.addEventListener('error', () => {
                const fallback = document.createElement('div')
                fallback.className = 'downloads-thumb downloads-thumb-generic'
                fallback.innerHTML = GENERIC_FILE_ICON
                img.replaceWith(fallback)
            }, { once: true })
        })

        // Перетаскивание файла из этой панели прямо в мессенджер. Раньше
        // (v1.9.5) было убрано после двух провалившихся попыток: startDrag()
        // из main-процесса документированно не работает для intra-app-дропа
        // на Windows (Electron issue #7118), а 'DownloadURL' в dataTransfer
        // либо не долетал до <webview> вовсе, либо триггерил фолбэк открытия
        // нового окна (см. комментарий в webview-preload.js). Третий подход
        // (см. startDownloadDrag ниже) вообще не использует настоящую
        // OS-drag-сессию — курсор-ghost + геометрия для определения целевого
        // <webview>, синтетический drop строится ВНУТРИ гостевой страницы.
        // Обычный клик (без сдвига мыши) по-прежнему открывает файл.
        list.querySelectorAll('.downloads-item').forEach(el => {
            let suppressClick = false

            el.addEventListener('mousedown', (e) => {
                const d = downloads.find(x => x.id === el.dataset.id)
                if (!d || d.state !== 'completed' || e.button !== 0) return
                startDownloadDrag(e, d, () => { suppressClick = true })
            })

            el.addEventListener('click', () => {
                if (suppressClick) { suppressClick = false; return }
                const d = downloads.find(x => x.id === el.dataset.id)
                if (d && d.state === 'completed') invokeIpc('downloads:open-file', d.id)
            })
            el.addEventListener('contextmenu', (e) => {
                e.preventDefault()
                e.stopPropagation()
                showDownloadContextMenu(e, el.dataset.id)
            })
        })
    }

    // ── Drag-and-drop файла из панели прямо в мессенджер ────────────────────────
    const DRAG_START_THRESHOLD_PX = 6
    let dragCtx = null // { ghostEl, targetWv }

    function setWebviewsPointerEvents(enabled) {
        // <webview> — отдельный слой композитора со своим процессом; пока
        // курсор над ним, host-документ вообще не получает mousemove (это же
        // причина, по которой renderer/split.js делает то же самое при
        // ресайзе разделителя сплита). Без этого geometry-based определение
        // целевой вкладки не сработало бы, пока курсор реально над webview.
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.pointerEvents = enabled ? '' : 'none'
        })
    }

    function findWebviewAtPoint(x, y) {
        const webviews = document.querySelectorAll('webview')
        for (const wv of webviews) {
            const rect = wv.getBoundingClientRect()
            if (rect.width === 0 || rect.height === 0) continue // скрыт (display:none)
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                return wv
            }
        }
        return null
    }

    function clearDragTargetHighlight() {
        document.querySelectorAll('webview.downloads-drag-target')
            .forEach(wv => wv.classList.remove('downloads-drag-target'))
    }

    function createGhost(filename) {
        const el = document.createElement('div')
        el.className = 'downloads-drag-ghost'
        el.textContent = filename
        document.body.appendChild(el)
        return el
    }

    // Пока реальная мышь движется над каким-то webview во время перетаскивания
    // из панели загрузок, шлём туда лёгкие hover-события (без байтов файла —
    // как настоящий браузерный dragover) так часто, как реально движется
    // курсор, но не чаще этого порога — иначе на быстрых mousemove улетит
    // сотня IPC-сообщений в секунду без всякой пользы.
    const HOVER_THROTTLE_MS = 40

    function beginDrag(record) {
        setWebviewsPointerEvents(false)
        dragCtx = { ghostEl: createGhost(record.filename), targetWv: null, record, lastHoverSentAt: 0 }
    }

    function sendLeave(wv) {
        if (!wv) return
        try { wv.send('centrio-drag-leave') } catch (err) {
        }
    }

    function updateDrag(x, y) {
        if (!dragCtx) return
        dragCtx.ghostEl.style.left = `${x}px`
        dragCtx.ghostEl.style.top = `${y}px`

        const wv = findWebviewAtPoint(x, y)
        if (wv !== dragCtx.targetWv) {
            clearDragTargetHighlight()
            // BUGFIX ("файлы перетаскиваются, но мессенджер не показывает
            // область куда вставляешь — как это показывается из проводника"):
            // previously the guest's own drop-zone overlay only ever existed
            // for the ~250ms of the artificial post-drop event burst, since
            // it had no idea a drag was happening until the file had already
            // been dropped. Telling the target webview as soon as the real
            // cursor enters it (and again on every throttled move below) lets
            // the guest page mount/keep its native-looking drop overlay open
            // for the whole real hover duration, same as dragging in from
            // Windows Explorer. Leaving a target (moving to another webview,
            // or off all of them) tells the old one to tear its overlay down
            // cleanly instead of leaving it stuck open.
            if (dragCtx.targetWv) sendLeave(dragCtx.targetWv)
            if (wv) wv.classList.add('downloads-drag-target')
            dragCtx.targetWv = wv
            dragCtx.lastHoverSentAt = 0
        }
        dragCtx.ghostEl.classList.toggle('drag-invalid', !wv)

        if (wv) {
            const now = performance.now()
            if (now - dragCtx.lastHoverSentAt >= HOVER_THROTTLE_MS) {
                dragCtx.lastHoverSentAt = now
                const rect = wv.getBoundingClientRect()
                try {
                    wv.send('centrio-drag-hover', {
                        filename: dragCtx.record.filename,
                        mimeType: dragCtx.record.mimeType,
                        x: Math.round(x - rect.left),
                        y: Math.round(y - rect.top)
                    })
                } catch (err) {
                }
            }
        }
    }

    async function finishDrag(x, y, record) {
        const targetWv = dragCtx?.targetWv
        dragCtx?.ghostEl?.remove()
        clearDragTargetHighlight()
        setWebviewsPointerEvents(true)
        dragCtx = null

        if (!targetWv) return
        const rect = targetWv.getBoundingClientRect()

        const result = await invokeIpc('downloads:read-file-bytes', record.id).catch((err) => {
            console.warn('[downloads-drag] read-file-bytes failed:', err)
            return null
        })
        if (!result?.success || !result.data) {
            console.warn('[downloads-drag] no usable file data, aborting drop:', result?.error)
            return
        }

        try {
            targetWv.send('centrio-drop-file', {
                data: result.data,
                filename: result.filename,
                mimeType: result.mimeType,
                x: Math.round(x - rect.left),
                y: Math.round(y - rect.top)
            })
        } catch (err) {
            console.warn('[downloads-drag] webview.send(centrio-drop-file) failed:', err)
        }
    }

    function startDownloadDrag(downEvent, record, onDragArmed) {
        const startX = downEvent.clientX
        const startY = downEvent.clientY
        let armed = false

        function onMove(moveEv) {
            if (!armed) {
                const dx = moveEv.clientX - startX
                const dy = moveEv.clientY - startY
                if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD_PX) return
                armed = true
                onDragArmed()
                beginDrag(record)
            }
            updateDrag(moveEv.clientX, moveEv.clientY)
        }

        function onUp(upEv) {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', onUp)
            if (armed) finishDrag(upEv.clientX, upEv.clientY, record)
        }

        document.addEventListener('mousemove', onMove)
        document.addEventListener('mouseup', onUp)
    }

    // ── Контекстное меню ───────────────────────────────────────────────────────
    function showDownloadContextMenu(e, id) {
        if (!contextMenu) return
        // Не шлём сюда close-all-popups: это меню — дочернее к уже открытой
        // панели загрузок, закрывать саму панель при его открытии не нужно.
        contextTargetId = id
        contextMenu.style.left = `${e.clientX}px`
        contextMenu.style.top = `${e.clientY}px`
        contextMenu.classList.add('show')

        const rect = contextMenu.getBoundingClientRect()
        if (rect.right > window.innerWidth) contextMenu.style.left = `${e.clientX - rect.width}px`
        if (rect.bottom > window.innerHeight) contextMenu.style.top = `${e.clientY - rect.height}px`
        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function hideDownloadContextMenu() {
        contextMenu?.classList.remove('show')
        contextTargetId = null
    }

    document.addEventListener('close-all-popups', hideDownloadContextMenu)

    document.getElementById('ctxDownloadShowInFolder')?.addEventListener('click', () => {
        if (contextTargetId) ipcRenderer.send('downloads:show-in-folder', contextTargetId)
        hideDownloadContextMenu()
    })

    document.getElementById('ctxDownloadOpenFile')?.addEventListener('click', () => {
        if (contextTargetId) invokeIpc('downloads:open-file', contextTargetId)
        hideDownloadContextMenu()
    })

    document.getElementById('ctxDownloadRemove')?.addEventListener('click', () => {
        if (contextTargetId) {
            ipcRenderer.send('downloads:remove', contextTargetId)
            downloads = downloads.filter(d => d.id !== contextTargetId)
            updateBadge()
            renderPanel()
        }
        hideDownloadContextMenu()
    })

    // ── Панель open/close ──────────────────────────────────────────────────────
    function openPanel() {
        document.dispatchEvent(new CustomEvent('close-all-popups'))

        panelOpen = true
        renderPanel()

        const rect = btn.getBoundingClientRect()
        panel.style.left = `${rect.right + 14}px`
        panel.style.top  = '0px'
        panel.style.display = 'flex'

        requestAnimationFrame(() => {
            const pRect = panel.getBoundingClientRect()
            let top = rect.bottom - pRect.height
            if (top < 12) top = 12
            if (top + pRect.height > window.innerHeight - 12) {
                top = window.innerHeight - pRect.height - 12
            }
            panel.style.top = `${Math.max(12, top)}px`
        })

        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function closePanel() {
        panelOpen = false
        panel.style.display = 'none'
        hideDownloadContextMenu()
    }

    document.addEventListener('close-all-popups', closePanel)

    btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (panel.style.display === 'none' || !panel.style.display) {
            openPanel()
        } else {
            closePanel()
        }
    })

    clearAllBtn?.addEventListener('click', (e) => {
        e.stopPropagation()
        ipcRenderer.send('downloads:clear')
        downloads = []
        updateBadge()
        renderPanel()
    })

    document.addEventListener('click', (e) => {
        if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target !== btn) {
            closePanel()
        }
        if (contextMenu && !contextMenu.contains(e.target)) {
            hideDownloadContextMenu()
        }
    })

    ipcRenderer.on('downloads:item-update', (record) => upsert(record))

    ;(async () => {
        const history = await invokeIpc('downloads:get-history').catch(() => [])
        downloads = Array.isArray(history) ? history : []
        updateBadge()
    })()

    return { upsert }
}

module.exports = { bindDownloadsUi }
