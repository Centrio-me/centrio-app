'use strict'
// 3.7.4: Яндекс Телемост shows no notification while its page is hidden — it leaves that case to web push
// («Получать уведомления, когда браузер свёрнут»), which an embedded browser cannot subscribe to. So with Centrio
// minimised or in the tray Telemost stayed silent.
//
// A <webview> page learns «hidden» from Electron itself: the guest's document.hidden is a non-configurable property
// fed by an internal message (GUEST_INSTANCE_VISIBILITY_CHANGE) that follows the main window. A page script cannot
// redefine it, so right after Electron says «hidden» we say «visible» to the Telemost page only — the same state it
// is in when Centrio is open on another tab, where it already notifies. Every other messenger keeps the real state.

const CHANNEL = 'GUEST_INSTANCE_VISIBILITY_CHANGE'
const HOST_EVENT = '-window-visibility-change'

/**
 * @param {import('electron').WebContents} contents the <webview> guest
 * @param {(url: string) => boolean} applies which pages stay visible
 * @returns {boolean} whether it is watching
 */
function keepVisible(contents, applies) {
    const host = contents && contents.hostWebContents
    if (!host || typeof contents._sendInternal !== 'function') return false
    const push = () => {
        if (contents.isDestroyed() || !applies(contents.getURL())) return
        try { contents._sendInternal(CHANNEL, 'visible') } catch {}
    }
    // after Electron's own «hidden» reaches the page (same channel, sent first)
    const onVisibility = (state) => { if (state !== 'visible') setImmediate(push) }
    host.on(HOST_EVENT, onVisibility)
    // a page that loads while the window is already hidden (started in the tray) starts as «hidden» too
    contents.on('dom-ready', push)
    contents.once('destroyed', () => { try { host.removeListener(HOST_EVENT, onVisibility) } catch {} })
    return true
}

module.exports = { keepVisible, CHANNEL, HOST_EVENT }
