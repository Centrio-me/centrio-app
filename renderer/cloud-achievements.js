// "Достижения" in the account window. The server decides what is unlocked, this only draws it.
const { createAchievementIcon } = require('./achievement-icons')

const GROUPS = ['start', 'usage', 'time', 'support']

function bindAchievements({ cloudApi, tGet }) {
    const panel = document.getElementById('lkAchievements')
    if (!panel) return

    function text(tag, className, value) {
        const el = document.createElement(tag)
        el.className = className
        el.textContent = value
        return el
    }

    function renderStat(value, label) {
        const box = document.createElement('div')
        box.className = 'ach-stat'
        box.append(text('b', '', String(value)), text('span', '', label))
        return box
    }

    function renderItem(item) {
        const tile = document.createElement('article')
        tile.className = `ach-item${item.unlockedAt ? ' is-unlocked' : ''}`
        const icon = document.createElement('span')
        icon.className = 'ach-icon'
        icon.append(createAchievementIcon(item.key))
        tile.append(icon)
        const copy = document.createElement('div')
        copy.className = 'ach-copy'
        copy.append(text('b', '', tGet(`achievements.${item.key}`)), text('small', '', tGet(`achievements.${item.key}Desc`)))
        if (!item.unlockedAt && item.target > 1) {
            const bar = document.createElement('div')
            bar.className = 'ach-bar'
            const fill = document.createElement('i')
            fill.style.transform = `scaleX(${Math.min(1, item.current / item.target)})`
            bar.append(fill)
            copy.append(bar, text('small', 'ach-count', `${item.current} / ${item.target}`))
        }
        tile.append(copy)
        return tile
    }

    function render(data) {
        panel.textContent = ''
        const hero = document.createElement('div')
        hero.className = 'ach-hero'
        const progress = document.createElement('div')
        progress.className = 'ach-progress'
        progress.append(text('b', '', `${data.unlocked} / ${data.total}`), text('span', '', tGet('achievements.progress')))
        hero.append(
            progress,
            renderStat(data.stats.services, tGet('achievements.statServices')),
            renderStat(data.stats.days, tGet('achievements.statDays')),
            renderStat(data.stats.hours, tGet('achievements.statHours')),
            renderStat(data.stats.messages, tGet('achievements.statMessages'))
        )
        panel.append(hero)
        GROUPS.forEach((group) => {
            const items = data.items.filter((item) => item.group === group)
            panel.append(text('h3', 'ach-group', tGet(`achievements.group_${group}`)))
            const grid = document.createElement('div')
            grid.className = 'ach-grid'
            grid.append(...items.map(renderItem))
            panel.append(grid)
        })
    }

    async function load() {
        panel.textContent = tGet('achievements.loading')
        const result = await cloudApi.getAchievements().catch(() => null)
        if (!result?.success) {
            panel.textContent = tGet('achievements.failed')
            return
        }
        render(result.data)
    }

    document.addEventListener('cabinet-tab', (e) => {
        if (e.detail?.name === 'achievements') load()
    })
}

module.exports = { bindAchievements }
