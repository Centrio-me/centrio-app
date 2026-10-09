// Clicking a push opens the exact chat. The page-side patch (NOTIF_PATCH_SCRIPT in
// main/bootstrap/registerAppEvents.js) keeps every notification the site created under a short id; this asks the
// page to "click" that notification, which is what the site itself does to open the right conversation. If the
// notification object is gone (page reloaded, sleeping tab, service-worker push) the optional fallback runs.
const ID_RE = /^n\d{1,9}$/
const OPEN_DELAY_MS = 150
const RETRY_MS = 400
const MAX_ATTEMPTS = 6

function openNotifiedChat(messengerId, nid, onMiss) {
    const miss = () => { if (typeof onMiss === 'function') onMiss() }
    if (!messengerId || !ID_RE.test(String(nid || ''))) { miss(); return }
    const attempt = (n) => {
        const webview = document.getElementById(`webview-${messengerId}`)
        if (!webview || typeof webview.executeJavaScript !== 'function') {
            if (n < MAX_ATTEMPTS) setTimeout(() => attempt(n + 1), RETRY_MS); else miss()
            return
        }
        let call
        try {
            call = webview.executeJavaScript(`window.__centrioOpenNotif ? window.__centrioOpenNotif(${JSON.stringify(String(nid))}) : false`)
        } catch (e) {
            // the page is not ready yet (the tab was just woken up)
            if (n < MAX_ATTEMPTS) setTimeout(() => attempt(n + 1), RETRY_MS); else miss()
            return
        }
        call.then((opened) => { if (!opened) miss() }).catch(() => { if (n < MAX_ATTEMPTS) setTimeout(() => attempt(n + 1), RETRY_MS); else miss() })
    }
    setTimeout(() => attempt(0), OPEN_DELAY_MS)
}

module.exports = { openNotifiedChat }
