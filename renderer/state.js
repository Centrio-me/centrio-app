const state = {
    activeMessengers: [],
    folders: [],
    dividers: [],
    activeTabId: null,
    unreadCounts: {},
    rawUnreadCounts: {},
    mutedMessengers: {},
    globalMuteAll: false,
    contextTargetId: null,
    contextTargetFolderId: null,
    contextTargetDividerId: null,
    editMode: null,
    selectedFolderIcon: 'folder',
    soundTargetId: null,
    activeFolderPanelId: null,
    dragSrcId: null,
    dragSrcType: null,
    modalPage: 0,
    modalFiltered: [],
    menuCollapsed: false,
    appZoomLevel: 0,
    tabZoomLevel: 1.0,
    wvContextParams: {},
    changeIconTargetId: null,
    changeIconNewSrc: null,
    tooltipTimeout: null,
    pinNewVal: '',
    pinConfirmVal: '',
    pinActive: null,
    disableVal: '',
    messengerNotifyState: {},
    webviewWatchBound: new Set(),
    siteNotificationState: {},
    unreadStabilizeTimers: {},
    vpnActive: false, // фактический статус подключения VPN (не путать с per-app предпочтением vpnAppModes)
    // ── Split-screen ──────────────────────────────────────────────────────────
    splitMode:    false,   // is split mode active?
    splitTabId:   null,    // ID of the secondary (right pane) messenger — only used when splitLayout === '2col'
    splitFocus:   'left',  // 'left' | 'right' — which pane receives tab switches (2col layout only)
    splitLeftPct: 50,      // divider position 20–80 % (2col layout only)
    // Сетка-раскладки (3 колонки / 2×2) — независимы от 2col-полей выше,
    // чтобы не трогать уже работающий 2col-код. Зона 0 всегда зеркалит
    // activeTabId, как и в 2col (та же конвенция "первая зона = основная вкладка").
    splitLayout:    '2col', // '2col' | '3col' | '2x2' | '2top1bottom' | '1top2bottom'
    splitZoneIds:   [],     // messenger id по зонам, только для '3col'/'2x2'/'2top1bottom'/'1top2bottom'
    splitZoneFocus: 0,      // индекс зоны, получающей переключение вкладок
    // Двигаемые границы для '2top1bottom'/'1top2bottom' (в %, независимо от
    // splitLeftPct выше — тот только для 2col). gridRowPct — высота ряда с
    // двумя панелями, gridSidePct — ширина первой панели внутри этого ряда.
    gridRowPct:  50,
    gridSidePct: 50
}

module.exports = state