// Tips that appear once, at the moment they are useful, and small news about a new achievement.
const { createIcon, createAchievementIcon } = require('./achievement-icons')

const SEEN_KEY = 'hintsSeen'
const HINT_MS = 12000
const BADGE_MS = 8000
const FOLDER_HINT_AT = 4
// More badges than this at once become one card: a long row of popups is noise.
const MAX_SEPARATE_BADGES = 3
const SUMMARY_MS = 20000

function createAppHints({ store, tGet, openAchievements }) {
    function stack() {
        const existing = document.getElementById('appHintStack')
        if (existing) return existing
        const column = document.createElement('div')
        column.id = 'appHintStack'
        column.className = 'app-hint-stack'
        document.body.append(column)
        return column
    }

    // 3.7.3: cards in the style of the rest of the app. An achievement card: a glowing icon, a small accent line
    // ("Новое достижение") and the achievement's own name as the title; a thin line at the bottom shows how long the
    // card stays (it waits while the mouse is over it); it slides in and fades out. Tips use the same card, no icon.
    const LEAVE_MS = 220

    function showCard({ badge = false, eyebrow = '', title = '', text = '', lifetime = HINT_MS, icon = null, onOpen = null } = {}) {
        const card = document.createElement('aside')
        card.className = `app-hint${badge ? ' app-hint--badge' : ''}`
        card.setAttribute('role', 'status')
        card.style.setProperty('--life', `${lifetime}ms`)

        if (icon) {
            const tile = document.createElement('span')
            tile.className = 'ach-icon app-hint-icon'
            tile.append(icon)
            card.append(tile)
        }
        const textBox = document.createElement('div')
        textBox.className = 'app-hint-text'
        if (eyebrow) {
            const small = document.createElement('span')
            small.className = 'app-hint-eyebrow'
            small.textContent = eyebrow
            textBox.append(small)
        }
        const heading = document.createElement('b')
        heading.textContent = title
        textBox.append(heading)
        if (text) {
            const body = document.createElement('p')
            body.textContent = text
            textBox.append(body)
        }
        card.append(textBox)

        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'app-hint-close'
        close.setAttribute('aria-label', tGet('firstSteps.close'))
        close.append(createIcon('x'))
        card.append(close)

        const life = document.createElement('span')
        life.className = 'app-hint-life'
        card.append(life)

        let timer = null
        let gone = false
        const leave = () => {
            if (gone) return
            gone = true
            clearTimeout(timer)
            card.classList.add('is-leaving')
            setTimeout(() => card.remove(), LEAVE_MS)
        }
        // the time left starts again when the mouse leaves: a card being read never disappears under the cursor
        const arm = () => { clearTimeout(timer); timer = setTimeout(leave, lifetime) }
        card.addEventListener('mouseenter', () => { clearTimeout(timer); card.classList.add('is-held') })
        card.addEventListener('mouseleave', () => {
            card.classList.remove('is-held')
            // restart the line so it matches the restarted timer
            life.style.animation = 'none'
            void life.offsetWidth
            life.style.animation = ''
            arm()
        })
        close.addEventListener('click', (e) => { e.stopPropagation(); leave() })
        if (onOpen) {
            card.classList.add('app-hint--link')
            card.addEventListener('click', () => { leave(); onOpen() })
        }
        stack().append(card)
        arm()
    }

    function hintOnce(id) {
        const seen = store.get(SEEN_KEY, {}) || {}
        if (seen[id]) return
        store.set(SEEN_KEY, { ...seen, [id]: true })
        showCard({ title: tGet(`hints.${id}Title`), text: tGet(`hints.${id}Text`), lifetime: HINT_MS })
    }

    /** Called after a service is added. Existing users meet these too: that is where a forgotten feature helps most. */
    function onServiceAdded({ count, sameServiceAgain, hasFolders }) {
        if (sameServiceAgain) hintOnce('accounts')
        else if (count === FOLDER_HINT_AT && !hasFolders) hintOnce('folders')
    }

    function showAchievements(keys, total) {
        if (keys.length > MAX_SEPARATE_BADGES) {
            const text = tGet('achievements.summaryText').replace('{n}', String(keys.length)).replace('{total}', String(total))
            showCard({ badge: true, eyebrow: tGet('achievements.unlocked'), title: tGet('achievements.summaryTitle'), text, lifetime: SUMMARY_MS, icon: createAchievementIcon('invite_5'), onOpen: openAchievements })
            return
        }
        keys.forEach((key, index) => {
            // 3.7.3: the achievement's own name is the title; a click opens the list of achievements
            setTimeout(() => showCard({ badge: true, eyebrow: tGet('achievements.unlocked'), title: tGet(`achievements.${key}`), lifetime: BADGE_MS, icon: createAchievementIcon(key), onOpen: openAchievements }), index * 1200)
        })
    }

    return { onServiceAdded, showAchievements }
}

module.exports = { createAppHints }
