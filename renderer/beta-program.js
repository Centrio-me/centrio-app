// «Друг Centrio» (3.8.2, owner 2026-11-12): beta testing. Settings → Система has «Участвовать в тестировании»: a ticked
// box puts the person on the server's list of testers (POST /api/user/beta), their Centrio then reads the beta update
// channel (main/services/update-channel.js) and gets test versions first. Testers — ticked themselves or added by the
// owner — see «Друг Centrio» in the profile and get the «Друг Centrio» achievement (server side).
const { createIcon } = require('./achievement-icons')

function createBetaProgram({ cloudApi, cloudStore, tGet }) {
    const t = (key) => tGet(`v380.friend.${key}`)
    const isTester = () => cloudStore.getUser()?.betaTester === true
    const signedIn = () => !!cloudStore.getToken()

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    // ── the badge next to the plan in the profile ──────────────────────────────
    function applyBadge() {
        const plan = document.getElementById('cloudUserPlan')
        if (!plan) return
        let badge = document.getElementById('cloudFriendBadge')
        if (!badge) {
            badge = el('span', 'lk-friend')
            badge.id = 'cloudFriendBadge'
            badge.append(createIcon('heart-handshake'), el('span', 'lk-friend-text'))
            plan.after(badge)
        }
        badge.querySelector('.lk-friend-text').textContent = t('badge')
        badge.title = t('badgeTitle')
        badge.hidden = !isTester()
    }

    // ── Settings → Система ─────────────────────────────────────────────────────
    function renderSettings() {
        const group = document.getElementById('betaProgramGroup')
        if (!group) return
        group.textContent = ''
        const title = el('div', 'settings-group-title beta-title')
        title.append(createIcon('heart-handshake'), el('span', '', t('title')))
        group.append(title)

        const row = el('div', 'settings-row')
        const label = el('div', 'settings-label')
        label.append(el('span', '', t('label')), el('span', 'settings-hint', t('hint')))
        const toggle = el('label', 'toggle')
        const input = el('input')
        input.type = 'checkbox'
        input.checked = isTester()
        input.disabled = !signedIn()
        toggle.append(input, el('span', 'toggle-slider'))
        row.append(label, toggle)
        group.append(row)

        const status = el('div', 'settings-hint beta-status')
        status.setAttribute('role', 'status')
        if (!signedIn()) status.textContent = t('needsAccount')
        else if (isTester()) status.textContent = t('badgeTitle')
        group.append(status)

        input.addEventListener('change', () => setTester(input, status))
    }

    async function setTester(input, status) {
        const wanted = input.checked
        input.disabled = true
        let result = null
        try {
            result = await cloudApi.authorizedInvoke('api-beta-set', wanted)
        } catch (err) {
            result = { success: false, error: err?.message }
        }
        input.disabled = false
        if (!result?.success) {
            input.checked = !wanted
            status.textContent = t('failed')
            return
        }
        const user = result.data?.user
        cloudStore.setUser(user && typeof user === 'object' ? user : { ...cloudStore.getUser(), betaTester: result.data?.betaTester === true })
        input.checked = isTester()
        status.textContent = isTester() ? t('joined') : t('left')
        applyBadge()
    }

    document.addEventListener('cloud-profile-shown', applyBadge)
    document.querySelector('.settings-nav-item[data-section="system"]')?.addEventListener('click', renderSettings)
    const settingsModal = document.getElementById('settingsModal')
    if (settingsModal) {
        new MutationObserver(() => { if (settingsModal.classList.contains('show')) renderSettings() })
            .observe(settingsModal, { attributes: true, attributeFilter: ['class'] })
    }
    renderSettings()

    return { renderSettings, applyBadge }
}

module.exports = { createBetaProgram }
