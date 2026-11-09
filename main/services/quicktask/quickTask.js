// Quick-task window page: one input, a live preview of the date and priority found in the text, Enter adds, Esc closes.
'use strict'
;(function () {
    const api = window.quickTask
    const input = document.getElementById('text')
    const ring = document.getElementById('ring')
    const dateChip = document.getElementById('date')
    const prioChip = document.getElementById('prio')
    const hint = document.getElementById('hint')
    const meta = document.getElementById('meta')
    const theme = new URLSearchParams(location.search).get('theme')
    if (theme === 'light') document.documentElement.dataset.theme = 'light'

    const CAL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
    let strings = { quick: {}, cal: {} }
    let busy = false
    let pro = true
    let seq = 0

    function setDate(label) {
        dateChip.classList.toggle('is-muted', !label)
        dateChip.innerHTML = CAL_ICON
        dateChip.appendChild(document.createTextNode(label || strings.quick.noDate || 'Без даты'))
    }

    async function preview() {
        const my = ++seq
        const text = input.value
        if (!text.trim()) { setDate(''); prioChip.hidden = true; ring.className = 'ring'; return }
        const d = await api.describe(text)
        if (my !== seq || !d) return
        setDate(d.dateLabel)
        prioChip.hidden = !d.priorityLabel
        prioChip.textContent = d.priorityLabel || ''
        ring.className = 'ring' + (d.priority && d.priority !== 'none' ? ` prio-${d.priority}` : '')
    }

    function reset() {
        busy = false
        input.value = ''
        input.disabled = false
        ring.className = 'ring'
        meta.querySelectorAll('.done').forEach(n => n.remove())
        dateChip.hidden = false
        hint.hidden = false
        hint.classList.remove('is-error')
        hint.textContent = strings.quick.hint || ''
        setDate('')
        prioChip.hidden = true
    }

    api.onShown((s) => {
        strings = s || strings
        pro = !strings || strings.pro !== false
        document.documentElement.lang = strings.lang || 'ru'
        reset()
        input.placeholder = pro ? (strings.quick.placeholder || '') : (strings.quick.proTitle || '')
        hint.textContent = pro ? (strings.quick.hint || '') : (strings.quick.proHint || '')
        document.body.classList.toggle('is-locked', !pro)
        if (!pro) { setDate(''); dateChip.hidden = true; prioChip.hidden = false; prioChip.textContent = strings.quick.proText || '' }
        input.readOnly = !pro
        input.focus()
    })

    input.addEventListener('input', () => { if (pro) preview() })
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Escape') { e.preventDefault(); api.close(); return }
        if (e.key !== 'Enter' || busy) return
        e.preventDefault()
        if (!pro) { api.upgrade(); return }
        if (!input.value.trim()) return
        busy = true
        const res = await api.submit(input.value)
        if (!res || !res.ok) {
            // the text stays, so nothing typed is lost; the person can press Enter again
            busy = false
            hint.textContent = strings.quick.failed || 'Не получилось добавить. Нажмите Enter ещё раз.'
            hint.classList.add('is-error')
            return
        }
        // a short "added" beat, then away — the person goes straight back to what they were doing
        input.disabled = true
        ring.className = 'ring is-ok'
        dateChip.hidden = true
        prioChip.hidden = true
        hint.hidden = true
        const done = document.createElement('span')
        done.className = 'done'
        done.textContent = (strings.quick.added || 'Задача добавлена') + (res.dateLabel ? ` · ${res.dateLabel}` : '')
        meta.prepend(done)
        setTimeout(() => api.close(), 650)
    })
})()
