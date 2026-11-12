// Очередь отложенного сохранения заметки. Правки одной заметки копятся в
// общий патч и уходят одним запросом после паузы; правка другой заметки
// сразу отправляет то, что ждало для прежней. Раньше каждая правка
// отменяла предыдущий таймер и отправляла только свой кусок — правка
// заголовка, сделанная за полсекунды до правки текста, терялась.

function createSaveQueue({ delay, send, setTimeout: setT = setTimeout, clearTimeout: clearT = clearTimeout }) {
    let noteId = null
    let patch = null
    let timer = null

    function flush() {
        clearT(timer)
        timer = null
        if (!patch) return false
        const id = noteId
        const out = patch
        noteId = null
        patch = null
        send(id, out)
        return true
    }

    function add(id, change) {
        if (patch && noteId !== id) flush()
        noteId = id
        patch = { ...(patch || {}), ...change }
        clearT(timer)
        timer = setT(flush, delay)
    }

    function pending(id) {
        return patch && noteId === id ? { ...patch } : {}
    }

    return { add, flush, pending }
}

module.exports = { createSaveQueue }
