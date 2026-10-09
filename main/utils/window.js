function isWindowAlive(win) {
    return !!win && !win.isDestroyed()
}

function withWindow(getWindow, callback) {
    const win = typeof getWindow === 'function' ? getWindow() : getWindow
    if (!isWindowAlive(win)) return null
    return callback(win)
}

function safeSendToWindow(getWindow, channel, payload) {
    return withWindow(getWindow, (win) => {
        win.webContents.send(channel, payload)
        return true
    }) || false
}

// Bring a window in front of other applications and give it the keyboard, also when it is minimized, hidden in the
// tray or covered by another program. Windows does not let a background process take the foreground, so a plain
// focus() only makes the taskbar button flash. Steps: restore/show, a brief "always on top", and, if the window is
// still not in front after a moment, the classic Alt-tap + SetForegroundWindow through PowerShell.
const RAISE_TOPMOST_MS = 200
const RAISE_VERIFY_MS = 400

function forceForegroundWindows(win) {
    try {
        const handle = win.getNativeWindowHandle()
        const hwnd = handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0))
        const script = [
            "$sig = '[DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport(\"user32.dll\")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra); [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int cmd);'",
            'Add-Type -MemberDefinition $sig -Name W -Namespace Centrio',
            '$h = [IntPtr]' + hwnd,
            '[Centrio.W]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)',
            '[Centrio.W]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)',
            '[Centrio.W]::ShowWindow($h, 9) | Out-Null',
            '[Centrio.W]::SetForegroundWindow($h) | Out-Null'
        ].join('; ')
        require('child_process').execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script], { windowsHide: true, timeout: 8000 }, () => {})
    } catch {
        // nothing more can be done: the taskbar button still flashes
    }
}

function raiseWindow(win) {
    if (!isWindowAlive(win)) return false
    if (win.isMinimized()) win.restore()
    if (!win.isVisible()) win.show()
    win.show()
    if (process.platform === 'win32') {
        win.setAlwaysOnTop(true)
        win.moveTop()
        win.focus()
        setTimeout(() => { if (isWindowAlive(win)) win.setAlwaysOnTop(false) }, RAISE_TOPMOST_MS)
        // Electron's own isFocused() is not reliable here (it can say "focused" for a window another app covers),
        // so the foreground is always forced.
        setTimeout(() => { if (isWindowAlive(win)) forceForegroundWindows(win) }, RAISE_VERIFY_MS)
    } else {
        win.moveTop()
        win.focus()
    }
    return true
}

function focusWindow(getWindow) {
    return withWindow(getWindow, (win) => {
        if (win.isMinimized()) win.restore()
        if (!win.isVisible()) win.show()
        win.focus()
        return true
    }) || false
}

module.exports = {
    isWindowAlive,
    raiseWindow,
    withWindow,
    safeSendToWindow,
    focusWindow
}