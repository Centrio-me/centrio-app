// renderer/split.js — Split-screen mode
// Two messengers side by side with a drag-resize divider, plus grid layouts
// (3 columns / 2x2) with a zone-picker.
//
// ARCHITECTURE NOTE:
// #splitHandle, #splitPicker, #splitLayoutPicker, #splitZones and
// #splitZonePicker are all appended to document.body as position:fixed
// elements. This is the only reliable way to make them receive pointer
// events above Electron webviews, which intercept all mouse input within
// their bounds regardless of CSS z-index.
//
// GOTCHA this hoisting causes: any CSS rule that depends on one of these
// elements still being a DESCENDANT of #contentArea (e.g. a selector like
// ".content-area.split-active .split-zones { display: block }") will never
// match again once the element has been moved to <body> — it's a sibling of
// #contentArea now, not a descendant. Control visibility of these five
// elements directly via element.style.display in JS, never via a CSS
// descendant selector keyed off an ancestor class.
'use strict'

const { getVisibleMessengerIds } = require('./focused-messenger')

// Раскладки-сетки (доп. к классическому 2col выше) — прямоугольники в % от
// #contentArea. Зона 0 всегда зеркалит activeTabId (та же конвенция, что и
// "левая панель" в 2col), остальные зоны назначаются через мини-попап.
const GRID_LAYOUTS = {
    '3col': [
        { left: 0,      top: 0, width: 33.34, height: 100 },
        { left: 33.34,  top: 0, width: 33.33, height: 100 },
        { left: 66.67,  top: 0, width: 33.33, height: 100 }
    ],
    '2x2': [
        { left: 0,  top: 0,  width: 50, height: 50 },
        { left: 50, top: 0,  width: 50, height: 50 },
        { left: 0,  top: 50, width: 50, height: 50 },
        { left: 50, top: 50, width: 50, height: 50 }
    ],
    '2top1bottom': [
        { left: 0,  top: 0,  width: 50,  height: 50 },
        { left: 50, top: 0,  width: 50,  height: 50 },
        { left: 0,  top: 50, width: 100, height: 50 }
    ],
    '1top2bottom': [
        { left: 0,  top: 0,  width: 100, height: 50 },
        { left: 0,  top: 50, width: 50,  height: 50 },
        { left: 50, top: 50, width: 50,  height: 50 }
    ],
    // Two wide columns and a narrow third one cut in half: two big messengers plus two small ones (tasks, assistant…).
    '3colsplit': [
        { left: 0,    top: 0,  width: 37.5, height: 100 },
        { left: 37.5, top: 0,  width: 37.5, height: 100 },
        { left: 75,   top: 0,  width: 25,   height: 50 },
        { left: 75,   top: 50, width: 25,   height: 50 }
    ]
}

// Все раскладки-сетки считаются динамически из положений границ (state.gridRowPct/
// gridSidePct, для 3col ещё gridColA/gridColB) — см. getGridLayout(); статическая таблица
// выше остаётся только как проверка допустимого имени раскладки.
const DEFAULT_COL_A = 33.34
const DEFAULT_COL_B = 66.67
const MIN_COL_GAP = 10 // two column borders never come closer than this, in %
// "Two wide columns + a split one" starts with the narrow column on the right.
const DEFAULT_SPLIT_COL_A = 37.5
const DEFAULT_SPLIT_COL_B = 75
const hasColumnDividers = (layout) => layout === '3col' || layout === '3colsplit'
const defaultColumns = (layout) => (layout === '3colsplit' ? [DEFAULT_SPLIT_COL_A, DEFAULT_SPLIT_COL_B] : [DEFAULT_COL_A, DEFAULT_COL_B])
const nearly = (a, b) => Math.abs((a || 0) - b) < 0.5

function computeRowLayout (layout, rowPct, sidePct, colA = DEFAULT_COL_A, colB = DEFAULT_COL_B) {
    if (layout === '3col') {
        return [
            { left: 0,    top: 0, width: colA,        height: 100 },
            { left: colA, top: 0, width: colB - colA, height: 100 },
            { left: colB, top: 0, width: 100 - colB,  height: 100 }
        ]
    }
    if (layout === '3colsplit') {
        return [
            { left: 0,    top: 0,      width: colA,        height: 100 },
            { left: colA, top: 0,      width: colB - colA, height: 100 },
            { left: colB, top: 0,      width: 100 - colB,  height: rowPct },
            { left: colB, top: rowPct, width: 100 - colB,  height: 100 - rowPct }
        ]
    }
    if (layout === '2x2') {
        return [
            { left: 0,       top: 0,      width: sidePct,       height: rowPct },
            { left: sidePct, top: 0,      width: 100 - sidePct, height: rowPct },
            { left: 0,       top: rowPct, width: sidePct,       height: 100 - rowPct },
            { left: sidePct, top: rowPct, width: 100 - sidePct, height: 100 - rowPct }
        ]
    }
    if (layout === '2top1bottom') {
        return [
            { left: 0,      top: 0,      width: sidePct,       height: rowPct },
            { left: sidePct, top: 0,     width: 100 - sidePct, height: rowPct },
            { left: 0,      top: rowPct, width: 100,           height: 100 - rowPct }
        ]
    }
    if (layout === '1top2bottom') {
        return [
            { left: 0,      top: 0,           width: 100,           height: 100 - rowPct },
            { left: 0,      top: 100 - rowPct, width: sidePct,       height: rowPct },
            { left: sidePct, top: 100 - rowPct, width: 100 - sidePct, height: rowPct }
        ]
    }
    return null
}

