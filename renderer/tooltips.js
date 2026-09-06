function createTooltipsApi({ state, tooltip }) {
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    }

    function showTooltip(el, name, badgeCount) {
        if (el.closest('#folderPanel')) return

        clearTimeout(state.tooltipTimeout)
        state.tooltipTimeout = setTimeout(() => {
            const rect = el.getBoundingClientRect()
            let html = escHtml(name)

            if (badgeCount && badgeCount > 0) {
                html += `<span class="tooltip-badge">${badgeCount > 99 ? '99+' : badgeCount}</span>`
            }

            tooltip.innerHTML = html
            tooltip.classList.add('visible')
            tooltip.style.top = `${Math.max(8, rect.top + rect.height / 2 - tooltip.offsetHeight / 2)}px`
            tooltip.style.left = `${rect.right + 10}px`
        }, 400)
    }

    function hideTooltip() {
        clearTimeout(state.tooltipTimeout)
        tooltip.classList.remove('visible')
    }

    return {
        showTooltip,
        hideTooltip
    }
}

module.exports = {
    createTooltipsApi
}