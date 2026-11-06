// Разделы личного кабинета в приложении: Обзор, Активность, Подписка, Устройства, Поддержка.
const DEFAULT_TAB = 'overview'

function showCabinetTab(name) {
    document.querySelectorAll('[data-lk-tab]').forEach((btn) => {
        const isActive = btn.dataset.lkTab === name
        btn.classList.toggle('is-active', isActive)
        if (isActive) btn.setAttribute('aria-current', 'page')
        else btn.removeAttribute('aria-current')
        if (isActive) {
            const title = document.getElementById('lkTitle')
            if (title) title.textContent = btn.textContent.trim()
        }
    })
    document.querySelectorAll('[data-lk-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.lkPanel !== name
    })
    const scroller = document.getElementById('cpScrollArea')
    if (scroller) scroller.scrollTop = 0
    document.dispatchEvent(new CustomEvent('cabinet-tab', { detail: { name } }))
}

function bindCabinetTabs() {
    document.querySelectorAll('[data-lk-tab]').forEach((btn) => {
        btn.addEventListener('click', () => showCabinetTab(btn.dataset.lkTab))
    })
    document.querySelectorAll('[data-lk-goto]').forEach((btn) => {
        btn.addEventListener('click', () => showCabinetTab(btn.dataset.lkGoto))
    })
}

module.exports = { DEFAULT_TAB, showCabinetTab, bindCabinetTabs }
