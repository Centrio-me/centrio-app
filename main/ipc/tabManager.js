// "Диспетчер вкладок": memory and CPU of every messenger tab (2026-10-06).
// The renderer sends the list of its <webview> elements ({ id, wcId }); this side finds the OS process behind each
// one and reads Electron's own per-process counters. Only numbers go back, never page content.
const { ipcMain, app, webContents } = require('electron')

const KB = 1024

function toMb(kilobytes) {
    return Math.round(((Number(kilobytes) || 0) / KB) * 10) / 10
}

function collect(views) {
    const metrics = app.getAppMetrics()
    const byPid = new Map(metrics.map((m) => [m.pid, m]))
    const claimed = new Set()
    const tabs = []
    for (const view of Array.isArray(views) ? views.slice(0, 200) : []) {
        const id = String(view && view.id || '')
        const wc = Number.isInteger(view && view.wcId) ? webContents.fromId(view.wcId) : null
        if (!id || !wc || wc.isDestroyed()) continue
        let pid = 0
        try { pid = wc.getOSProcessId() } catch { pid = 0 }
        const proc = byPid.get(pid)
        if (!proc) continue
        // several tabs of one site can share a renderer process: count its memory once, show it on the first tab
        const shared = claimed.has(pid)
        claimed.add(pid)
        tabs.push({
            id,
            pid,
            shared,
            memoryMb: shared ? 0 : toMb(proc.memory && proc.memory.workingSetSize),
            cpu: shared ? 0 : Math.round((proc.cpu && proc.cpu.percentCPUUsage || 0) * 10) / 10
        })
    }
    let totalKb = 0
    let totalCpu = 0
    let otherKb = 0
    for (const m of metrics) {
        const kb = (m.memory && m.memory.workingSetSize) || 0
        totalKb += kb
        totalCpu += (m.cpu && m.cpu.percentCPUUsage) || 0
        if (!claimed.has(m.pid)) otherKb += kb
    }
    return { success: true, tabs, totalMb: toMb(totalKb), otherMb: toMb(otherKb), cpu: Math.round(totalCpu * 10) / 10 }
}

function registerTabManagerIpc() {
    ipcMain.handle('tabs:metrics', (_event, views) => {
        try { return collect(views) } catch { return { success: false, error: 'FAILED' } }
    })
}

module.exports = registerTabManagerIpc
