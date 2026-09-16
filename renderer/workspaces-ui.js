// Рабочие пространства как ПЛАГИН (2026-09-14, четвёртый пересмотр).
// История: сначала пользователь передумал после живой проверки: "Рабочие
// пространства не работают и необходимо сделать их дополнительным плагином
// всё-таки. Папки нужно вернуть... Папки и рабочие пространства смогут
// существовать вместе. В рабочих пространствах могут быть папки. И они
// включаются как плагин" — так появился первый слой фильтрации (по папкам,
// folder.workspaceId). Затем, увидев что "переключаю на другое пространство
// и просто вижу те же самые мессенджеры", попросил добавить прямую
// фильтрацию мессенджеров вне папок — появился второй, независимый слой
// (messenger.workspaceId). Но третий live-репорт вскрыл, что сама МОДЕЛЬ
// видимости была неверной: "Создаю новое рабочее пространство - оно уже со
// всеми мессенджерами. Пространства - это смена всех мессенджеров и папок.
// Как-будто ещё аккаунт, где у тебя приложения и папки" — то есть
// пространство должно вести себя как ОТДЕЛЬНЫЙ АККАУНТ: показывать ТОЛЬКО
// то, что явно в него добавлено, а не "всё, что ни к чему не привязано,
// плюс то немногое, что привязано именно сюда". Новое (пустое) пространство
// должно быть пустым, а не сразу показывать все мессенджеры.
//
// Итоговое правило: когда активно конкретное пространство (activeWorkspaceId
// задан) — видно ТОЛЬКО то, что явно помечено этим workspaceId, всё
// остальное (включая ничем не помеченное) скрыто. Когда активно «Все»
// (activeWorkspaceId === null) — видно всё, без исключений; это единственный
// режим показа "непривязанного". Оба слоя (папки и отдельные мессенджеры вне
// папок) используют одно и то же правило и включаются/выключаются вместе
// через Расширения (см. renderer/extensions-ui.js NATIVE_EXTENSIONS
// 'workspaces').
function createWorkspacesUiApi({
    state,
    store,
    tGet,
    saveData,
    activityTop,
    openEditModal,
    folderIcons,
    showTooltip,
    hideTooltip
}) {
    let switcherEl = null
    let menuEl = null
    let menuOpen = false
    let enabled = false

    // Иконка по умолчанию для "Все" (пространство не выбрано) — та же
    // сетка 2×2, что была раньше единственной иконкой кнопки.
    const DEFAULT_SWITCHER_ICON_SVG = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/>
            <rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/>
            <rect x="14" y="14" width="7" height="7" rx="1.5"/>
        </svg>
    `

    function isFolderVisibleInActiveWorkspace(folder) {
        if (!enabled) return true
        if (!state.activeWorkspaceId) return true
        return folder.workspaceId === state.activeWorkspaceId
    }

    // Только для мессенджеров ВНЕ папок — у мессенджера внутри папки
    // видимость по-прежнему решает сама папка (isFolderVisibleInActiveWorkspace
    // выше), его собственный workspaceId (если вдруг остался от прошлого
    // назначения) здесь сознательно игнорируется.
    function isMessengerVisibleInActiveWorkspace(messenger) {
        if (!enabled) return true
        if (!state.activeWorkspaceId) return true
        return messenger.workspaceId === state.activeWorkspaceId
    }

    // Показывает/скрывает существующие узлы .folder-item/messenger-item на
    // месте — ничего не создаёт и не двигает.
    function applyWorkspaceFilter() {
        state.folders.forEach((f) => {
            const el = document.getElementById(`folder-${f.id}`)
            if (!el) return
            el.style.display = isFolderVisibleInActiveWorkspace(f) ? '' : 'none'
        })
        state.activeMessengers.forEach((m) => {
            if (m.folderId) return
            const el = document.getElementById(`sidebar-${m.id}`)
            if (!el) return
            el.style.display = isMessengerVisibleInActiveWorkspace(m) ? '' : 'none'
        })
    }

    function escapeHtml(str) {
        const div = document.createElement('div')
        div.textContent = str ?? ''
        return div.innerHTML
    }

    function closeSwitcherMenu() {
        menuOpen = false
        switcherEl?.classList.remove('open')
        if (menuEl) menuEl.style.display = 'none'
    }

    // BUGFIX (2026-09-16, third live-report in the same thread — "снова
    // закрывается список пространств, если нажать на активную вкладку...
    // Если открыл список пространств, то только ты его можешь свернуть"):
    // the previous attempt closed the dropdown on any left-click OUTSIDE
    // #activityBar (the sidebar), on the theory that a click there meant
    // "moving on to the main content area" — but switchTab() also updates a
    // SEPARATE `.tab` element (the tab strip in the content header, see
    // renderer/messengers.js's switchTab) that lives outside #activityBar
    // entirely, so clicking the already-active tab there still read as an
    // "outside click" and closed the dropdown. Given two prior fix attempts
    // still left cases where this closed unexpectedly, the user asked for
    // the simplest possible rule instead: it does not auto-close on any
    // click anywhere, full stop — only an explicit action closes it (picking
    // a workspace, the create button — both already call closeSwitcherMenu()
    // above — the switcher's own toggle button re-click, or Escape).
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menuOpen) closeSwitcherMenu()
    })

    function currentWorkspaceLabel() {
        if (!state.activeWorkspaceId) return tGet('workspaces.all') || 'Все'
        const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId)
        return ws ? ws.name : (tGet('workspaces.all') || 'Все')
    }

    // FEATURE (2026-09-16, live-запрос "иконка меняется в зависимости от
    // выбранной иконки для пространства"): раньше кнопка всегда показывала
    // фиксированную иконку 2×2-сетки независимо от того, какое пространство
    // активно — теперь она подменяется на иконку самого пространства (тот
    // же folderIcons-набор, что в меню и в модалке создания), падая обратно
    // на сетку только для "Все" (пространство не выбрано).
    function updateSwitcherLabel() {
        if (!switcherEl) return
        const label = switcherEl.querySelector('.workspace-switcher-label')
        const iconWrap = switcherEl.querySelector('.workspace-switcher-icon')
        const ws = state.activeWorkspaceId ? state.workspaces.find(w => w.id === state.activeWorkspaceId) : null
        if (label) label.textContent = currentWorkspaceLabel()
        if (iconWrap) {
            iconWrap.innerHTML = ws
                ? ((folderIcons && folderIcons[ws.icon]) || (folderIcons && folderIcons.folder) || DEFAULT_SWITCHER_ICON_SVG)
                : DEFAULT_SWITCHER_ICON_SVG
        }
    }

    function setActiveWorkspace(workspaceId) {
        state.activeWorkspaceId = workspaceId || null
        store.set('activeWorkspaceId', state.activeWorkspaceId)
        updateSwitcherLabel()
        applyWorkspaceFilter()
    }

    function renderSwitcherMenu() {
        const menu = menuEl
        if (!menu) return

        const items = [`
            <div class="workspace-switcher-item ${!state.activeWorkspaceId ? 'active' : ''}" data-id="">
                <span class="workspace-switcher-item-dot" style="background:var(--accent)"></span>
                <span class="workspace-switcher-item-name">${escapeHtml(tGet('workspaces.all') || 'Все')}</span>
            </div>
        `]

        state.workspaces.forEach((ws) => {
            // FEATURE (2026-09-14, live-запрос "иконку выбирать для каждого
            // нужно"): та же иконка, что выбрана для пространства в
            // модалке (тот же набор folderIcons, что и у папок), цвет —
            // через CSS currentColor, а не заливку фона — иконка остаётся
            // читаемой на любой теме.
            const iconSvg = (folderIcons && folderIcons[ws.icon]) || (folderIcons && folderIcons.folder) || ''
            items.push(`
                <div class="workspace-switcher-item ${state.activeWorkspaceId === ws.id ? 'active' : ''}" data-id="${escapeHtml(ws.id)}">
                    <span class="workspace-switcher-item-icon" style="color:${escapeHtml(ws.color || 'var(--accent)')}">${iconSvg}</span>
                    <span class="workspace-switcher-item-name">${escapeHtml(ws.name)}</span>
                </div>
            `)
        })

        menu.innerHTML = `
            ${items.join('')}
            <div class="workspace-switcher-divider"></div>
            <div class="workspace-switcher-manage" id="workspaceCreateBtn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
                <span>${escapeHtml(tGet('workspaces.create') || 'Новое пространство')}</span>
            </div>
        `

        menu.querySelectorAll('.workspace-switcher-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                setActiveWorkspace(item.dataset.id || null)
                closeSwitcherMenu()
            })
            if (item.dataset.id) {
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    // BUGFIX (2026-09-16, live-репорт коллеги в Telegram:
                    // "Развернул блок, в нём есть 2 пространства. Тыкаешь ПКМ
                    // на одном из них... он тут же сворачивается и меню из 2
                    // пунктов остаётся 'висеть в воздухе'"): closeSwitcherMenu()
                    // used to run here BEFORE showTinyMenu(), collapsing the
                    // whole dropdown (and the sidebar layout under it, in
                    // inline-expanded mode) an instant before the tiny
                    // rename/delete menu appeared — leaving it floating with
                    // no visible anchor. The dropdown now stays open; it
                    // still closes normally afterward via rename/delete
                    // picking an action, or a genuine click-away.
                    showTinyMenu(e.clientX, e.clientY, item.dataset.id)
                })
            }
        })

        menu.querySelector('#workspaceCreateBtn')?.addEventListener('click', (e) => {
            e.stopPropagation()
            closeSwitcherMenu()
            openCreateModal()
        })
    }

    // Создание/переименование пространства идёт через ТУ ЖЕ нативную
    // модалку (#editModal), что и у папок/мессенджеров, а не через
    // отдельный самодельный попап — так надёжнее (тот же проверенный
    // z-index/фокус/Enter-to-save) и понятнее (выглядит как остальной UI
    // приложения, а не как что-то незнакомое). См. renderer.js's
    // openEditModal() — там же читается state.editMode.
    function openCreateModal() {
        state.editMode = 'newWorkspace'
        state.selectedWorkspaceIcon = 'folder'
        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')
        if (saveBtn) delete saveBtn.dataset.pendingMessengerId
        if (editName) editName.value = ''
        if (editModalTitle) editModalTitle.textContent = tGet('workspaces.newTitle') || 'Новое пространство'
        openEditModal?.()
    }

    function openRenameModal(workspaceId) {
        const ws = getWorkspaceById(workspaceId)
        if (!ws) return
        state.editMode = 'workspace'
        state.selectedWorkspaceIcon = ws.icon || 'folder'
        const saveBtn = document.getElementById('saveEditBtn')
        const editName = document.getElementById('editName')
        const editModalTitle = document.getElementById('editModalTitle')
        if (saveBtn) saveBtn.dataset.pendingMessengerId = ws.id
        if (editName) editName.value = ws.name
        if (editModalTitle) editModalTitle.textContent = tGet('workspaces.renameTitle') || 'Переименовать пространство'
        openEditModal?.()
    }

    // Маленькое контекстное меню (переименовать/удалить) по правому клику на
    // строке пространства в основном меню-переключателе — самодостаточный
    // портал (как и само меню-переключатель), не завязан на остальные
    // контекстные меню приложения.
    let tinyMenuEl = null
    function showTinyMenu(x, y, workspaceId) {
        if (!tinyMenuEl) {
            tinyMenuEl = document.createElement('div')
            tinyMenuEl.className = 'workspace-switcher-menu'
            document.body.appendChild(tinyMenuEl)
            document.addEventListener('close-all-popups', () => { tinyMenuEl.style.display = 'none' })
        }
        const ws = getWorkspaceById(workspaceId)
        if (!ws) return
        tinyMenuEl.innerHTML = `
            <div class="workspace-switcher-item" data-act="rename">
                <span class="workspace-switcher-item-name">${escapeHtml(tGet('workspaces.rename') || 'Переименовать')}</span>
            </div>
            <div class="workspace-switcher-item" data-act="delete">
                <span class="workspace-switcher-item-name">${escapeHtml(tGet('workspaces.delete') || 'Удалить')}</span>
            </div>
        `
        tinyMenuEl.style.left = `${Math.round(x)}px`
        tinyMenuEl.style.top = `${Math.round(y)}px`
        tinyMenuEl.style.display = 'block'
        tinyMenuEl.querySelector('[data-act="rename"]').addEventListener('click', () => {
            tinyMenuEl.style.display = 'none'
            openRenameModal(workspaceId)
        })
        tinyMenuEl.querySelector('[data-act="delete"]').addEventListener('click', () => {
            tinyMenuEl.style.display = 'none'
            removeWorkspace(workspaceId)
        })
    }

    function ensureSwitcher() {
        if (switcherEl) return switcherEl

        // BUGFIX (2026-09-14, второй live-репорт — "выглядит ужасно и
        // непонятно", сравнение с раскрытым сайдбаром): кнопка теперь —
        // самый обычный .activity-btn/.activity-btn-label, как
        // addMessengerBtn/lockBtn/downloadsBtn и т.д. Это даёт ей БЕСПЛАТНО
        // все уже готовые правила для свёрнутого/раскрытого сайдбара
        // (#activityBar.sidebar-expanded ... в styles.css) — раньше кнопка
        // была отдельным классом .workspace-switcher-btn, который в эти
        // правила не попадал, поэтому в раскрытом сайдбаре у неё не было
        // подписи вообще (просто голая точка), в отличие от каждой другой
        // кнопки дока.
        switcherEl = document.createElement('div')
        switcherEl.id = 'workspaceSwitcher'
        switcherEl.className = 'workspace-switcher'
        switcherEl.style.display = 'none'
        // Иконка — своя обёртка (.workspace-switcher-icon), подменяется в
        // updateSwitcherLabel() на иконку активного пространства. Точка-цвет
        // теперь маленький бейдж в углу (как .messenger-badge/PRO-бейдж у
        // соседних кнопок дока), а не единственный визуальный элемент кнопки.
        switcherEl.innerHTML = `
            <button type="button" class="activity-btn workspace-switcher-btn" id="workspaceSwitcherBtn">
                <span class="workspace-switcher-icon">${DEFAULT_SWITCHER_ICON_SVG}</span>
                <span class="activity-btn-label workspace-switcher-label"></span>
                <svg class="workspace-switcher-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
            </button>
        `

        // FEATURE/REDESIGN (2026-09-16, "Выделить рабочее пространство
        // рамкой. Как будто это выпадающий список. И выпадает он не во
        // всплывающем окне, а двигает всё вниз. Выбираешь пространство -
        // выбирается, список сворачивается" — live user request): раньше
        // меню всегда было "порталом" в document.body с position:fixed (см.
        // историю ниже) — теперь, когда сайдбар РАСКРЫТ, меню вместо этого
        // вставляется обычным соседом кнопки прямо в поток документа
        // (.activity-top), без position — раскрытие/схлопывание двигает
        // остальные иконки дока вниз/вверх, как обычный выпадающий список
        // (select), а не всплывает поверх контента. Когда сайдбар СВЁРНУТ
        // (узкая колонка иконок, тексту негде поместиться инлайн), меню
        // остаётся порталом с position:fixed по прежней логике — решаем это
        // заново при каждом открытии (isExpanded), а не один раз при
        // создании, потому что пользователь может свернуть/развернуть
        // сайдбар, пока меню закрыто.
        menuEl = document.createElement('div')
        menuEl.className = 'workspace-switcher-menu'
        menuEl.style.display = 'none'
        document.body.appendChild(menuEl)

        const btn = switcherEl.querySelector('#workspaceSwitcherBtn')

        // BUGFIX (2026-09-16, "Пространство подписано сбоку, как и любой
        // мессенджер, а не посередине" — live user report): the button had
        // no custom hover label at all before — just a native `title`
        // attribute, which the OS renders wherever it wants (usually near
        // the cursor, not pinned beside the icon), unlike every other
        // sidebar icon (messengers, folders — see renderFolder's mouseenter
        // above) which uses this same showTooltip()/hideTooltip() pair to
        // show a custom tooltip pinned to the icon's right edge,
        // vertically centered on it (see renderer/tooltips.js). Shows the
        // CURRENT workspace name (not a static "Рабочие пространства"
        // label), same as a messenger/folder tooltip shows its own name.
        if (showTooltip && hideTooltip) {
            btn.addEventListener('mouseenter', () => showTooltip(btn, currentWorkspaceLabel()))
            btn.addEventListener('mouseleave', hideTooltip)
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            const opening = !menuOpen
            document.dispatchEvent(new CustomEvent('close-all-popups'))
            // BUGFIX (2026-09-16, same pass that dropped the mousedown-based
            // outside-click listener below): closing on re-click used to
            // happen implicitly, via this button's own close-all-popups
            // dispatch reaching THIS module's close-all-popups listener —
            // now that the switcher no longer listens to that shared event
            // (see the BUGFIX above), re-clicking the button while already
            // open must close it explicitly here instead, or it would never
            // close via the button at all.
            if (!opening) closeSwitcherMenu()
            if (opening) {
                renderSwitcherMenu()
                const isExpanded = !!activityTop.closest('#activityBar')?.classList.contains('sidebar-expanded')
                if (isExpanded) {
                    menuEl.classList.add('workspace-switcher-menu-inline')
                    menuEl.style.position = ''
                    menuEl.style.top = ''
                    menuEl.style.left = ''
                    switcherEl.insertAdjacentElement('afterend', menuEl)
                } else {
                    menuEl.classList.remove('workspace-switcher-menu-inline')
                    document.body.appendChild(menuEl)
                    menuEl.style.position = 'fixed'
                    const rect = btn.getBoundingClientRect()
                    menuEl.style.top = `${Math.round(rect.top)}px`
                    menuEl.style.left = `${Math.round(rect.right + 6)}px`
                }
                menuEl.style.display = 'block'
                menuOpen = true
                switcherEl.classList.add('open')
                document.dispatchEvent(new CustomEvent('popup-opened'))
            }
        })

        activityTop.insertBefore(switcherEl, activityTop.querySelector('.activity-divider')?.nextSibling || null)
        return switcherEl
    }

    // Включить/выключить плагин целиком (тумблер в Расширениях). Выключение
    // не трогает сами данные (workspaceId у папок остаётся) — просто прячет
    // переключатель и снимает фильтр (показывает все папки), как и было у
    // первой версии.
    function setEnabled(isEnabled) {
        enabled = !!isEnabled
        ensureSwitcher()
        switcherEl.style.display = enabled ? '' : 'none'
        if (!enabled) state.activeWorkspaceId = null
        applyWorkspaceFilter()
        updateSwitcherLabel()
    }

    function isEnabled() {
        return enabled
    }

    // Удалить пространство целиком — снимает workspaceId со всех папок,
    // которые в него входили (папки остаются, просто больше ни к чему не
    // привязаны), ничего не удаляет из сайдбара (у пространств нет
    // контейнера, это только фильтр).
    function removeWorkspace(workspaceId) {
        state.folders.forEach((f) => {
            if (f.workspaceId === workspaceId) f.workspaceId = null
        })
        state.workspaces = state.workspaces.filter(w => w.id !== workspaceId)
        if (state.activeWorkspaceId === workspaceId) setActiveWorkspace(null)
        applyWorkspaceFilter()
        updateSwitcherLabel()
        saveData()
    }

    function getWorkspaceById(workspaceId) {
        return state.workspaces.find(w => w.id === workspaceId) || null
    }

    return {
        ensureSwitcher,
        applyWorkspaceFilter,
        setEnabled,
        isEnabled,
        setActiveWorkspace,
        removeWorkspace,
        getWorkspaceById,
        updateSwitcherLabel,
        renderSwitcherMenu,
        closeSwitcherMenu
    }
}

module.exports = {
    createWorkspacesUiApi
}
