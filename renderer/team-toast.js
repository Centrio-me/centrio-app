// A short line telling the employee what the manager just did (TEAM control, 2026-11-08):
// «Руководитель выключил „WhatsApp“». Disappears by itself; never blocks the app.
const VISIBLE_MS = 6000

// Notices and the manager's note share one column in the lower right corner, so they never overlap.
function teamCornerHost() {
    let host = document.getElementById('teamNoticeHost')
    if (!host) {
        host = document.createElement('div')
        host.id = 'teamNoticeHost'
        host.className = 'team-notice-host'
        host.setAttribute('role', 'status')
        host.setAttribute('aria-live', 'polite')
        document.body.appendChild(host)
    }
    return host
}

function showTeamNotice(text) {
    if (!text) return
    const host = teamCornerHost()
    const item = document.createElement('div')
    item.className = 'team-notice'
    item.textContent = text
    host.appendChild(item)
    setTimeout(() => item.classList.add('team-notice--out'), VISIBLE_MS)
    setTimeout(() => item.remove(), VISIBLE_MS + 300)
}

module.exports = { showTeamNotice, teamCornerHost }
