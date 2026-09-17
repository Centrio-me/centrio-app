// REDESIGN (2026-09-17, "Верхняя шапка нуждается в переделке. Меню теперь
// будет как 3 палочки слева от кнопок закрытия. Там-же будут кнопки
// Перезагрузить, Выключить звук, Назад, сплит - переезжает туда" — live user
// request, refined twice in the same thread:
//   1. "Я бы сделал не три точки, а три палочки" — hamburger (3 horizontal
//      lines), not a "⋮" dots icon.
//   2. "Нееее. Иконки, что я написал, должны быть снаружи. Под рукой" —
//      Reload/Mute/Back/Split are standalone always-visible icon buttons in
//      .titlebar-quickmenu-icons, NOT inside the hamburger dropdown.
//   3. "А в бургере только то меню, что сейчас у нас выдвигается от
//      логотипа" — the hamburger dropdown (#tqmDropdown) holds the ORIGINAL
//      text menu's full content verbatim (same ids: menuSettings/menuQuit/
//      menuUndo/etc, physically moved in index.html) — this file does NOT
//      bind those, menu-bind.js's existing handlers already own them
//      unchanged regardless of where in the DOM they now sit.
//
// #splitBtn itself is NOT wired here either — it kept its id when physically
// moved into .titlebar-quickmenu-icons (see index.html), so split.js's own
// existing click listener/positioning/Pro-gate logic already works unchanged
// in its new location. This file only owns Reload/Mute/Back and the
// hamburger open/close toggle.
function bindTitlebarQuickMenuUi ({
    state,
    isMessengerMuted,
    updateMuteIcon,
    saveData
}) {
    const toggleBtn = document.getElementById('tqmToggleBtn')
    const dropdown   = document.getElementById('tqmDropdown')

    function activeWebview () {
        return state.activeTabId ? document.getElementById(`webview-${state.activeTabId}`) : null
    }

    if (toggleBtn && dropdown) {
        function closeMenu () {
            dropdown.classList.remove('show')
            toggleBtn.classList.remove('open')
        }

        // BUGFIX (2026-09-17, "Рамка сплита выше выпадающего меню" — live
        // user report, screenshot showed the split-mode focus-highlight
        // border — .content-area.split-active .tabs-content::before/::after,
        // z-index:300, see styles.css — rendering ON TOP of this dropdown):
        // #tqmDropdown was a plain CSS position:absolute child of
        // .titlebar-quickmenu, which lives inside #titlebar — its own
        // z-index:999999 only wins stacking comparisons AMONG #titlebar's
        // own descendants, not against unrelated stacking contexts created
        // elsewhere in the page (like .content-area's), so a much lower
        // z-index elsewhere could still paint above it depending on ancestor
        // stacking. Portaling the dropdown to document.body on first open —
        // same escape-the-nested-stacking-context trick already used by
        // splitLayoutPicker (renderer/split.js) and the workspace switcher's
        // collapsed-mode menu (renderer/workspaces-ui.js) — puts it in the
        // top-level stacking context instead, where its own z-index
        // unambiguously wins against everything.
        function positionDropdown () {
            const rect = toggleBtn.getBoundingClientRect()
            dropdown.style.position = 'fixed'
            dropdown.style.top   = `${Math.round(rect.bottom + 4)}px`
            dropdown.style.right = `${Math.round(window.innerWidth - rect.right)}px`
            dropdown.style.left  = 'auto'
        }

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            const opening = !dropdown.classList.contains('show')
            document.dispatchEvent(new CustomEvent('close-all-popups'))
            if (opening) {
                if (dropdown.parentElement !== document.body) document.body.appendChild(dropdown)
                positionDropdown()
                dropdown.classList.add('show')
                toggleBtn.classList.add('open')
                document.dispatchEvent(new CustomEvent('popup-opened'))
            }
        })
        document.addEventListener('close-all-popups', closeMenu)

        // Any item inside the (moved-in) old menu closes the dropdown after
        // acting — those items' own click handlers (menu-bind.js) only ever
        // knew how to clear the OLD `.menu-item.open` state, which no longer
        // exists now that they're flat rows in one dropdown instead of 5
        // tabs; a single delegated listener here covers all of them without
        // having to touch each individual handler.
        dropdown.addEventListener('click', () => closeMenu())
    }

    // Startup sync — switchTab() (renderer/messengers.js) keeps this synced
    // on every later switch, but the very first active tab may have been set
    // some other way before this binder ran.
    if (state.activeTabId) {
        document.getElementById('tqmMute')?.classList.toggle('muted', isMessengerMuted(state.activeTabId))
    }

    document.getElementById('tqmReload')?.addEventListener('click', () => {
        activeWebview()?.reload()
    })

    document.getElementById('tqmMute')?.addEventListener('click', function () {
        if (!state.activeTabId) return
        state.mutedMessengers[state.activeTabId] = !state.mutedMessengers[state.activeTabId]
        saveData()
        updateMuteIcon(state.activeTabId)
        this.classList.toggle('muted', isMessengerMuted(state.activeTabId))
    })

    document.getElementById('tqmBack')?.addEventListener('click', () => {
        const wv = activeWebview()
        if (wv?.canGoBack?.()) wv.goBack()
    })

    // BUGFIX (2026-09-17, "Стрелочка назад одна - смотрится странно. Давай и
    // вперед стрелочка" — live user request): Electron's <webview> already
    // supports goForward()/canGoForward() natively, same as the goBack() pair
    // above.
    document.getElementById('tqmForward')?.addEventListener('click', () => {
        const wv = activeWebview()
        if (wv?.canGoForward?.()) wv.goForward()
    })
}

module.exports = {
    bindTitlebarQuickMenuUi
}
