const { getVisualMessengerOrder } = require('./tab-order')

// Ctrl+Shift+N opens the Nth saved split screen; pressed again while that very screen is open it closes the split.
let presetOpenedByKey = null

function bindAppEvents({
    state,
    quickSearch,
    findBar,
    closeQuickSearch,
    openQuickSearch,
    closeFindBar,
    openFindBar,
    switchTab,
    applyAppZoom,
    applyTabZoom,
    openSettings,
    splitApi // (id) => void-ish API from renderer/split.js — getPresets()/applyPreset() back saved split screens (see Ctrl+Shift+1..9 below)
}) {
    function togglePreset(index) {
        const presets = (splitApi && splitApi.getPresets && splitApi.getPresets()) || []
        const preset = presets[index]
        if (!preset) return false
        if (state.splitMode && presetOpenedByKey === preset.id) {
            presetOpenedByKey = null
            splitApi.exitSplitMode()
            return true
        }
        presetOpenedByKey = preset.id
        splitApi.applyPreset(preset.id)
        return true
    }

    document.addEventListener('keydown', (e) => {
        const tag = document.activeElement?.tagName
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA'

        // Ctrl+K stays as a fixed second key for the quick search; the main key is the rebindable
        // "quickSearch" action (see the 'centrio-shortcut' listener below).
        if (e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyK') {
            e.preventDefault()
            quickSearch.classList.contains('show') ? closeQuickSearch() : openQuickSearch()
            return
        }

        if (e.key === 'Escape') {
            if (quickSearch.classList.contains('show')) {
                closeQuickSearch()
                return
            }
            if (findBar.classList.contains('show')) {
                closeFindBar()
                return
            }
            // BUGFIX (2026-09-16, "и на esc не реагирует при этом (но ожидал
            // что esc и пропадёт)" — live user report about the workspace
            // move submenu, but this was never wired for ANY context menu in
            // the app): Escape only ever handled quickSearch/findBar here —
            // every context menu (right-click menu, folder/workspace move
            // pickers, etc, all closed via the shared 'close-all-popups'
            // event, see renderer/context-menus.js's hideAllMenus) had no
            // keyboard dismissal at all, only click-outside. Dispatching the
            // same event Escape already triggers everywhere else covers all
            // of them for free — no per-menu wiring needed.
            document.dispatchEvent(new CustomEvent('close-all-popups'))
        }

        if (isInput) return

        if (e.ctrlKey && !e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit9') {
            e.preventDefault()
            const idx = parseInt(e.code.replace('Digit', '')) - 1
            const target = getVisualMessengerOrder(state)[idx]
            if (target) switchTab(target.id)
            return
        }

        // FEATURE (2026-09-21, "хоткеи для сохранённых экранов Сплит" — live
        // user request): Ctrl+Shift+1..9 jumps straight to the Nth saved
        // split-screen preset (renderer/split.js's getPresets()/applyPreset()
        // — same presets shown in the split picker panel, in the same
        // saved order). Deliberately mirrors the existing Ctrl+1..9 "switch
        // to Nth tab" binding one modifier over, rather than a new key
        // entirely, so it reads as "the same idea, one level up" instead of
        // an unrelated shortcut to memorize.
        if (e.ctrlKey && e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit9' && splitApi) {
            const idx = parseInt(e.code.replace('Digit', '')) - 1
            if (togglePreset(idx)) e.preventDefault()
        }
    })

    // BUGFIX (2026-09-21, live report — "иногда Ctrl+ и Ctrl- не работают
    // для масштабирования вкладки"): this listener only fires while focus is
    // on the HOST UI — the moment focus is inside a <webview> (i.e. the user
    // is actually using the open messenger, the overwhelmingly common case),
    // keydown never reaches here at all; webview-preload.js's own
    // bindKeyboardForwarding() captures it there instead and relays it via
    // 'keyboard-shortcut' (see renderer/webview-tabs-bind.js). That relay
    // path already matched BOTH the top-row +/- keys (code: Equal/Minus) AND
    // the numpad's dedicated +/- keys (code: NumpadAdd/NumpadSubtract) — this
    // host-side listener only ever matched the top-row keys. A numpad
    // press worked whenever focus happened to be inside a webview and did
    // nothing whenever it happened to be on the host UI — exactly the
    // "works sometimes" pattern reported, not a network/timing flake.
    document.addEventListener('keydown', (e) => {
        const isPlus  = e.key === '=' || e.code === 'Equal' || e.code === 'NumpadAdd'
        const isMinus = e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract'

        if (e.ctrlKey && e.shiftKey && isPlus) {
            e.preventDefault()
            applyAppZoom(state.appZoomLevel + 1)
            return
        }

        if (e.ctrlKey && e.shiftKey && isMinus) {
            e.preventDefault()
            applyAppZoom(state.appZoomLevel - 1)
            return
        }

        if (e.ctrlKey && !e.shiftKey && e.code === 'Digit0') {
            e.preventDefault()
            applyAppZoom(0)
            return
        }

        if (e.ctrlKey && !e.shiftKey && isPlus) {
            e.preventDefault()
            applyTabZoom(state.tabZoomLevel + 0.25)
            return
        }

        if (e.ctrlKey && !e.shiftKey && isMinus) {
            e.preventDefault()
            applyTabZoom(state.tabZoomLevel - 0.25)
        }
    })

    // Rebindable shortcuts arrive from the main process (it matches keys for the app and for every webview).
    document.addEventListener('centrio-shortcut', (e) => {
        const action = e.detail && e.detail.action
        if (action === 'splitPreset') togglePreset(Number(e.detail.index))
        else if (action === 'quickSearch') quickSearch.classList.contains('show') ? closeQuickSearch() : openQuickSearch()
        else if (action === 'findInPage') findBar.classList.contains('show') ? closeFindBar() : openFindBar()
    })

    document.addEventListener('mousedown', (e) => {
        const btn = e.target.closest('.activity-btn, .messenger-item')
        if (!btn) return

        btn.classList.remove('ripple-active')
        void btn.offsetWidth
        btn.classList.add('ripple-active')
        btn.addEventListener('animationend', () => btn.classList.remove('ripple-active'), { once: true })
    })
}

module.exports = {
    bindAppEvents
}