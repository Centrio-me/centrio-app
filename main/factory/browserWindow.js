const path = require('path')
const { BrowserWindow } = require('electron')
const store = require('../services/store')
const { PATHS } = require('../config/constants')

function getSavedBounds() {
    return {
        width: store.get('window.width', 1440),
        height: store.get('window.height', 960)
    }
}

function createMainBrowserWindow() {
    const bounds = getSavedBounds()
    const isMac = process.platform === 'darwin'

    const win = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        minWidth: 1100,
        minHeight: 720,
        show: false,
        backgroundColor: '#111827',
        autoHideMenuBar: true,
        title: 'Centrio',
        icon: PATHS.ICON,
        // На macOS используем hiddenInset — traffic lights остаются,
        // но titlebar прозрачный. На Win/Linux — полностью кастомный frame.
        frame: isMac,
        titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
        titlebarAppearsTransparent: isMac,
        trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
        webPreferences: {
            preload: path.resolve(__dirname, '..', '..', 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webviewTag: true,
            spellcheck: false,
            // BUGFIX (2026-08-25, "app freezes permanently after an OAuth
            // popup closes" — six prior attempts before this one, see BUGFIX
            // comments in main/ipc/window.js and main/window.js, all
            // live-retested and confirmed NOT to fix it): none of those
            // touched this window's own webPreferences. Live diagnosis
            // (dual CDP: main-process Node inspector + mainWin's own
            // renderer target) proved the freeze is mainWin's renderer main
            // thread genuinely blocked in native code — Debugger.pause never
            // fires — isolated to ONLY that one renderer (every <webview>
            // guest process and the main process itself stay fully
            // responsive throughout), and a follow-up native BrowserWindow
            // query from the main process (while frozen) returned
            // `isPainting: false` for mainWin without hanging, confirming
            // its compositor has stopped presenting frames while its own
            // renderer thread is wedged.
            //
            // `backgroundThrottling` defaults to true in Electron: Blink
            // throttles/suspends a renderer's rAF and timer scheduling when
            // the page is treated as backgrounded/occluded, and resumes it
            // on a visibility-change signal from the browser process. This
            // is a documented Windows-specific Electron/Chromium failure
            // class — the resume signal can race with a rapid
            // focus-out/focus-in transition and never arrive, permanently
            // parking the renderer's main thread mid-suspend waiting on a
            // scheduler/compositor handshake that will now never complete.
            // That exactly matches this bug's trigger moment: Windows hands
            // OS focus back to mainWin (an owner window, `parent: mainWin`
            // on the popup) the instant the OAuth popup is destroyed — the
            // single most focus-transition-heavy moment in this app's
            // lifecycle, and the one thing common to every single repro
            // across all 6 attempts. Disabling background throttling for
            // this top-level window removes that suspend/resume handshake
            // entirely, so there's nothing left to race.
            //
            // UPDATE (2026-08-26): live-retested on its own (this flag alone,
            // ANGLE D3D11 still forced in main.js at the time) — the freeze
            // still reproduced. So this was NOT the actual root cause; the
            // real fix was removing the `use-angle d3d11` command-line
            // switch in main.js (see the BUGFIX comment there for the full
            // live-verified diagnosis: 8/8 popup open/close cycles clean with
            // that flag removed, against real messenger webviews). Left
            // enabled here anyway as a harmless belt-and-suspenders — the
            // suspend/resume race this describes is a real, separately
            // documented Electron/Windows failure class, just not the one
            // that was actually firing in this bug.
            backgroundThrottling: false
        }
    })

    // Сохраняем размер с дебаунсом: resize стреляет десятки раз в секунду при
    // перетаскивании — синхронная запись в стор на каждый кадр давала просадки и
    // лишний дисковый I/O. Пишем только через 300мс после остановки.
    let resizeSaveTimer = null
    win.on('resize', () => {
        if (resizeSaveTimer) clearTimeout(resizeSaveTimer)
        resizeSaveTimer = setTimeout(() => {
            try {
                const [width, height] = win.getSize()
                store.set('window.width', width)
                store.set('window.height', height)
            } catch {}
        }, 300)
    })

    win.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' }
    })

    return win
}

module.exports = {
    createMainBrowserWindow
}