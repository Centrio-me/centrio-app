'use strict'
// «Все мессенджеры»: the emoji panel of our message field — groups like in messengers, recently used first.
const { EMOJI_GROUPS } = require('./emoji-data')
const { rememberRecent, RECENT_MAX } = require('./emoji-picker-recent')

const RECENT_KEY = 'centrio-all-inbox-emoji-recent'

function readRecent() {
    try { const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); return Array.isArray(v) ? v.filter((e) => typeof e === 'string').slice(0, RECENT_MAX) : [] } catch { return [] }
}

/**
 * @param {{ onPick: (emoji: string) => void }} deps
 */
function createEmojiPicker({ onPick }) {
    const root = document.createElement('div')
    root.className = 'aie'
    root.hidden = true
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-label', 'Смайлики')
    const tabs = document.createElement('div')
    tabs.className = 'aie-tabs'
    const grid = document.createElement('div')
    grid.className = 'aie-grid'
    root.append(grid, tabs)

    let recent = readRecent()
    let built = false
    const sections = []

    function section(id, name, emojis) {
        const box = document.createElement('section')
        box.className = 'aie-sec'
        box.dataset.id = id
        const h = document.createElement('div')
        h.className = 'aie-h'
        h.textContent = name
        const cells = document.createElement('div')
        cells.className = 'aie-cells'
        for (const e of emojis) {
            const b = document.createElement('button')
            b.type = 'button'
            b.className = 'aie-e'
            b.textContent = e
            cells.append(b)
        }
        box.append(h, cells)
        return box
    }

    function tab(id, icon, name) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'aie-tab'
        b.textContent = icon
        b.title = name
        b.dataset.id = id
        b.addEventListener('click', () => {
            const sec = grid.querySelector(`.aie-sec[data-id="${id}"]`)
            if (sec) grid.scrollTo({ top: sec.offsetTop - grid.offsetTop, behavior: 'smooth' })
        })
        tabs.append(b)
    }

    // built on first open: ~1900 buttons are not worth making for people who never open the panel
    function build() {
        built = true
        const recentSec = section('recent', 'Недавние', recent)
        recentSec.hidden = !recent.length
        grid.append(recentSec)
        tab('recent', '🕘', 'Недавние')
        for (const g of EMOJI_GROUPS) {
            const sec = section(g.id, g.name, g.list.split(' '))
            sections.push(sec)
            grid.append(sec)
            tab(g.id, g.icon, g.name)
        }
    }

    function refreshRecent() {
        const old = grid.querySelector('.aie-sec[data-id="recent"]')
        const fresh = section('recent', 'Недавние', recent)
        fresh.hidden = !recent.length
        old.replaceWith(fresh)
    }

    grid.addEventListener('click', (e) => {
        const b = e.target.closest('.aie-e')
        if (!b) return
        const emoji = b.textContent
        onPick(emoji)
        recent = rememberRecent(recent, emoji)
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)) } catch {}
    })
    // the panel keeps the focus in the message field
    root.addEventListener('mousedown', (e) => e.preventDefault())

    return {
        el: root,
        toggle(force) {
            const open = typeof force === 'boolean' ? force : root.hidden
            if (open && !built) build()
            else if (open) refreshRecent()
            root.hidden = !open
            return open
        },
        isOpen: () => !root.hidden
    }
}

module.exports = { createEmojiPicker }
