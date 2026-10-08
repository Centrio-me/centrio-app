// The order in which the sidebar shows the services, top to bottom, with the contents of folders in their place.
// Ctrl+1..9 and "next/previous messenger" follow it, so "Ctrl+3" is the third service the user sees, not the
// third one that was ever added.
function getVisualMessengerOrder(state) {
    const list = document.getElementById('messengerList')
    const byId = new Map(state.activeMessengers.map((m) => [m.id, m]))
    const seen = new Set()
    const ordered = []
    if (list) {
        list.querySelectorAll('[id^="sidebar-"]').forEach((el) => {
            const id = el.id.slice('sidebar-'.length)
            const messenger = byId.get(id)
            if (messenger && !seen.has(id)) { seen.add(id); ordered.push(messenger) }
        })
    }
    state.activeMessengers.forEach((m) => { if (!seen.has(m.id)) ordered.push(m) })
    return ordered
}

module.exports = { getVisualMessengerOrder }
