'use strict'
// A link inside a conversation of «Все мессенджеры» opens in a window of Centrio, the same one the page menu gives
// («Открыть ссылку в окне»), so a video or an article does not throw the person out to the browser (owner, Oleg 2026-11-15).
// Anything that is not a web address (mail, phone) and every failure still goes the old way, through the browser.

const WEB_URL = /^https?:\/\//i

/** Only what the window needs to know about the messenger; nothing else of the record is passed on. */
function recordOf(m) {
    return { id: m.id, name: m.name, icon: m.icon, url: m.url, zoomLevel: m.zoomLevel, forceDarkMode: m.forceDarkMode }
}

/**
 * @param {{ url: string, messenger: object|null, ipcRenderer: { invoke: Function, send: Function } }} deps
 * @returns {Promise<void>}
 */
async function openLink({ url, messenger, ipcRenderer }) {
    const outside = () => ipcRenderer.send('open-url', url)
    if (!messenger || !messenger.id || !WEB_URL.test(String(url || ''))) { outside(); return }
    try {
        const result = await ipcRenderer.invoke('detached:open-link', recordOf(messenger), url)
        if (!result || result.success === false) outside()
    } catch {
        outside()
    }
}

module.exports = { openLink }