function createSplitApi ({
    state,
    tabsContent,
    contentArea,
    store,
    switchTab,
    // BUGFIX ("пресеты в сплитах не сохраняются" — persistence-across-restart
    // half of it): same cloud-overwrite mechanism as sidebarOrder — see
    // renderer/sidebar-dnd-bind.js. saveCurrentAsPreset()/deletePreset() only
    // wrote the local store; loadData()'s cloudSyncPull() unconditionally
    // restores splitPresets from the cloud's stale copy on every startup, so
    // any local preset add/delete not also pushed to the cloud got reverted
    // on the next launch. Optional so this file still works without cloud.
    cloudSyncPush,
    isCloudLoggedIn,
    // Zoom of one pane (webview, level) and "the focused pane changed, refresh the zoom shown/used by Ctrl+/-".
    applyPaneZoom,
    syncZoomState
}) {
    const splitHandle     = document.getElementById('splitHandle')
    const splitPicker     = document.getElementById('splitPicker')
    const splitPickerList = document.getElementById('splitPickerList')
    const splitBtn        = document.getElementById('splitBtn')
    const splitCloseBtn   = document.getElementById('splitCloseBtn')
    const splitExitBtn    = document.getElementById('splitExitBtn')
    const gridRowHandle    = document.getElementById('splitGridRowHandle')
    const gridSideHandle   = document.getElementById('splitGridSideHandle')
    const gridSide2Handle  = document.getElementById('splitGridSide2Handle')

    // A split opened from a saved preset is a locked, monolithic view: its messengers cannot be reassigned and a click on
    // a messenger outside it closes the split (see switchTab in renderer.js). Manual splits stay editable.
    function _isLocked () { return !!(state.splitMode && state.splitPresetId) }

    function _persistPresetLock () {
        const saved = store?.get?.('split.saved', null) || {}
        store?.set?.('split.saved', { ...saved, presetId: state.splitPresetId || null })
    }

    // ── Per-preset look: divider position and zoom of each pane live in the preset itself ──
    const _validPct = (v) => typeof v === 'number' && v >= 15 && v <= 85
    const _prefPct  = (key, fallback = 50) => { const v = store?.get?.(key, null); return _validPct(v) ? v : fallback }
    const _validCols = (a, b) => _validPct(a) && _validPct(b) && b - a >= MIN_COL_GAP

    // Divider positions of manual splits are the global preferences; presets bring their own and put them back on exit.
    function _resetPctsToPrefs () {
        state.splitLeftPct = _prefPct('splitLeftPctPref')
        state.gridRowPct   = _prefPct('gridRowPctPref')
        state.gridSidePct  = _prefPct('gridSidePctPref')
        const colA = _prefPct('gridColAPref', DEFAULT_COL_A)
        const colB = _prefPct('gridColBPref', DEFAULT_COL_B)
        state.gridColA = _validCols(colA, colB) ? colA : DEFAULT_COL_A
        state.gridColB = _validCols(colA, colB) ? colB : DEFAULT_COL_B
    }

    function _openPreset () {
        return _isLocked() ? getPresets().find(p => p.id === state.splitPresetId) || null : null
    }

    let _cloudPushTimer = null
    function _updateOpenPreset (mutate) {
        const presets = getPresets()
        const preset = presets.find(p => p.id === state.splitPresetId)
        if (!preset) return false
        mutate(preset)
        store?.set?.('splitPresets', presets)
        clearTimeout(_cloudPushTimer)
        _cloudPushTimer = setTimeout(_pushSplitPresetsToCloud, 1500)
        return true
    }

    // Called when a divider drag ends. True = it belonged to the open preset (so the global preference stays untouched).
    function _savePresetDividers () {
        if (!_isLocked()) return false
        return _updateOpenPreset(p => {
            p.leftPct = state.splitLeftPct || 50
            p.rowPct  = state.gridRowPct || 50
            p.sidePct = state.gridSidePct || 50
            p.colA    = state.gridColA || DEFAULT_COL_A
            p.colB    = state.gridColB || DEFAULT_COL_B
        })
    }

    function getPresetZoom (messengerId) {
        const z = _openPreset()?.zooms?.[messengerId]
        return typeof z === 'number' ? z : null
    }

    function setPresetZoom (messengerId, level) {
        if (!_isLocked() || !messengerId) return false
        return _updateOpenPreset(p => { p.zooms = { ...(p.zooms || {}), [messengerId]: level } })
    }

    function _loadPresetDividers (preset) {
        state.splitLeftPct = _validPct(preset.leftPct) ? preset.leftPct : _prefPct('splitLeftPctPref')
        state.gridRowPct   = _validPct(preset.rowPct)  ? preset.rowPct  : _prefPct('gridRowPctPref')
        state.gridSidePct  = _validPct(preset.sidePct) ? preset.sidePct : _prefPct('gridSidePctPref')
        const colsOk = _validCols(preset.colA, preset.colB)
        state.gridColA = colsOk ? preset.colA : _prefPct('gridColAPref', DEFAULT_COL_A)
        state.gridColB = colsOk ? preset.colB : _prefPct('gridColBPref', DEFAULT_COL_B)
    }

    function _applyPresetZooms (preset) {
        if (typeof applyPaneZoom !== 'function') return
        getVisibleMessengerIds(state).forEach(id => {
            const wv = document.getElementById(`webview-${id}`)
            if (!wv) return
            const own = state.activeMessengers.find(m => m.id === id)?.zoomLevel
            const level = typeof preset.zooms?.[id] === 'number' ? preset.zooms[id] : (typeof own === 'number' ? own : 1)
            applyPaneZoom(wv, level)
        })
        if (typeof syncZoomState === 'function') syncZoomState()
    }

    // After a restart the preset is re-opened from the saved split: put its dividers and zooms back.
    function restorePresetLook () {
        const preset = _openPreset()
        if (!preset) return
        _loadPresetDividers(preset)
        if (state.splitLayout === '2col') applyLeft(state.splitLeftPct)
        else _reapplyGridLayout()
        _applyPresetZooms(preset)
    }

    function getGridLayout (layout) {
        return computeRowLayout(layout, state.gridRowPct || 50, state.gridSidePct || 50, state.gridColA || DEFAULT_COL_A, state.gridColB || DEFAULT_COL_B) || GRID_LAYOUTS[layout]
    }

    // Восстанавливаем предпочтение позиций границ, как для splitLeftPct ниже.
    const _savedRowPct  = store?.get?.('gridRowPctPref', null)
    const _savedSidePct = store?.get?.('gridSidePctPref', null)
    if (typeof _savedRowPct === 'number' && _savedRowPct >= 15 && _savedRowPct <= 85) state.gridRowPct = _savedRowPct
    if (typeof _savedSidePct === 'number' && _savedSidePct >= 15 && _savedSidePct <= 85) state.gridSidePct = _savedSidePct
    {
        const a = store?.get?.('gridColAPref', null)
        const b = store?.get?.('gridColBPref', null)
        if (_validCols(a, b)) { state.gridColA = a; state.gridColB = b }
    }

    // Дефолт позиции разделителя из предыдущей сессии (см. mouseup-обработчик
    // ниже, где splitLeftPctPref сохраняется на каждом перетаскивании) — без
    // этого state.splitLeftPct всегда стартовал бы с дефолта 50 из state.js
    // при каждом свежем запуске приложения, даже если пользователь всегда
    // подгоняет разделитель под себя.
    const _savedPct = store?.get?.('splitLeftPctPref', null)
    if (typeof _savedPct === 'number' && _savedPct >= 15 && _savedPct <= 85) {
        state.splitLeftPct = _savedPct
    }

    // ── Сетка-раскладки: доп. DOM-узлы ─────────────────────────────────────────
    const splitLayoutPicker   = document.getElementById('splitLayoutPicker')
    const splitZones          = document.getElementById('splitZones')
    const splitZonePicker     = document.getElementById('splitZonePicker')
    const splitZonePickerList = document.getElementById('splitZonePickerList')

    // ── Hoist both handle and picker to document.body ─────────────────────────
    //    Electron webviews eat pointer events inside their stacking context.
    //    position:fixed children of body are always above them.

    if (splitHandle && splitHandle.parentElement !== document.body) {
        document.body.appendChild(splitHandle)
    }
    if (splitHandle) {
        splitHandle.style.position = 'fixed'
        // BUGFIX-history: dropping this to 900 (below .modal's 1000, to stop
        // the purple handle/pickers bleeding through the Settings dialog)
        // broke clicking/hovering the split UI entirely — turns out the huge
        // number WAS load-bearing after all: a webview's native compositor
        // layer doesn't respect normal CSS stacking the way .modal (which
        // isn't fighting a webview directly underneath it in the same spot)
        // gets away with at 1000. Restored to the original, proven-working
        // value; the modal-overlap case is now handled separately below by
        // hiding these elements while any .modal is open, instead of
        // permanently lowering their z-index.
        splitHandle.style.zIndex   = '99998'
        splitHandle.style.display  = 'none'
    }

    // BUGFIX ("окна не изменяют размер" при перетаскивании границы в
    // раскладках 2top1bottom/1top2bottom): getGridLayout() (см. выше) уже
    // умел считать динамические прямоугольники из state.gridRowPct/
    // gridSidePct, но ничего никогда не двигало эти значения — не было ни
    // DOM-узлов для горизонтальной/вертикальной границы, ни обработчиков
    // drag. Теперь границы есть у всех сеток (3col: две вертикальные, 2x2: крест,
    // 2top1bottom/1top2bottom: строка + граница ряда) — см. _positionGridHandles().
    ;[gridRowHandle, gridSideHandle, gridSide2Handle].forEach(el => {
        if (!el) return
        if (el.parentElement !== document.body) document.body.appendChild(el)
        el.style.position = 'fixed'
        el.style.zIndex   = '99998'
        el.style.display  = 'none'
    })
    if (gridRowHandle)  gridRowHandle.classList.add('split-handle', 'split-handle-row')
    if (gridSideHandle) gridSideHandle.classList.add('split-handle', 'split-handle-side')
    if (gridSide2Handle) gridSide2Handle.classList.add('split-handle', 'split-handle-side')

    if (splitPicker && splitPicker.parentElement !== document.body) {
        document.body.appendChild(splitPicker)
    }
    if (splitPicker) {
        splitPicker.style.position = 'fixed'
        splitPicker.style.zIndex   = '99999'
        splitPicker.style.display  = 'none'
    }

    ;[splitZones, splitZonePicker].forEach(el => {
        if (!el) return
        if (el.parentElement !== document.body) document.body.appendChild(el)
        el.style.position = 'fixed'
        el.style.zIndex   = '99999'
    })

    // BUGFIX ("выйти из сплита нельзя, если в зоне не выбран мессенджер"):
    // splitLayoutPicker (раскладки + кнопка "Выключить сплит-режим",
    // splitExitBtn) used to share the same z-index (99999) as splitPicker/
    // splitZones/splitZonePicker. With equal z-index, later siblings in
    // document.body win ties — and splitZones (holding the real, clickable
    // — pointer-events:auto — ".split-zone-placeholder" "Выбрать
    // мессенджер" tiles for every unassigned grid zone, see
    // renderGridZones()) was appended AFTER splitLayoutPicker. showLayoutPicker()
    // opens flush against the left edge of #contentArea (anchored at
    // splitBtn's own rect, in the icon rail) — exactly where the leftmost
    // grid zone(s) render. Whenever that zone had no messenger assigned yet,
    // its full-rect placeholder sat, stacking-wise, on top of the layout
    // picker and silently ate every click meant for it, including
    // splitExitBtn — split mode became impossible to leave. Give
    // splitLayoutPicker a strictly higher z-index than every other
    // split-related overlay so the one popup that can always exit split
    // mode is never occluded by an empty zone's picker prompt.
    if (splitLayoutPicker) {
        if (splitLayoutPicker.parentElement !== document.body) document.body.appendChild(splitLayoutPicker)
        splitLayoutPicker.style.position = 'fixed'
        splitLayoutPicker.style.zIndex   = '100000'
    }

    // BUGFIX ("фиолетовая рамка вылезает поверх настроек" / "разделители
    // вылезли на экран блокировки"), take 2: instead of permanently
    // lowering z-index (which broke click/hover on the split UI — see
    // comment above), hide these body-level fixed elements only while
    // another full-screen overlay is open, and restore whatever display
    // value they had before. Covers both .modal (class toggle) and
    // #lockScreen (plain style.display toggle, see renderer/lock.js) —
    // watching both class AND style attributes, not just class, is what
    // actually catches the lock screen case.
    const _splitFixedEls = [splitHandle, gridRowHandle, gridSideHandle, gridSide2Handle, splitPicker, splitLayoutPicker, splitZones, splitZonePicker].filter(Boolean)
    const _splitFixedPrevDisplay = new Map()
    function _isOverlayOpen () {
        if (document.querySelector('.modal.show')) return true
        const lockScreen = document.getElementById('lockScreen')
        if (lockScreen && lockScreen.style.display !== 'none' && lockScreen.style.display !== '') return true
        return false
    }
    function _syncSplitUiVisibilityWithModals () {
        const overlayOpen = _isOverlayOpen()
        _splitFixedEls.forEach(el => {
            if (overlayOpen) {
                if (el.style.display !== 'none') {
                    _splitFixedPrevDisplay.set(el, el.style.display)
                    el.style.display = 'none'
                }
            } else if (_splitFixedPrevDisplay.has(el)) {
                el.style.display = _splitFixedPrevDisplay.get(el)
                _splitFixedPrevDisplay.delete(el)
            }
        })
    }
    new MutationObserver(_syncSplitUiVisibilityWithModals)
        .observe(document.body, { attributes: true, attributeFilter: ['class', 'style'], subtree: true })

    // splitZones — просто контейнер для плейсхолдеров/рамок зон, у самих
    // плейсхолдеров position:absolute (см. .split-zone-placeholder в CSS).
    // Без явного left/top:0 у самого контейнера (fixed, но без сторон —
    // остаётся в потоке документа) их px-координаты, посчитанные от рект
    // #contentArea, оказывались бы смещены на координаты контейнера, а не
    // на 0,0 окна — из-за этого зоны/плейсхолдеры рендерились не там, где
    // нужно (либо вообще за пределами видимой области).
    if (splitZones) {
        splitZones.style.left   = '0'
        splitZones.style.top    = '0'
        splitZones.style.width  = '0'
        splitZones.style.height = '0'
        splitZones.style.pointerEvents = 'none'
        splitZones.style.display = 'none'
    }

    // ── Position helpers (recalculate from contentArea live rect) ─────────────

    function _positionHandle () {
        if (!splitHandle || !contentArea) return
        const rect  = contentArea.getBoundingClientRect()
        const pct   = (state.splitLeftPct || 50) / 100
        const centerX = rect.left + rect.width * pct
        splitHandle.style.left   = (centerX - 3) + 'px'
        splitHandle.style.top    = rect.top + 'px'
        splitHandle.style.width  = '6px'
        splitHandle.style.height = rect.height + 'px'
        splitHandle.style.right  = 'auto'
        splitHandle.style.bottom = 'auto'
    }

    function _positionPicker () {
        if (!splitPicker || !contentArea) return
        const rect  = contentArea.getBoundingClientRect()
        const pct   = (state.splitLeftPct || 50) / 100
        const leftX = rect.left + rect.width * pct
        splitPicker.style.left   = leftX + 'px'
        splitPicker.style.top    = rect.top + 'px'
        splitPicker.style.width  = (rect.right - leftX) + 'px'
        splitPicker.style.height = rect.height + 'px'
        splitPicker.style.right  = 'auto'
        splitPicker.style.bottom = 'auto'
    }

    // У всех сеток границы двигаются: 2top1bottom/1top2bottom (строка + граница внутри
    // ряда), 2x2 (крест: одна вертикальная и одна горизонтальная), 3col (две вертикальные).
    function _isGridLayout (layout) {
        return layout === '2top1bottom' || layout === '1top2bottom' || layout === '2x2' || layout === '3col' || layout === '3colsplit'
    }

    function _hideGridHandles () {
        ;[gridRowHandle, gridSideHandle, gridSide2Handle].forEach(el => { if (el) el.style.display = 'none' })
    }

    function _placeVertical (el, rect, pct, topPct, heightPct) {
        if (!el) return
        el.style.display = 'block'
        el.style.left    = (rect.left + rect.width * (pct / 100) - 3) + 'px'
        el.style.top     = (rect.top + rect.height * (topPct / 100)) + 'px'
        el.style.width   = '6px'
        el.style.height  = (rect.height * (heightPct / 100)) + 'px'
        el.style.right   = 'auto'
        el.style.bottom  = 'auto'
    }

    // fromPct/widthPct: the part of the width the horizontal divider spans (the whole window unless a layout cuts one column).
    function _placeHorizontal (el, rect, pct, fromPct = 0, widthPct = 100) {
        if (!el) return
        el.style.display = 'block'
        el.style.left    = (rect.left + rect.width * (fromPct / 100)) + 'px'
        el.style.top     = (rect.top + rect.height * (pct / 100) - 3) + 'px'
        el.style.width   = (rect.width * (widthPct / 100)) + 'px'
        el.style.height  = '6px'
        el.style.right   = 'auto'
        el.style.bottom  = 'auto'
    }

    function _positionGridHandles () {
        if (!gridRowHandle && !gridSideHandle) return
        if (!state.splitMode || !_isGridLayout(state.splitLayout)) {
            _hideGridHandles()
            return
        }

        const rect = contentArea.getBoundingClientRect()
        if (state.splitLayout === '3col') {
            if (gridRowHandle) gridRowHandle.style.display = 'none'
            _placeVertical(gridSideHandle,  rect, state.gridColA || DEFAULT_COL_A, 0, 100)
            _placeVertical(gridSide2Handle, rect, state.gridColB || DEFAULT_COL_B, 0, 100)
            return
        }
        if (state.splitLayout === '3colsplit') {
            const colB = state.gridColB || DEFAULT_SPLIT_COL_B
            _placeVertical(gridSideHandle,  rect, state.gridColA || DEFAULT_SPLIT_COL_A, 0, 100)
            _placeVertical(gridSide2Handle, rect, colB, 0, 100)
            _placeHorizontal(gridRowHandle, rect, state.gridRowPct || 50, colB, 100 - colB)
            return
        }
        if (state.splitLayout === '2x2') {
            if (gridSide2Handle) gridSide2Handle.style.display = 'none'
            _placeHorizontal(gridRowHandle, rect, state.gridRowPct || 50)
            _placeVertical(gridSideHandle, rect, state.gridSidePct || 50, 0, 100)
            return
        }
        if (gridSide2Handle) gridSide2Handle.style.display = 'none'
        const rowPct  = state.gridRowPct  || 50
        const sidePct = state.gridSidePct || 50
        // '2top1bottom': rowPct = высота верхнего ряда (граница-строка ниже
        // него). '1top2bottom': rowPct = высота НИЖНЕГО ряда (та же
        // конвенция, что и в computeRowLayout выше) — граница-строка стоит
        // на (100 - rowPct)% от верха.
        const dividerY   = state.splitLayout === '2top1bottom' ? rowPct : (100 - rowPct)
        const splitRowTop    = state.splitLayout === '2top1bottom' ? 0 : (100 - rowPct)
        const splitRowHeight = rowPct

        if (gridRowHandle) {
            gridRowHandle.style.display = 'block'
            gridRowHandle.style.left    = rect.left + 'px'
            gridRowHandle.style.top     = (rect.top + rect.height * (dividerY / 100) - 3) + 'px'
            gridRowHandle.style.width   = rect.width + 'px'
            gridRowHandle.style.height  = '6px'
            gridRowHandle.style.right   = 'auto'
            gridRowHandle.style.bottom  = 'auto'
        }
        if (gridSideHandle) {
            gridSideHandle.style.display = 'block'
            gridSideHandle.style.left    = (rect.left + rect.width * (sidePct / 100) - 3) + 'px'
            gridSideHandle.style.top     = (rect.top + rect.height * (splitRowTop / 100)) + 'px'
            gridSideHandle.style.width   = '6px'
            gridSideHandle.style.height  = (rect.height * (splitRowHeight / 100)) + 'px'
            gridSideHandle.style.right   = 'auto'
            gridSideHandle.style.bottom  = 'auto'
        }
    }

    function _reapplyGridLayout () {
        state.splitZoneIds.forEach((id, i) => { if (id) _applyGridZoneWebview(i, id) })
        renderGridZones()
        _positionGridHandles()
    }

    function _repositionOverlays () {
        if (!state.splitMode) return
        if (state.splitLayout === '2col') {
            _positionHandle()
            if (splitPicker?.style.display !== 'none') _positionPicker()
        } else {
            renderGridZones()
            _positionGridHandles()
        }
    }

    window.addEventListener('resize', _repositionOverlays)

    // BUGFIX ("всё уезжает, если выдвигается любой из сайдбаров"): открытие/
    // закрытие левого сайдбара, правой панели (#rightPanel) или папок-панели
    // меняет ширину #contentArea через CSS-transition, а не через window
    // resize — так что divider/picker/grid-хендлы (все hoisted на body,
    // см. ARCHITECTURE NOTE в шапке файла) не пересчитывались и застывали
    // на координатах ДО анимации. ResizeObserver ловит именно изменение
    // фактического бокса #contentArea, независимо от того, что его вызвало
    // (сайдбар, правая панель, ресайз окна) — тот же путь пересчёта, что и
    // window 'resize' выше, просто с правильным триггером. Слушатель на
    // время transition сработает несколько раз подряд — это дёшево
    // (переприсвоение inline-стилей), поэтому троттлинг не нужен.
    if (typeof ResizeObserver === 'function' && contentArea) {
        new ResizeObserver(_repositionOverlays).observe(contentArea)
    }

    // ── Сетка-раскладки: helpers ────────────────────────────────────────────────

    function _zoneRectToPx (rect) {
        const car = contentArea.getBoundingClientRect()
        return {
            left:   car.left + car.width  * (rect.left   / 100),
            top:    car.top  + car.height * (rect.top    / 100),
            width:  car.width  * (rect.width  / 100),
            height: car.height * (rect.height / 100)
        }
    }

    function _clearGridWebviewStyles () {
        document.querySelectorAll('webview').forEach(wv => {
            wv.classList.remove('split-grid-tile')
            wv.style.left = wv.style.top = wv.style.right = wv.style.bottom = ''
            wv.style.width = wv.style.height = ''
        })
    }

    function _applyGridZoneWebview (zoneIndex, messengerId) {
        const zones = getGridLayout(state.splitLayout)
        const rect  = zones && zones[zoneIndex]
        const wv    = messengerId ? document.getElementById(`webview-${messengerId}`) : null
        if (!rect || !wv) return

        if (zoneIndex !== 0) wv.classList.add('split-grid-tile')
        wv.style.left   = rect.left + '%'
        wv.style.top    = rect.top + '%'
        wv.style.width  = rect.width + '%'
        wv.style.height = rect.height + '%'
        wv.style.right  = 'auto'
        wv.style.bottom = 'auto'
    }

    function _clearGridZoneWebview (messengerId) {
        const wv = messengerId ? document.getElementById(`webview-${messengerId}`) : null
        if (!wv) return
        wv.classList.remove('split-grid-tile')
        wv.style.left = wv.style.top = wv.style.right = wv.style.bottom = ''
        wv.style.width = wv.style.height = ''
    }

    function renderGridZones () {
        if (!splitZones) return
        splitZones.innerHTML = ''
        const zones = getGridLayout(state.splitLayout)
        if (!zones) return

        zones.forEach((rect, i) => {
            // Зона 0 — основная вкладка, видна сама по себе через .active,
            // отдельного плейсхолдера/рамки не получает.
            if (i === 0) return

            const px = _zoneRectToPx(rect)
            const messengerId = state.splitZoneIds[i]
            const messenger = messengerId ? state.activeMessengers.find(m => m.id === messengerId) : null

            if (messenger) {
                const frame = document.createElement('div')
                frame.className = 'split-zone-tile' + (state.splitZoneFocus === i ? ' focused' : '')
                frame.style.left   = `${px.left}px`
                frame.style.top    = `${px.top}px`
                frame.style.width  = `${px.width}px`
                frame.style.height = `${px.height}px`
                frame.style.pointerEvents = 'none'
                splitZones.appendChild(frame)
            } else {
                const placeholder = document.createElement('div')
                placeholder.className = 'split-zone-placeholder'
                placeholder.style.left   = `${px.left}px`
                placeholder.style.top    = `${px.top}px`
                placeholder.style.width  = `${px.width}px`
                placeholder.style.height = `${px.height}px`
                placeholder.innerHTML = `
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 5v14M5 12h14"/>
                    </svg>
                    <span>Выбрать мессенджер</span>
                `
                placeholder.addEventListener('click', () => showZonePicker(i))
                splitZones.appendChild(placeholder)
            }
        })
    }

    function setGridZoneFocus (zoneIndex) {
        if (state.splitZoneFocus === zoneIndex) return
        state.splitZoneFocus = zoneIndex
        renderGridZones()
        _syncActiveIndicatorForGrid(zoneIndex)
        if (typeof syncZoomState === 'function') syncZoomState()
    }

    function _persistGridSplit () {
        store?.set?.('split.saved', {
            layout: state.splitLayout,
            zoneIds: state.splitZoneIds,
            splitLeftPct: state.splitLeftPct || 50,
            presetId: state.splitPresetId || null
        })
    }

    function switchGridZone (zoneIndex, messengerId) {
        if (zoneIndex === 0 || !messengerId) return

        // Если этот мессенджер уже занимал другую зону — освобождаем её
        state.splitZoneIds.forEach((id, i) => {
            if (i !== zoneIndex && id === messengerId) {
                state.splitZoneIds[i] = null
                _clearGridZoneWebview(id)
            }
        })

        // Снимаем предыдущее назначение самой зоны
        const prevId = state.splitZoneIds[zoneIndex]
        if (prevId && prevId !== messengerId) _clearGridZoneWebview(prevId)

        state.splitZoneIds[zoneIndex] = messengerId
        _applyGridZoneWebview(zoneIndex, messengerId)
        hideZonePicker()
        state.splitZoneFocus = zoneIndex
        renderGridZones()
        _syncActiveIndicatorForGrid(zoneIndex)
        _persistGridSplit()
    }

    // ── Мини-попап выбора мессенджера для одной зоны ────────────────────────────

    function showZonePicker (zoneIndex) {
        if (_isLocked()) return
        if (!splitZonePicker || !splitZonePickerList) return
        document.dispatchEvent(new CustomEvent('close-all-popups'))

        splitZonePickerList.innerHTML = ''
        state.activeMessengers.forEach(m => {
            const item = document.createElement('button')
            item.type      = 'button'
            item.className = 'split-picker-item'

            if (m.id === state.splitZoneIds[0]) {
                item.classList.add('is-primary')
                item.disabled = true
            }

            const icon = document.createElement('img')
            icon.width  = 44
            icon.height = 44
            try {
                icon.src = m.icon ||
                    `https://www.google.com/s2/favicons?domain=${new URL(m.url).hostname}&sz=64`
            } catch { icon.src = '' }
            icon.onerror = () => { icon.style.display = 'none' }

            const name = document.createElement('span')
            name.textContent = m.name

            item.appendChild(icon)
            item.appendChild(name)
            item.addEventListener('click', () => {
                if (!item.disabled) switchGridZone(zoneIndex, m.id)
            })
            splitZonePickerList.appendChild(item)
        })

        const zones = getGridLayout(state.splitLayout)
        const px = zones ? _zoneRectToPx(zones[zoneIndex]) : null
        splitZonePicker.style.display = 'block'
        if (px) {
            splitZonePicker.style.left = `${px.left + px.width / 2 - 130}px`
            splitZonePicker.style.top  = `${px.top + px.height / 2 - 80}px`
        }

        requestAnimationFrame(() => {
            const rect = splitZonePicker.getBoundingClientRect()
            let left = parseFloat(splitZonePicker.style.left) || 0
            let top  = parseFloat(splitZonePicker.style.top) || 0
            if (left < 8) left = 8
            if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8
            if (top < 8) top = 8
            if (top + rect.height > window.innerHeight - 8) top = window.innerHeight - rect.height - 8
            splitZonePicker.style.left = `${left}px`
            splitZonePicker.style.top  = `${top}px`
        })

        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function hideZonePicker () {
        if (splitZonePicker) splitZonePicker.style.display = 'none'
    }

    document.addEventListener('close-all-popups', hideZonePicker)

    // ── Выбор раскладки (2col / 3col / 2x2) ──────────────────────────────────────

    function showLayoutPicker () {
        if (!splitLayoutPicker || !splitBtn) return
        if (state.activeMessengers.length < 2) {
            const orig = splitBtn.title
            splitBtn.title = 'Нужен ещё хотя бы один мессенджер'
            setTimeout(() => { splitBtn.title = orig }, 2500)
            return
        }
        document.dispatchEvent(new CustomEvent('close-all-popups'))

        if (splitExitBtn) splitExitBtn.style.display = state.splitMode ? 'block' : 'none'
        splitLayoutPicker.querySelectorAll('.split-layout-option').forEach(optionBtn => {
            optionBtn.classList.toggle('is-current', state.splitMode && optionBtn.dataset.layout === state.splitLayout)
        })

        // BUGFIX (2026-09-17, titlebar redesign — "Сплит вообще окно не
        // видно. Уезжает за экран" — live user report): #splitBtn used to
        // live at the BOTTOM of the LEFT sidebar icon rail, so opening the
        // picker to its right (`rect.right + 10`) had the whole width of the
        // window to work with, and the old contentArea padding-push (below,
        // now removed) existed only because that left-side popup would
        // otherwise sit directly on top of the leftmost chat pane. Now that
        // #splitBtn lives in the TOP-RIGHT titlebar (see index.html), the
        // exact same `rect.right + 10` math placed the popup almost entirely
        // off the right edge of the screen — there's rarely 300+px of room
        // to the button's right up there. Anchoring to the button's RIGHT
        // edge instead (opening leftward/downward, same pattern as
        // #tqmDropdown) keeps it on-screen from a top-right anchor exactly
        // like the hamburger dropdown does.
        const rect = splitBtn.getBoundingClientRect()
        splitLayoutPicker.style.display = 'block'
        splitLayoutPicker.style.left  = 'auto'
        splitLayoutPicker.style.right = `${Math.max(10, window.innerWidth - rect.right)}px`
        splitLayoutPicker.style.top   = `${rect.bottom + 8}px`

        requestAnimationFrame(() => {
            const pRect = splitLayoutPicker.getBoundingClientRect()
            if (pRect.bottom > window.innerHeight - 10) {
                splitLayoutPicker.style.top = `${Math.max(10, window.innerHeight - pRect.height - 10)}px`
            }
            if (pRect.left < 10) {
                splitLayoutPicker.style.right = `${window.innerWidth - pRect.width - 10}px`
            }
        })

        document.dispatchEvent(new CustomEvent('popup-opened'))
    }

    function hideLayoutPicker () {
        if (splitLayoutPicker) splitLayoutPicker.style.display = 'none'
    }

    document.addEventListener('close-all-popups', hideLayoutPicker)

    splitLayoutPicker?.querySelectorAll('.split-layout-option').forEach(optionBtn => {
        optionBtn.addEventListener('click', () => {
            const layout = optionBtn.dataset.layout
            hideLayoutPicker()
            // Уже в сплите — перестраиваем раскладку на месте, перенося
            // текущие назначения (см. switchSplitLayout), вместо того чтобы
            // требовать сначала выйти из сплита целиком.
            if (state.splitMode) {
                switchSplitLayout(layout)
            } else if (layout === '2col') {
                enterSplitMode()
            } else {
                enterGridSplitMode(layout)
            }
        })
    })

    // ── Вход в сетку-раскладку ────────────────────────────────────────────────

    // presetZoneIds (optional) — carries over messenger assignments from a
    // previous layout when reconfiguring in place (see switchSplitLayout),
    // or from a saved preset (see applyPreset). Truncated/padded to the new
    // layout's zone count; zone 0 always ends up as the current active tab,
    // matching the "left pane mirrors activeTabId" convention used
    // everywhere else in this file.
    function enterGridSplitMode (layout, presetZoneIds) {
        const zones = GRID_LAYOUTS[layout] // validity check only — uses the static table
        if (!zones) return false           // on purpose, layout names never vary by pct
        if (state.activeMessengers.length < 2) {
            if (splitBtn) {
                const orig = splitBtn.title
                splitBtn.title = 'Нужен ещё хотя бы один мессенджер'
                setTimeout(() => { splitBtn.title = orig }, 2500)
            }
            return false
        }

        // The two column layouts start from their own widths: still the plain thirds (nothing moved yet) → switch to this layout's default.
        if (layout === '3colsplit' && nearly(state.gridColA, DEFAULT_COL_A) && nearly(state.gridColB, DEFAULT_COL_B)) {
            state.gridColA = DEFAULT_SPLIT_COL_A; state.gridColB = DEFAULT_SPLIT_COL_B
        } else if (layout === '3col' && nearly(state.gridColA, DEFAULT_SPLIT_COL_A) && nearly(state.gridColB, DEFAULT_SPLIT_COL_B)) {
            state.gridColA = DEFAULT_COL_A; state.gridColB = DEFAULT_COL_B
        }

        state.splitMode      = true
        state.splitLayout    = layout
        state.splitZoneFocus = 0
        state.splitZoneIds   = new Array(zones.length).fill(null)
        state.splitZoneIds[0] = state.activeTabId

        if (Array.isArray(presetZoneIds)) {
            const validIds = new Set(state.activeMessengers.map(m => m.id))
            let nextZone = 1
            for (const id of presetZoneIds) {
                if (nextZone >= zones.length) break
                if (!id || id === state.activeTabId || !validIds.has(id)) continue
                if (state.splitZoneIds.includes(id)) continue
                state.splitZoneIds[nextZone] = id
                nextZone++
            }
        }

        contentArea.classList.add('split-active', 'split-grid')
        splitBtn?.classList.add('split-active')
        if (splitZones) splitZones.style.display = 'block'

        // BUGFIX ("разделитель криво двигается при 4 мессенджерах / 2x2"):
        // enterSplitMode() (2col) explicitly shows splitHandle AND hides the
        // grid row/side handles via _positionGridHandles() — symmetric
        // cleanup. This function only ever hid/positioned the GRID handles;
        // it never hid splitHandle itself. So switching from 2col into a
        // grid layout (e.g. picking "2x2" while a 2-way split was active —
        // the normal flow via the layout picker) left the 2col drag bar
        // sitting at its last position (display:block from enterSplitMode)
        // ON TOP of the new grid. It's still fully interactive (its own
        // mousedown handler further below is untouched), so dragging it
        // called applyLeft()/_applyWebviewInlineStyles() — logic for
        // resizing a 2-pane split — against a 4-tile 2x2 grid that has no
        // concept of a single left/right pct split, producing exactly the
        // "не тащится / криво двигается" symptom. Grid layouts have their own
        // dividers (see _positionGridHandles), never the 2-pane splitHandle,
        // so the fix is simply to always hide splitHandle when entering ANY grid layout.
        if (splitHandle) splitHandle.style.display = 'none'

        state.splitZoneIds.forEach((id, i) => { if (id) _applyGridZoneWebview(i, id) })
        renderGridZones()
        _positionGridHandles()
        _persistGridSplit()
        return true
    }

    // ── Core helpers ──────────────────────────────────────────────────────────

    function applyLeft (pct) {
        state.splitLeftPct = pct
        contentArea.style.setProperty('--split-left', pct + '%')
        _applyWebviewInlineStyles(pct)
        _positionHandle()
        if (splitPicker?.style.display !== 'none') _positionPicker()
    }

    function _applyWebviewInlineStyles (pct) {
        const primaryWv = state.activeTabId
            ? document.getElementById(`webview-${state.activeTabId}`) : null
        if (primaryWv) {
            primaryWv.style.left  = '0'
            primaryWv.style.right = `calc(100% - ${pct}%)`
            primaryWv.style.width = 'auto'
        }
        const secondaryWv = state.splitTabId
            ? document.getElementById(`webview-${state.splitTabId}`) : null
        if (secondaryWv) {
            secondaryWv.style.left  = pct + '%'
            secondaryWv.style.right = '0'
            secondaryWv.style.width = 'auto'
        }
    }

    function _clearWebviewInlineStyles () {
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.left          = ''
            wv.style.right         = ''
            wv.style.width         = ''
            wv.style.pointerEvents = ''
        })
    }

    function _disableWebviewPointerEvents () {
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.pointerEvents = 'none'
        })
    }

    function _restoreWebviewPointerEvents () {
        document.querySelectorAll('webview').forEach(wv => {
            wv.style.pointerEvents = ''
        })
    }

    // BUGFIX ("постоянная активность первого мессенджера в сплит скрине"):
    // switchSplitTab() only ever repositioned the secondary webview — it never
    // touched the sidebar/tab-bar '.active' highlight, which is set solely by
    // the top-level switchTab() in renderer.js for the PRIMARY pane. So the
    // sidebar kept showing the first/primary messenger as active forever,
    // even after the user focused the secondary pane. setSplitFocus() is the
    // single choke point every focus transition already runs through (direct
    // webview click via onWebviewFocus, switchSplitTab picking a secondary,
    // enterSplitMode) — move the highlight there so it always matches which
    // pane is actually focused.
    // BUGFIX 2 (2026-09-16, "При развёрнутой левой панели всегда выделен
    // какой то один мессенджер... это при сплит скрине только... тройной
    // сплит, пишу в максе а выделена телега... в сетке (четвёрном) тоже...
    // при дйоном сплит скрине — всё ок" — live user report): this used to
    // be scoped to `if (state.splitLayout === '2col')` only, on the
    // assumption that grid layouts (triple/quad) have their own
    // '.split-zone-tile.focused' frame instead, so the sidebar highlight
    // didn't need to track them. That frame only outlines the SECONDARY
    // zones though — the sidebar item is still visible and still says
    // something, and it was simply never updated for grid layouts at all,
    // permanently stuck on whichever messenger was active before entering
    // grid mode (or the primary zone) regardless of which tile the user
    // actually focused. Extracted the DOM-sync body into a shared helper so
    // both layouts drive the same sidebar/tab highlight instead of only 2col
    // having it — see setGridZoneFocus()/switchGridZone() below for the grid
    // side of this.
    function _syncActiveIndicator (id) {
        if (!id) return

        document.querySelectorAll('.messenger-item').forEach(item => item.classList.remove('active'))
        const sidebarItem = document.getElementById(`sidebar-${id}`)
        if (sidebarItem) {
            sidebarItem.classList.add('active')
            const folderChildren = sidebarItem.closest('.folder-children')
            if (folderChildren) folderChildren.closest('.folder-item')?.classList.add('open')
        }

        document.querySelectorAll('.tab').forEach(tabEl => tabEl.classList.remove('active'))
        const tab = document.getElementById(`tab-${id}`)
        if (tab) tab.classList.add('active')

        // BUGFIX (2026-09-18, live report — "Неправильно понимает активную
        // вкладку в СПЛИТ-экране": screenshot showed the MAX pane focused
        // and highlighted in the sidebar/tabs, but the titlebar's
        // icon+name indicator next to the logo still read "Telegram").
        // #titlebarActiveTab is only ever updated inside renderer.js's
        // top-level switchTab() — but every split-focus path (clicking a
        // grid zone directly via onWebviewFocus -> setGridZoneFocus, or
        // clicking a non-primary zone via switchGridZone) calls THIS
        // function instead, either never reaching switchTab() at all or
        // (for a sidebar click while split) reaching it only after it has
        // already returned early to reroute into splitApi.switchGridZone.
        // Mirroring the same DOM update here — the one choke point every
        // split-focus path actually shares — keeps the titlebar indicator
        // truthful for 2col, grid, AND single-tab mode alike.
        const indicatorMessenger = state.activeMessengers?.find(m => m.id === id)
        const indicator = document.getElementById('titlebarActiveTab')
        if (indicator && indicatorMessenger) {
            indicator.style.display = 'flex'
            const iconEl = document.getElementById('titlebarActiveTabIcon')
            if (iconEl) {
                iconEl.style.display = ''
                iconEl.onerror = () => { iconEl.style.display = 'none' }
                iconEl.src = indicatorMessenger.icon || ''
            }
            const nameEl = document.getElementById('titlebarActiveTabName')
            if (nameEl) nameEl.textContent = indicatorMessenger.name || ''
        }
    }

    function _syncActiveIndicatorFor2col (side) {
        _syncActiveIndicator(side === 'right' ? state.splitTabId : state.activeTabId)
    }

    // Зона 0 — основная вкладка (state.activeTabId), остальные — их
    // собственный мессенджер из state.splitZoneIds (см. renderGridZones()
    // выше — та же нумерация зон).
    function _syncActiveIndicatorForGrid (zoneIndex) {
        _syncActiveIndicator(zoneIndex === 0 ? state.activeTabId : state.splitZoneIds[zoneIndex])
    }

    function setSplitFocus (side) {
        state.splitFocus = side
        contentArea.dataset.splitFocus = side
        if (state.splitLayout === '2col') _syncActiveIndicatorFor2col(side)
        if (typeof syncZoomState === 'function') syncZoomState()
    }

    // ── Picker ────────────────────────────────────────────────────────────────

    function showPicker () {
        if (!splitPicker || !splitPickerList) return
        if (_isLocked()) return

        splitPickerList.innerHTML = ''
        state.activeMessengers.forEach(m => {
            const item = document.createElement('button')
            item.type      = 'button'
            item.className = 'split-picker-item'

            if (m.id === state.activeTabId) {
                item.classList.add('is-primary')
                item.disabled = true
            }

            const icon = document.createElement('img')
            icon.width  = 44
            icon.height = 44
            try {
                icon.src = m.icon ||
                    `https://www.google.com/s2/favicons?domain=${new URL(m.url).hostname}&sz=64`
            } catch { icon.src = '' }
            icon.onerror = () => { icon.style.display = 'none' }

            const name = document.createElement('span')
            name.textContent = m.name

            item.appendChild(icon)
            item.appendChild(name)
            item.addEventListener('click', () => { if (!item.disabled) switchSplitTab(m.id) })
            splitPickerList.appendChild(item)
        })

        _positionPicker()
        splitPicker.style.display = 'flex'
        _disableWebviewPointerEvents()
    }

    function hidePicker () {
        if (splitPicker) splitPicker.style.display = 'none'
        _restoreWebviewPointerEvents()
    }

    // ── Enter / exit ──────────────────────────────────────────────────────────

    // presetSecondaryId (optional) — right-pane messenger to auto-assign
    // right away, used when reconfiguring in place from a grid layout (see
    // switchSplitLayout) or applying a saved preset. Falls back to the
    // normal "open the picker and let the user choose" flow when omitted.
    function enterSplitMode (presetSecondaryId) {
        if (state.activeMessengers.length < 2) {
            if (splitBtn) {
                const orig = splitBtn.title
                splitBtn.title = 'Нужен ещё хотя бы один мессенджер'
                setTimeout(() => { splitBtn.title = orig }, 2500)
            }
            return false
        }

        state.splitMode   = true
        state.splitLayout = '2col'
        state.splitFocus  = 'left'
        state.splitTabId  = null

        contentArea.classList.add('split-active')
        contentArea.dataset.splitFocus = 'left'

        if (splitHandle) splitHandle.style.display = 'block'
        applyLeft(state.splitLeftPct || 50)
        // Скрываем хендлы сетки-раскладок — актуально при переключении сюда
        // из 2top1bottom/1top2bottom через switchSplitLayout без полного
        // выхода из сплита (exitSplitMode тут не вызывается).
        _positionGridHandles()

        splitBtn?.classList.add('split-active')

        const validSecondary = presetSecondaryId && presetSecondaryId !== state.activeTabId &&
            state.activeMessengers.some(m => m.id === presetSecondaryId)
        if (validSecondary) {
            switchSplitTab(presetSecondaryId)
        } else {
            showPicker()
        }
        return true
    }

    // DOM-часть выхода из ТЕКУЩЕЙ раскладки — без сброса state.splitMode и
    // связанных полей. Общая для exitSplitMode (выход насовсем) и
    // switchSplitLayout (переключение на другую раскладку без полного
    // сброса, см. ниже) — та же очистка нужна в обоих случаях.
    function _cleanupCurrentLayoutDom () {
        if (state.splitLayout === '2col') {
            if (state.splitTabId) {
                const wv = document.getElementById(`webview-${state.splitTabId}`)
                wv?.classList.remove('split-secondary')
            }
            _clearWebviewInlineStyles()
            hidePicker()
        } else {
            _clearGridWebviewStyles()
            hideZonePicker()
            if (splitZones) {
                splitZones.innerHTML = ''
                splitZones.style.display = 'none'
            }
        }
    }

    // Список messenger id, реально занятых зон/панелей ТЕКУЩЕЙ раскладки —
    // используется, чтобы перенести назначения при переключении раскладки
    // (switchSplitLayout) или при сохранении текущей раскладки как пресета.
    function _currentAssignedIds () {
        if (!state.splitMode) return state.activeTabId ? [state.activeTabId] : []
        if (state.splitLayout === '2col') {
            return [state.activeTabId, state.splitTabId].filter(Boolean)
        }
        return state.splitZoneIds.filter(Boolean)
    }

    function exitSplitMode () {
        _cleanupCurrentLayoutDom()

        // Restore the sidebar/tab highlight to the primary pane in case focus
        // was left on the secondary one — see _syncActiveIndicatorFor2col.
        if (state.splitLayout === '2col' && state.splitFocus === 'right') {
            _syncActiveIndicatorFor2col('left')
        }

        state.splitMode       = false
        state.splitPresetId   = null
        _resetPctsToPrefs()
        state.splitTabId      = null
        state.splitFocus      = 'left'
        state.splitLayout     = '2col'
        state.splitZoneIds    = []
        state.splitZoneFocus  = 0

        contentArea.classList.remove('split-active', 'split-grid')
        delete contentArea.dataset.splitFocus
        splitBtn?.classList.remove('split-active')

        if (splitHandle) splitHandle.style.display = 'none'
        if (gridRowHandle)  gridRowHandle.style.display  = 'none'
        if (gridSideHandle) gridSideHandle.style.display = 'none'
        if (gridSide2Handle) gridSide2Handle.style.display = 'none'
        hideLayoutPicker()

        // Сбрасываем сохранённое состояние
        store?.delete?.('split.saved')
        renderPinnedPresets()
    }

    // Переключить раскладку БЕЗ полного выхода из сплит-режима — переносит
    // текущие назначения мессенджеров по зонам в новую раскладку (best
    // effort: зона 0 всегда = текущий активный таб, остальные — по порядку
    // из старых назначений, лишние отбрасываются, недостающие остаются
    // пустыми). Если сплит ещё не активен — просто входит в раскладку
    // (эквивалент enterGridSplitMode/enterSplitMode).
    function switchSplitLayout (layout) {
        state.splitPresetId = null
        const assignedIds = _currentAssignedIds()

        if (state.splitMode) _cleanupCurrentLayoutDom()

        if (layout === '2col') {
            return enterSplitMode(assignedIds.find(id => id !== state.activeTabId))
        }
        return enterGridSplitMode(layout, assignedIds)
    }

    // ── Пресеты сплит-режима ─────────────────────────────────────────────────
    // Сохранённый пресет = { id, name, layout, memberIds } — memberIds[0]
    // становится основным (активным) табом при применении, остальные
    // расставляются по зонам новой раскладки в порядке списка (та же логика
    // переноса, что и в enterGridSplitMode/switchSplitLayout выше).

    function getPresets () {
        return store?.get?.('splitPresets', []) || []
    }

    function saveCurrentAsPreset (name) {
        const trimmed = String(name || '').trim()
        if (!trimmed) return false

        // BUGFIX ("сохранить одно окно в качестве пресета не получается"):
        // this used to hard-require >= 2 members, so a single active tab
        // (the normal, non-split case — memberIds is always exactly
        // [state.activeTabId] then) could never be saved as a preset, even
        // though applyPreset()/renderPresetsList() have no actual dependency
        // on split mode being involved. A 1-member preset is just "switch to
        // this tab" — see the matching single-member branch in applyPreset()
        // below. Only genuinely empty (no active tab at all) is rejected now.
        const memberIds = state.splitMode
            ? _currentAssignedIds()
            : (state.activeTabId ? [state.activeTabId] : [])
        if (memberIds.length < 1) {
            return false
        }

        const presets = getPresets()
        const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const entry = {
            id: newId,
            name: trimmed,
            layout: state.splitMode ? state.splitLayout : '2col',
            memberIds
        }
        if (state.splitMode && memberIds.length >= 2) {
            // The preset remembers how the split looks right now: dividers and the zoom of each pane.
            entry.leftPct = state.splitLeftPct || 50
            entry.rowPct  = state.gridRowPct || 50
            entry.sidePct = state.gridSidePct || 50
            entry.colA    = state.gridColA || DEFAULT_COL_A
            entry.colB    = state.gridColB || DEFAULT_COL_B
            const zooms = {}
            memberIds.forEach(id => {
                const z = state.activeMessengers.find(m => m.id === id)?.zoomLevel
                if (typeof z === 'number' && z !== 1) zooms[id] = z
            })
            entry.zooms = zooms
        }
        presets.push(entry)
        store?.set?.('splitPresets', presets)
        _pushSplitPresetsToCloud()
        // The split that is open right now IS the saved one: from this moment it is locked like any opened preset.
        if (state.splitMode && memberIds.length >= 2) {
            state.splitPresetId = newId
            _persistPresetLock()
        }
        renderPresetsList()
        return true
    }

    function deletePreset (id) {
        const presets = getPresets().filter(p => p.id !== id)
        store?.set?.('splitPresets', presets)
        _pushSplitPresetsToCloud()
        renderPresetsList()
    }

    // Переименовать существующий пресет — тот же паттерн персистентности,
    // что и deletePreset (store.set + push в облако + перерисовка списка).
    function renamePreset (id, newName) {
        const trimmed = String(newName || '').trim()
        if (!trimmed) return false
        const presets = getPresets()
        const preset = presets.find(p => p.id === id)
        if (!preset) return false
        preset.name = trimmed
        store?.set?.('splitPresets', presets)
        _pushSplitPresetsToCloud()
        renderPresetsList()
        return true
    }

    function _pushSplitPresetsToCloud () {
        if (typeof isCloudLoggedIn === 'function' && isCloudLoggedIn() && typeof cloudSyncPush === 'function') {
            cloudSyncPush()
        }
    }

    // Применяет пресет одним кликом: переключается на его основной таб
    // (если такой мессенджер всё ещё существует), затем входит в нужную
    // раскладку с перенесёнными назначениями — работает и когда сплит уже
    // активен (перестраивает в новую раскладку), и когда он выключен.
    function applyPreset (id) {
        const preset = getPresets().find(p => p.id === id)
        if (!preset) return false
        state.splitPresetId = null

        const existingIds = preset.memberIds.filter(mid => state.activeMessengers.some(m => m.id === mid))
        if (existingIds.length === 0) return false

        const primaryId = existingIds[0]

        // BUGFIX ("сохранить одно окно в качестве пресета не получается"):
        // single-member preset — e.g. saved while not in split mode, or a
        // split preset whose other messenger(s) got removed since. There's
        // no second pane/zone to fill, so just leave split mode (if active)
        // and switch straight to this one tab — the whole point of the
        // "один клик в почту и обратно" request. Falls through to the
        // >=2-member split-layout logic below otherwise, unchanged.
        if (existingIds.length === 1) {
            if (state.splitMode) exitSplitMode()
            if (primaryId !== state.activeTabId && typeof switchTab === 'function') {
                switchTab(primaryId)
            }
            return true
        }

        // BUGFIX ("пресет не восстанавливается при нажатии"): the presets
        // panel is normally opened WHILE already inside a split layout —
        // that's the whole point of switching presets. The global switchTab()
        // in renderer.js special-cases state.splitMode to route clicks into
        // whichever pane/zone currently has focus (splitApi.switchSplitTab /
        // switchGridZone) instead of ever touching state.activeTabId. So
        // calling switchTab(primaryId) here while still in split mode silently
        // assigned the preset's primary messenger to the focused SECONDARY
        // pane/zone (or did nothing if it was already assigned elsewhere) —
        // state.activeTabId never changed, and enterSplitMode/
        // enterGridSplitMode below then read the wrong (old) primary from it.
        // Clean up the current layout's DOM first, then temporarily drop
        // splitMode so switchTab falls through to its normal "make this the
        // active tab" path, exactly like it would outside of a split.
        if (state.splitMode) _cleanupCurrentLayoutDom()

        // BUGFIX ("всё равно перекрывает окно сплита" — overlap still
        // happens even after the switchTab() ordering fix for bug #6): that
        // fix relies on onPrimaryChanged() running BEFORE the webview gets
        // its 'active' class inside switchTab(). But onPrimaryChanged() bails
        // out immediately with `if (!state.splitMode) return` — and right
        // below, splitMode is deliberately forced to false for the
        // switchTab(primaryId) call (see comment above), specifically so
        // switchTab() takes its normal non-split branch. That means
        // onPrimaryChanged() is a complete no-op here, and switchTab() shows
        // the primary webview at the *default* full-size CSS (100%/100%,
        // inset:0) — exactly the wrong-size-first-paint bug #6 was fixed for,
        // just reached through a different door. enterSplitMode()/
        // enterGridSplitMode() below do reapply the *correct* target rect a
        // moment later, but by then the webview's compositor layer has
        // already latched onto the wrong (full-size) geometry from its first
        // paint, same quirk documented in switchTab()'s BUGFIX comment.
        // Fix: pre-apply the preset's target rect for the primary webview
        // directly, BEFORE switchTab() can ever show it — so there is no
        // wrong size to ever get latched in. enterSplitMode()/
        // enterGridSplitMode() then just reapply the same numbers (no-op).
        _loadPresetDividers(preset)
        const primaryWvEl = document.getElementById(`webview-${primaryId}`)
        if (primaryWvEl) {
            if (preset.layout === '2col') {
                const pct = state.splitLeftPct || 50
                primaryWvEl.style.left   = '0'
                primaryWvEl.style.right  = `calc(100% - ${pct}%)`
                primaryWvEl.style.width  = 'auto'
                primaryWvEl.style.top    = ''
                primaryWvEl.style.height = ''
                primaryWvEl.style.bottom = ''
            } else {
                const zones = getGridLayout(preset.layout)
                const rect  = zones && zones[0]
                if (rect) {
                    primaryWvEl.style.left   = rect.left + '%'
                    primaryWvEl.style.top    = rect.top + '%'
                    primaryWvEl.style.width  = rect.width + '%'
                    primaryWvEl.style.height = rect.height + '%'
                    primaryWvEl.style.right  = 'auto'
                    primaryWvEl.style.bottom = 'auto'
                }
            }
        }

        const wasSplitMode = state.splitMode
        state.splitMode = false
        if (primaryId !== state.activeTabId && typeof switchTab === 'function') {
            switchTab(primaryId)
        }
        state.splitMode = wasSplitMode

        const opened = preset.layout === '2col'
            ? enterSplitMode(existingIds[1])
            : enterGridSplitMode(preset.layout, existingIds)
        if (opened) {
            if (preset.layout === '2col') setSplitFocus('left') // a preset opens with the focus on its first pane
            state.splitPresetId = preset.id
            _persistPresetLock()
            hideLayoutPicker()
            renderPinnedPresets()
            _applyPresetZooms(preset)
        }
        return opened
    }

    // Is this messenger shown by the open preset? Used by renderer.js's switchTab.
    function isPresetMember (messengerId) {
        return _isLocked() && getVisibleMessengerIds(state).includes(messengerId)
    }

    // A click on a messenger that is already in the preset only moves the focus to its pane.
    function focusPresetMember (messengerId) {
        if (state.splitLayout === '2col') {
            setSplitFocus(messengerId === state.activeTabId ? 'left' : 'right')
        } else {
            const zone = messengerId === state.activeTabId ? 0 : state.splitZoneIds.indexOf(messengerId)
            if (zone >= 0) setGridZoneFocus(zone)
        }
        document.getElementById(`webview-${messengerId}`)?.focus?.()
    }

    const _esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

    // ── Закрепление пресета в верхней панели ────────────────────────────────
    function togglePinPreset (id) {
        const presets = getPresets()
        const preset = presets.find(p => p.id === id)
        if (!preset) return
        preset.pinned = !preset.pinned
        store?.set?.('splitPresets', presets)
        _pushSplitPresetsToCloud()
        renderPresetsList()
    }

    function renderPinnedPresets () {
        const host = document.getElementById('pinnedPresets')
        if (!host) return
        const all = getPresets()
        const pinned = all.map((p, idx) => ({ p, num: idx + 1 })).filter(x => x.p.pinned)
        // visible together with the split button itself (it is hidden when split screens are not available)
        const splitAvailable = !splitBtn || splitBtn.style.display !== 'none'
        host.style.display = pinned.length && splitAvailable ? 'inline-flex' : 'none'
        host.innerHTML = pinned.map(({ p, num }) => {
            const active = state.splitMode && state.splitPresetId === p.id
            return `<button type="button" class="pinned-preset-btn${active ? ' active' : ''}" data-id="${_esc(p.id)}" title="${_esc(p.name)}"><span class="pinned-preset-num">${num}</span></button>`
        }).join('')
        host.querySelectorAll('.pinned-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (state.splitMode && state.splitPresetId === btn.dataset.id) { exitSplitMode(); return }
                applyPreset(btn.dataset.id)
            })
        })
    }

    function renderPresetsList () {
        const listEl  = document.querySelector('.split-presets-list')
        const titleEl = document.querySelector('.split-presets-title')
        if (!listEl) return

        const presets = getPresets()
        titleEl && (titleEl.style.display = presets.length ? '' : 'none')

        listEl.innerHTML = presets.map((p, idx) => `
            <div class="split-preset-row${p.pinned ? ' pinned' : ''}" data-id="${p.id}" title="Применить пресет «${p.name.replace(/"/g, '&quot;')}»">
                <span class="split-preset-row-num">${idx + 1}</span>
                <span class="split-preset-row-name">${p.name.replace(/</g, '&lt;')}</span>
                <button type="button" class="split-preset-row-pin${p.pinned ? ' on' : ''}" data-pin-id="${p.id}" title="${p.pinned ? 'Открепить из верхней панели' : 'Закрепить в верхней панели'}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="${p.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 17v5"/><path d="M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z"/>
                    </svg>
                </button>
                <button type="button" class="split-preset-row-rename" data-rename-id="${p.id}" title="Переименовать пресет">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                </button>
                <button type="button" class="split-preset-row-delete" data-delete-id="${p.id}" title="Удалить пресет">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `).join('')
        renderPinnedPresets()

        listEl.querySelectorAll('.split-preset-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.split-preset-row-delete')) return
                if (e.target.closest('.split-preset-row-rename')) return
                if (e.target.closest('.split-preset-row-pin')) return
                if (row.classList.contains('renaming')) return
                hideLayoutPicker()
                applyPreset(row.dataset.id)
            })
        })
        listEl.querySelectorAll('.split-preset-row-pin').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                togglePinPreset(btn.dataset.pinId)
            })
        })
        listEl.querySelectorAll('.split-preset-row-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                deletePreset(btn.dataset.deleteId)
            })
        })
        // BUGFIX ("нет возможности переименовать пресет"): window.prompt()
        // is already confirmed dead in this frameless window (see the save-
        // preset comment above) — reuse the same inline-input convention
        // instead of a native dialog.
        listEl.querySelectorAll('.split-preset-row-rename').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const row = btn.closest('.split-preset-row')
                const nameEl = row?.querySelector('.split-preset-row-name')
                if (!row || !nameEl || row.classList.contains('renaming')) return

                const id = row.dataset.id
                const currentName = nameEl.textContent
                row.classList.add('renaming')

                const input = document.createElement('input')
                input.type = 'text'
                input.className = 'split-preset-rename-input'
                input.value = currentName
                nameEl.replaceWith(input)
                input.focus()
                input.select()

                let settled = false
                const commit = () => {
                    if (settled) return
                    settled = true
                    const ok = renamePreset(id, input.value)
                    if (!ok) renderPresetsList() // revert to original name on empty input
                }
                const cancel = () => {
                    if (settled) return
                    settled = true
                    renderPresetsList()
                }

                input.addEventListener('click', (ev) => ev.stopPropagation())
                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); commit() }
                    else if (ev.key === 'Escape') { ev.preventDefault(); cancel() }
                })
                input.addEventListener('blur', commit)
            })
        })
    }

    // BUGFIX ("пресет не сохраняется"): window.prompt() never actually
    // appeared in this app's frameless custom-titlebar window (confirmed —
    // splitPresets never made it into the store no matter how many times
    // the button was clicked), while every other save/rename flow in this
    // codebase uses its own inline UI or modal, never a native dialog.
    // Swapped for a small inline input inside this same popup.
    // the split button appears/disappears by itself: keep the pinned presets in step
    if (splitBtn && typeof MutationObserver === 'function') {
        new MutationObserver(() => renderPinnedPresets()).observe(splitBtn, { attributes: true, attributeFilter: ['style'] })
    }

    const savePresetBtn   = document.querySelector('.split-save-preset-btn')
    const savePresetForm  = document.querySelector('.split-save-preset-form')
    const savePresetInput = document.querySelector('.split-save-preset-input')

    function hideSavePresetForm () {
        if (savePresetForm) savePresetForm.style.display = 'none'
        if (savePresetBtn) savePresetBtn.style.display = ''
        if (savePresetInput) savePresetInput.value = ''
    }

    function confirmSavePreset () {
        const name = savePresetInput?.value?.trim()
        if (!name) return
        // BUGFIX ("сплит сохранил позиции, но не сохранил сохранённые
        // пресеты"): saveCurrentAsPreset() silently returns false when
        // fewer than 2 zones are assigned (e.g. just entered a grid layout
        // without picking messengers for the other zones yet) — this used
        // to close the form regardless, looking like a successful save with
        // zero feedback that nothing was actually written. Show an error
        // and keep the form open so the user can actually fix it.
        const ok = saveCurrentAsPreset(name)
        if (!ok) {
            if (savePresetInput) {
                savePresetInput.placeholder = 'Сначала назначьте мессенджеров по зонам'
                savePresetInput.classList.add('input-error')
                setTimeout(() => savePresetInput.classList.remove('input-error'), 1500)
            }
            return
        }
        hideSavePresetForm()
    }

    savePresetBtn?.addEventListener('click', () => {
        if (savePresetBtn) savePresetBtn.style.display = 'none'
        if (savePresetForm) savePresetForm.style.display = 'flex'
        savePresetInput?.focus()
    })

    document.querySelector('.split-save-preset-confirm')?.addEventListener('click', confirmSavePreset)
    document.querySelector('.split-save-preset-cancel')?.addEventListener('click', hideSavePresetForm)
    savePresetInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') confirmSavePreset()
        if (e.key === 'Escape') hideSavePresetForm()
    })

    document.addEventListener('close-all-popups', hideSavePresetForm)

    renderPresetsList()

    // ── Switch secondary tab ──────────────────────────────────────────────────

    function switchSplitTab (id) {
        if (id === state.activeTabId) return

        if (state.splitTabId) {
            const prev = document.getElementById(`webview-${state.splitTabId}`)
            if (prev) {
                prev.classList.remove('split-secondary')
                prev.style.left = prev.style.right = prev.style.width = ''
            }
        }

        state.splitTabId = id
        const wv = document.getElementById(`webview-${id}`)
        if (wv) {
            wv.classList.add('split-secondary')
            const pct = state.splitLeftPct || 50
            wv.style.left  = pct + '%'
            wv.style.right = '0'
            wv.style.width = 'auto'
        }

        hidePicker()
        setSplitFocus('right')

        // Сохраняем состояние в store
        store?.set?.('split.saved', { splitTabId: id, splitLeftPct: state.splitLeftPct || 50, presetId: state.splitPresetId || null })
    }

    // ── Callbacks from renderer.js ────────────────────────────────────────────

    function onPrimaryChanged (newPrimaryId) {
        if (!state.splitMode) return

        if (state.splitLayout !== '2col') {
            const oldPrimaryId = state.splitZoneIds[0]
            if (oldPrimaryId && oldPrimaryId !== newPrimaryId) _clearGridZoneWebview(oldPrimaryId)

            // Если новый primary уже занимал другую зону — освобождаем её
            state.splitZoneIds.forEach((zid, i) => {
                if (i !== 0 && zid === newPrimaryId) state.splitZoneIds[i] = null
            })

            state.splitZoneIds[0] = newPrimaryId
            _applyGridZoneWebview(0, newPrimaryId)
            renderGridZones()
            return
        }

        if (state.splitTabId === newPrimaryId) {
            const wv = document.getElementById(`webview-${state.splitTabId}`)
            if (wv) {
                wv.classList.remove('split-secondary')
                wv.style.left = wv.style.right = wv.style.width = ''
            }
            state.splitTabId = null
            showPicker()
        }
        _applyWebviewInlineStyles(state.splitLeftPct || 50)
        if (splitPicker?.style.display !== 'none') showPicker()
    }

    function onMessengerRemoved (id) {
        if (!state.splitMode) return

        if (state.splitLayout !== '2col') {
            let changed = false
            state.splitZoneIds.forEach((zid, i) => {
                if (zid === id) {
                    state.splitZoneIds[i] = null
                    changed = true
                }
            })
            if (changed) renderGridZones()
            return
        }

        if (state.splitTabId === id) {
            state.splitTabId = null
            if (state.activeMessengers.length >= 2) showPicker()
            else exitSplitMode()
        }
    }

    // ── Drag resize ───────────────────────────────────────────────────────────

    let _dragging = false

    splitHandle?.addEventListener('mousedown', e => {
        _dragging = true
        splitHandle.classList.add('dragging')
        document.body.style.cursor     = 'col-resize'
        document.body.style.userSelect = 'none'
        // Block webview pointer events during drag
        _disableWebviewPointerEvents()
        e.preventDefault()
        e.stopPropagation()
    })

    document.addEventListener('mousemove', e => {
        if (!_dragging) return
        const rect = contentArea.getBoundingClientRect()
        let pct = ((e.clientX - rect.left) / rect.width) * 100
        pct = Math.max(15, Math.min(85, pct))
        applyLeft(pct)
    })

    document.addEventListener('mouseup', () => {
        if (!_dragging) return
        _dragging = false
        splitHandle?.classList.remove('dragging')
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
        // Restore pointer events (unless picker is still open)
        if (splitPicker?.style.display === 'none') {
            _restoreWebviewPointerEvents()
        }
        // Обновляем сохранённый pct после перетаскивания
        if (state.splitMode && state.splitTabId) {
            store?.set?.('split.saved', { splitTabId: state.splitTabId, splitLeftPct: state.splitLeftPct || 50, presetId: state.splitPresetId || null })
        }
        // BUGFIX ("позиция разделителя не запоминается при выходе и входе"):
        // 'split.saved' (above) — только для восстановления АКТИВНОЙ сессии
        // сплита при перезапуске приложения, и explicitly стирается при
        // обычном выходе из сплита (exitSplitMode). Пользовательское
        // ПРЕДПОЧТЕНИЕ позиции разделителя — отдельная, более долгоживущая
        // настройка: сохраняем её всегда, независимо от того, выходят потом
        // из сплита или нет, и подхватываем как дефолт при следующем входе
        // (см. чтение ниже, сразу после объявления createSplitApi).
        if (!_savePresetDividers()) store?.set?.('splitLeftPctPref', state.splitLeftPct || 50)
    })

    // Double click on the divider puts it back in the middle.
    splitHandle?.addEventListener('dblclick', e => {
        e.preventDefault()
        e.stopPropagation()
        applyLeft(50)
        if (state.splitMode && state.splitTabId) {
            store?.set?.('split.saved', { splitTabId: state.splitTabId, splitLeftPct: 50, presetId: state.splitPresetId || null })
        }
        if (!_savePresetDividers()) store?.set?.('splitLeftPctPref', 50)
    })

    // ── Grid drag resize (2top1bottom / 1top2bottom row+side dividers) ─────────
    // Same drag/pointer-events pattern as splitHandle above, applied to the
    // two dynamic dividers wired up in _positionGridHandles().

    let _gridRowDragging   = false
    let _gridSideDragging  = false
    let _gridSide2Dragging = false

    const _clampPct = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

    function _startGridDrag (handle, cursor, flag) {
        handle?.addEventListener('mousedown', e => {
            if (flag === 'row') _gridRowDragging = true
            else if (flag === 'side') _gridSideDragging = true
            else _gridSide2Dragging = true
            handle.classList.add('dragging')
            document.body.style.cursor     = cursor
            document.body.style.userSelect = 'none'
            _disableWebviewPointerEvents()
            e.preventDefault()
            e.stopPropagation()
        })
    }
    _startGridDrag(gridRowHandle,   'row-resize', 'row')
    _startGridDrag(gridSideHandle,  'col-resize', 'side')
    _startGridDrag(gridSide2Handle, 'col-resize', 'side2')

    // Remember where the dividers are: in the open saved split, or as the default for manual splits.
    function _persistGridDividers () {
        if (_savePresetDividers()) return
        store?.set?.('gridRowPctPref',  state.gridRowPct  || 50)
        store?.set?.('gridSidePctPref', state.gridSidePct || 50)
        store?.set?.('gridColAPref',    state.gridColA    || DEFAULT_COL_A)
        store?.set?.('gridColBPref',    state.gridColB    || DEFAULT_COL_B)
    }

    document.addEventListener('mousemove', e => {
        if (_gridRowDragging) {
            const rect = contentArea.getBoundingClientRect()
            const dividerPct = _clampPct(((e.clientY - rect.top) / rect.height) * 100, 15, 85)
            // См. _positionGridHandles(): для '1top2bottom' rowPct хранит высоту НИЖНЕГО ряда, поэтому
            // позицию границы конвертируем обратно в rowPct обратной формулой; у '2top1bottom' и '2x2' это высота верхнего.
            state.gridRowPct = state.splitLayout === '1top2bottom' ? (100 - dividerPct) : dividerPct
            _reapplyGridLayout()
        }
        if (_gridSideDragging) {
            const rect = contentArea.getBoundingClientRect()
            const pct = ((e.clientX - rect.left) / rect.width) * 100
            if (hasColumnDividers(state.splitLayout)) state.gridColA = _clampPct(pct, 15, (state.gridColB || DEFAULT_COL_B) - MIN_COL_GAP)
            else state.gridSidePct = _clampPct(pct, 15, 85)
            _reapplyGridLayout()
        }
        if (_gridSide2Dragging) {
            const rect = contentArea.getBoundingClientRect()
            const pct = ((e.clientX - rect.left) / rect.width) * 100
            state.gridColB = _clampPct(pct, (state.gridColA || DEFAULT_COL_A) + MIN_COL_GAP, 85)
            _reapplyGridLayout()
        }
    })

    document.addEventListener('mouseup', () => {
        const wasRow = _gridRowDragging, wasSide = _gridSideDragging, wasSide2 = _gridSide2Dragging
        if (!wasRow && !wasSide && !wasSide2) return
        _gridRowDragging = _gridSideDragging = _gridSide2Dragging = false
        ;[gridRowHandle, gridSideHandle, gridSide2Handle].forEach(h => h?.classList.remove('dragging'))
        document.body.style.cursor     = ''
        document.body.style.userSelect = ''
        _restoreWebviewPointerEvents()
        _persistGridDividers()
    })

    // Double click on a divider puts that divider back to its default place.
    function _resetGridDivider (which) {
        if (which === 'row') state.gridRowPct = 50
        else if (hasColumnDividers(state.splitLayout)) {
            // Either column border puts both back to the layout's own default: moving just one could be blocked by its neighbour.
            ;[state.gridColA, state.gridColB] = defaultColumns(state.splitLayout)
        } else state.gridSidePct = 50
        _reapplyGridLayout()
        _persistGridDividers()
    }
    ;[[gridRowHandle, 'row'], [gridSideHandle, 'side'], [gridSide2Handle, 'side2']].forEach(([handle, which]) => {
        handle?.addEventListener('dblclick', e => {
            e.preventDefault()
            e.stopPropagation()
            _resetGridDivider(which)
        })
    })

    // ── Button wiring ─────────────────────────────────────────────────────────

    // BUGFIX ("второе нажатие на сплит — закрытие окна, как везде"): clarified
    // by the user — "окно" here means the layout-picker POPUP, not split mode
    // itself. Earlier attempt wired a second click to exitSplitMode(), which
    // was wrong (accidentally exits split mode instead of just dismissing the
    // picker) and has been reverted. Correct behavior, matching every other
    // toggle-style button in this app (downloadsBtn, notif bell, etc.): a
    // click toggles the picker popup itself — open it if hidden, close it if
    // already shown — regardless of whether split mode is currently active.
    // This also naturally keeps in-place layout reconfiguration working
    // (clicking splitBtn while split mode is on reopens the picker with the
    // current layout highlighted, same as before), so no separate
    // right-click affordance is needed.
    splitBtn?.addEventListener('click', () => {
        const isOpen = splitLayoutPicker && splitLayoutPicker.style.display !== 'none'
        if (isOpen) {
            hideLayoutPicker()
        } else {
            showLayoutPicker()
        }
    })

    splitCloseBtn?.addEventListener('click', () => exitSplitMode())
    splitExitBtn?.addEventListener('click', () => { hideLayoutPicker(); exitSplitMode() })

    // ── Focus tracking ────────────────────────────────────────────────────────

    function onWebviewFocus (webview) {
        if (!state.splitMode) return

        if (state.splitLayout !== '2col') {
            const messengerId = webview.id.replace('webview-', '')
            // Зона 0 (основная вкладка) никогда не попадает в splitZoneIds
            // (см. renderGridZones()/switchGridZone() — тот массив только
            // для вторичных зон), поэтому indexOf на неё всегда вернёт -1.
            // Проверяем activeTabId отдельно, иначе клик обратно в основную
            // зону никогда не вызывал бы setGridZoneFocus(0) и подсветка
            // сайдбара не обновлялась бы для этого случая тоже.
            const zoneIndex = messengerId === state.activeTabId ? 0 : state.splitZoneIds.indexOf(messengerId)
            if (zoneIndex !== -1) setGridZoneFocus(zoneIndex)
            return
        }

        setSplitFocus(webview.classList.contains('split-secondary') ? 'right' : 'left')
    }

    return {
        enterSplitMode,
        enterGridSplitMode,
        exitSplitMode,
        switchSplitLayout,
        switchSplitTab,
        switchGridZone,
        setSplitFocus,
        setGridZoneFocus,
        showPicker,
        showLayoutPicker,
        onPrimaryChanged,
        onMessengerRemoved,
        onWebviewFocus,
        getPresets,
        getPresetZoom,
        setPresetZoom,
        restorePresetLook,
        isPresetMember,
        focusPresetMember,
        togglePinPreset,
        renderPinnedPresets,
        saveCurrentAsPreset,
        applyPreset,
        deletePreset
    }
}

module.exports = { createSplitApi }
