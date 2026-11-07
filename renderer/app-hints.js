// Tips that appear once, at the moment they are useful, and small news about a new achievement.
const { createIcon, createAchievementIcon } = require('./achievement-icons')

const SEEN_KEY = 'hintsSeen'
const HINT_MS = 12000
const BADGE_MS = 6000
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

    function showCard(className, title, text, lifetime, icon, onOpen) {
        const card = document.createElement('aside')
        card.className = `app-hint ${className}`
        const heading = document.createElement('b')
        heading.textContent = title
        const body = document.createElement('p')
        body.textContent = text
        const close = document.createElement('button')
        close.type = 'button'
        close.className = 'app-hint-close'
        close.setAttribute('aria-label', tGet('firstSteps.close'))
        close.append(createIcon('x'))
        close.addEventListener('click', () => card.remove())
        if (icon) {
            const badge = document.createElement('span')
            badge.className = 'ach-icon'
            badge.append(icon)
            card.append(badge)
        }
        card.append(heading, body, close)
        if (onOpen) {
            card.classList.add('app-hint--link')
            card.addEventListener('click', (e) => {
                if (e.target.closest('.app-hint-close')) return
                card.remove()
                onOpen()
            })
        }
        stack().append(card)
        setTimeout(() => card.remove(), lifetime)
    }

    function hintOnce(id) {
        const seen = store.get(SEEN_KEY, {}) || {}
        if (seen[id]) return
        store.set(SEEN_KEY, { ...seen, [id]: true })
        showCard('', tGet(`hints.${id}Title`), tGet(`hints.${id}Text`), HINT_MS)
    }

    /** Called after a service is added. Existing users meet these too: that is where a forgotten feature helps most. */
    function onServiceAdded({ count, sameServiceAgain, hasFolders }) {
        if (sameServiceAgain) hintOnce('accounts')
        else if (count === FOLDER_HINT_AT && !hasFolders) hintOnce('folders')
    }

    function showAchievements(keys, total) {
        if (keys.length > MAX_SEPARATE_BADGES) {
            const text = tGet('achievements.summaryText').replace('{n}', String(keys.length)).replace('{total}', String(total))
            showCard('app-hint--badge', tGet('achievements.summaryTitle'), text, SUMMARY_MS, createAchievementIcon('invite_5'), openAchievements)
            return
        }
        keys.forEach((key, index) => {
            setTimeout(() => showCard('app-hint--badge', tGet('achievements.unlocked'), tGet(`achievements.${key}`), BADGE_MS, createAchievementIcon(key)), index * 1200)
        })
    }

    return { onServiceAdded, showAchievements }
}

module.exports = { createAppHints }
