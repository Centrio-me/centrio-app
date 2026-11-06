// Личный кабинет: устройства, автопродление и история оплат. Данные те же, что на сайте.
const PAID_STATUSES = { SUCCEEDED: 'good', PENDING: 'wait', FAILED: 'bad', CANCELLED: 'bad', REFUNDED: 'bad' }
const CANCEL_REASONS = ['expensive', 'not-using', 'missing-feature', 'bugs', 'manual', 'other']
const YEAR_MONTHS = 12

function bindCabinetAccount({ authorizedInvoke, tGet }) {
    const $ = (id) => document.getElementById(id)
    const devicesEl = $('lkDevicesList')
    const paymentsEl = $('lkPaymentsList')
    if (!devicesEl || !paymentsEl) return

    const fmtDate = (iso) => {
        const date = new Date(iso)
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
    }
    const el = (tag, className, text) => {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text !== undefined) node.textContent = text
        return node
    }
    function showNote(target, text) {
        target.textContent = ''
        target.appendChild(el('p', 'lk-note', text))
    }

    // ── Устройства ────────────────────────────────────────────
    function deviceRow(device) {
        const row = el('div', 'lk-row')
        const main = el('div', 'lk-row-main')
        main.appendChild(el('div', 'lk-row-title', device.label || device.os || '—'))
        const details = [device.appVersion, device.ipAddress, fmtDate(device.lastActiveAt || device.createdAt)].filter(Boolean)
        main.appendChild(el('div', 'lk-note', details.join(' · ')))
        row.appendChild(main)
        if (device.current) {
            row.appendChild(el('span', 'lk-chip', tGet('cloud.deviceCurrent')))
            return row
        }
        const revoke = el('button', 'lk-btn lk-btn--ghost lk-btn--small', tGet('cloud.deviceRevoke'))
        revoke.addEventListener('click', async () => {
            revoke.disabled = true
            const result = await authorizedInvoke('api-devices-revoke', device.id).catch(() => null)
            if (result?.success) loadDevices()
            else { revoke.disabled = false; $('lkDevicesError').textContent = tGet('cloud.deviceFailed') }
        })
        row.appendChild(revoke)
        return row
    }

    async function loadDevices() {
        $('lkDevicesError').textContent = ''
        showNote(devicesEl, tGet('cloud.loading'))
        const result = await authorizedInvoke('api-devices-list').catch(() => null)
        if (!result?.success) { showNote(devicesEl, tGet('cloud.deviceFailed')); return }
        const devices = result.data?.devices || []
        devicesEl.textContent = ''
        if (!devices.length) showNote(devicesEl, tGet('cloud.devicesEmpty'))
        devices.forEach((device) => devicesEl.appendChild(deviceRow(device)))
        const limit = result.data?.limits?.desktop
        $('lkDevicesCount').textContent = limit ? tGet('cloud.devicesUsed', { used: result.data.used ?? devices.length, limit }) : ''
        $('lkRevokeOthersBtn').style.display = devices.length > 1 ? '' : 'none'
    }

    $('lkRevokeOthersBtn')?.addEventListener('click', async () => {
        const ok = await window.showConfirmModal({
            title: tGet('cloud.revokeOthersTitle'),
            message: tGet('cloud.revokeOthersText'),
            confirmText: tGet('cloud.revokeOthers'),
            cancelText: tGet('cloud.supportCancel'),
            danger: true
        })
        if (!ok) return
        const result = await authorizedInvoke('api-devices-revoke-others').catch(() => null)
        if (result?.success) loadDevices()
        else $('lkDevicesError').textContent = tGet('cloud.deviceFailed')
    })

    // ── История оплат ─────────────────────────────────────────
    function paymentRow(payment) {
        const row = el('div', 'lk-row')
        const main = el('div', 'lk-row-main')
        const term = payment.days ? tGet('cloud.payDays', { n: payment.days }) : payment.months === YEAR_MONTHS ? tGet('cloud.planYear') : tGet('cloud.payMonths', { n: payment.months })
        main.appendChild(el('div', 'lk-row-title', `${payment.plan} · ${term}`))
        main.appendChild(el('div', 'lk-note', fmtDate(payment.createdAt)))
        row.appendChild(main)
        row.appendChild(el('span', 'lk-pay-sum', `${payment.amount} ${payment.currency === 'RUB' ? '₽' : payment.currency}`))
        row.appendChild(el('span', `lk-chip is-${PAID_STATUSES[payment.status] || 'wait'}`, tGet(`cloud.payStatus${payment.status}`) || payment.status))
        return row
    }

    async function loadPayments() {
        showNote(paymentsEl, tGet('cloud.loading'))
        const result = await authorizedInvoke('api-payments-list').catch(() => null)
        const list = Array.isArray(result?.data) ? result.data : result?.data?.data
        if (!Array.isArray(list)) { showNote(paymentsEl, tGet('cloud.payFailed')); return }
        paymentsEl.textContent = ''
        if (!list.length) showNote(paymentsEl, tGet('cloud.payEmpty'))
        list.forEach((payment) => paymentsEl.appendChild(paymentRow(payment)))
    }

    // ── Автопродление ─────────────────────────────────────────
    let autoRenew = false

    async function loadAutoRenew() {
        const result = await authorizedInvoke('api-payments-auto-renew-status').catch(() => null)
        const status = result?.data?.data || result?.data
        const toggle = $('lkAutoRenewBtn')
        if (!toggle) return
        autoRenew = !!status?.autoRenew
        const canChange = autoRenew || !!status?.hasMethod
        toggle.style.display = canChange ? '' : 'none'
        toggle.textContent = tGet(autoRenew ? 'cloud.autoRenewTurnOff' : 'cloud.autoRenewTurnOn')
        toggle.classList.toggle('lk-btn--ghost', autoRenew)
    }

    function askReason() {
        const box = $('lkCancelReason')
        const list = $('lkCancelReasons')
        list.textContent = ''
        CANCEL_REASONS.forEach((reason) => {
            const button = el('button', 'lk-btn lk-btn--ghost lk-btn--small', tGet(`cloud.cancelReason_${reason}`))
            button.addEventListener('click', () => {
                box.style.display = 'none'
                authorizedInvoke('api-payments-cancel-reason', reason).catch(() => null)
            })
            list.appendChild(button)
        })
        box.style.display = ''
    }

    $('lkCancelReasonSkip')?.addEventListener('click', () => { $('lkCancelReason').style.display = 'none' })

    $('lkAutoRenewBtn')?.addEventListener('click', async (e) => {
        const button = e.currentTarget
        const turningOff = autoRenew
        if (turningOff) {
            const ok = await window.showConfirmModal({
                title: tGet('cloud.autoRenewOffTitle'),
                message: tGet('cloud.autoRenewOffText'),
                confirmText: tGet('cloud.autoRenewTurnOff'),
                cancelText: tGet('cloud.supportCancel'),
                danger: true
            })
            if (!ok) return
        }
        button.disabled = true
        const result = await authorizedInvoke('api-payments-set-auto-renew', !turningOff).catch(() => null)
        button.disabled = false
        if (!result?.success) return
        await loadAutoRenew()
        document.dispatchEvent(new CustomEvent('cabinet-auto-renew-changed'))
        if (turningOff) askReason()
    })

    document.addEventListener('cabinet-tab', (e) => {
        if (e.detail.name === 'devices') loadDevices()
        if (e.detail.name === 'subscription') { loadPayments(); loadAutoRenew() }
    })
}

module.exports = { bindCabinetAccount }
