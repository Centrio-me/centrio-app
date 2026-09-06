function createCloudUiApi({
    cloudStore,
    tGet,
    getUserInitial,
    getLocalStats,  // () => { messengers, folders, lastSyncAt }
    getCloudStats   // async () => api-get-stats response data, or null on failure
}) {
    const PRO_PLANS = new Set(['PRO', 'PRO_YEAR', 'TEAM'])

    function _isPro(user) {
        return PRO_PLANS.has((user?.plan || '').toUpperCase())
    }

    // ── Sidebar cloudBtn ──────────────────────────────────────────
    // Подпись кнопки аккаунта в раскрытом сайдбаре: имя пользователя, если
    // оно есть, иначе — просто "Аккаунт". textContent (не innerHTML) —
    // имя приходит с сервера и не должно попадать в разметку как HTML.
    function _updateCloudBtnLabel(name) {
        let labelEl = document.getElementById('cloudBtnLabel')
        if (!labelEl) {
            const btn = document.getElementById('cloudBtn')
            if (!btn) return
            labelEl = document.createElement('span')
            labelEl.id = 'cloudBtnLabel'
            labelEl.className = 'activity-btn-label'
            btn.appendChild(labelEl)
        }
        labelEl.textContent = name || tGet('cloud.accountBtn')
    }

    function updateCloudBtn() {
        const btn = document.getElementById('cloudBtn')
        if (!btn) return

        const user = cloudStore.getUser()
        if (!user) {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
            </svg>`
            btn.title = tGet('cloud.accountBtn')
            _updateCloudBtnLabel(null)
            return
        }

        const pro   = _isPro(user)
        const size  = pro ? 26 : 26  // inner avatar size
        const inner = user.avatar
            ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" onerror="this.style.display='none'">`
            : `<div style="width:100%;height:100%;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;">${getUserInitial(user)}</div>`

        if (pro) {
            btn.innerHTML = `
                <div class="sidebar-avatar-ring is-pro" style="width:30px;height:30px;">
                    <div class="sidebar-avatar-inner" style="width:${size}px;height:${size}px;">${inner}</div>
                </div>`
        } else {
            btn.innerHTML = `
                <div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;">${inner}</div>`
        }
        btn.title = user.name
        _updateCloudBtnLabel(user.name)
    }

    // ── Аватарка в модале ─────────────────────────────────────────
    function updateAvatarInModal(src) {
        const avatarEl = document.getElementById('cloudUserAvatar')
        const overlay  = document.getElementById('cloudAvatarOverlay')
        if (!avatarEl || !overlay) return

        if (src) {
            // Validate URL to prevent XSS via javascript: or other dangerous schemes
            let safeSrc = null
            try {
                const u = new URL(src)
                if (u.protocol === 'https:' || u.protocol === 'http:') safeSrc = src
            } catch {
                // Not a valid URL - check for base64 data URI (used when uploading photo)
                if (src.startsWith('data:image/')) safeSrc = src
            }

            if (safeSrc) {
                const img = document.createElement('img')
                img.src = safeSrc
                img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;'
                img.onerror = () => { img.style.display = 'none' }
                avatarEl.textContent = ''
                avatarEl.appendChild(img)
            } else {
                // Unsafe src — fall back to initial letter
                const user = cloudStore.getUser()
                avatarEl.textContent = getUserInitial(user)
            }
            avatarEl.appendChild(overlay)
        } else {
            const user = cloudStore.getUser()
            avatarEl.textContent = getUserInitial(user)
            avatarEl.appendChild(overlay)
        }
    }

    // ── PRO-кольцо в модале ──────────────────────────────────────
    function _applyProRing(isPro) {
        const ring = document.getElementById('cloudAvatarRing')
        if (!ring) return
        ring.classList.toggle('is-pro', isPro)
    }

    // ── Бейдж плана ──────────────────────────────────────────────
    function _applyPlanBadge(plan) {
        const el = document.getElementById('cloudUserPlan')
        if (!el) return
        el.textContent = plan
        el.classList.toggle('is-pro', PRO_PLANS.has(plan))
    }

    // ── Подсветка текущего тарифа ─────────────────────────────────
    function _updatePlanCards(plan) {
        const planNorm = plan.toUpperCase()
        ;['FREE', 'PRO', 'PRO_YEAR'].forEach(p => {
            const idMap = { FREE: 'planCardFree', PRO: 'planCardPro', PRO_YEAR: 'planCardProYear' }
            const el = document.getElementById(idMap[p])
            if (el) el.classList.toggle('is-current', planNorm === p)
        })
    }

    // ── Форматирование даты синхронизации ─────────────────────────
    function _formatSyncDate(iso) {
        if (!iso) return '—'
        try {
            const d    = new Date(iso)
            const now  = new Date()
            const diff = now - d
            if (diff < 60_000) {
                return tGet('cloud.syncJustNow') || '< 1 min ago'
            }
            if (diff < 3_600_000) {
                const mins = Math.floor(diff / 60_000)
                const tpl  = tGet('cloud.syncMinAgo') || '{n} min ago'
                return tpl.replace('{n}', mins)
            }
            const isToday = d.toDateString() === now.toDateString()
            if (isToday) {
                return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
            return d.toLocaleDateString([], { day: 'numeric', month: 'short' })
        } catch {
            return '—'
        }
    }

    // ── Локальная статистика ──────────────────────────────────────
    function _renderLocalStats() {
        const stats = getLocalStats ? getLocalStats() : {}

        const msgEl  = document.getElementById('statMessengers')
        const fldEl  = document.getElementById('statFolders')
        const syncEl = document.getElementById('statLastSync')

        if (msgEl)  msgEl.textContent  = stats.messengers ?? '—'
        if (fldEl)  fldEl.textContent  = stats.folders    ?? '—'
        if (syncEl) syncEl.textContent = _formatSyncDate(stats.lastSyncAt)
    }

    // ── Активность (Pro): время в приложении / сообщения / streak ──
    function _formatDuration(seconds) {
        const mins = Math.round((seconds || 0) / 60)
        if (mins < 60) return `${mins}м`
        const h = Math.floor(mins / 60)
        const m = mins % 60
        return m ? `${h}ч ${m}м` : `${h}ч`
    }

    let _usageStatsRequestId = 0

    // ── График активности за 7 дней ─────────────────────────────
    function _renderWeekChart(chart) {
        const section = document.getElementById('cpWeekChart')
        const bars    = document.getElementById('cpChartBars')
        if (!section || !bars) return

        if (!Array.isArray(chart) || chart.length === 0) {
            section.style.display = 'none'
            return
        }

        section.style.display = ''
        const maxMinutes = Math.max(1, ...chart.map(d => d.minutes || 0))
        const todayIso   = new Date().toISOString().slice(0, 10)

        bars.textContent = ''
        chart.forEach(day => {
            const minutes  = day.minutes || 0
            const heightPc = Math.max(4, Math.round((minutes / maxMinutes) * 100))
            const isToday  = day.date === todayIso

            const col = document.createElement('div')
            col.className = 'cp-chart-col' + (isToday ? ' is-today' : '')

            const minutesEl = document.createElement('span')
            minutesEl.className = 'cp-chart-minutes'
            minutesEl.textContent = minutes > 0 ? String(minutes) : ''

            const track = document.createElement('div')
            track.className = 'cp-chart-track'
            const fill = document.createElement('div')
            fill.className = 'cp-chart-fill'
            fill.style.height = heightPc + '%'
            track.appendChild(fill)

            const dayEl = document.createElement('span')
            dayEl.className = 'cp-chart-day'
            dayEl.textContent = (day.label || '').replace('.', '')

            col.appendChild(minutesEl)
            col.appendChild(track)
            col.appendChild(dayEl)
            bars.appendChild(col)
        })
    }

    // ── Разбивка активности по мессенджерам ──────────────────────
    function _renderServicesBreakdown(services) {
        const section = document.getElementById('cpServicesBreakdown')
        const list    = document.getElementById('cpServicesList')
        if (!section || !list) return

        const items = (Array.isArray(services) ? services : []).filter(s => s.name)
        if (items.length === 0) {
            section.style.display = 'none'
            return
        }

        section.style.display = ''
        const maxMinutes = Math.max(1, ...items.map(s => s.minutes || 0))

        list.textContent = ''
        items.forEach(s => {
            const minutes = s.minutes || 0
            const widthPc = Math.max(2, Math.round((minutes / maxMinutes) * 100))

            const row = document.createElement('div')
            row.className = 'cp-service-item'

            const name = document.createElement('span')
            name.className = 'cp-service-name'
            name.textContent = s.name
            name.title = s.name

            const track = document.createElement('div')
            track.className = 'cp-service-bar-track'
            const fill = document.createElement('div')
            fill.className = 'cp-service-bar-fill'
            fill.style.width = widthPc + '%'
            track.appendChild(fill)

            const time = document.createElement('span')
            time.className = 'cp-service-time'
            time.textContent = _formatDuration(minutes * 60)

            row.appendChild(name)
            row.appendChild(track)
            row.appendChild(time)
            list.appendChild(row)
        })
    }

    async function _renderCloudUsageStats() {
        const wrap = document.getElementById('cpUsageStats')
        if (!wrap || typeof getCloudStats !== 'function') return

        const requestId = ++_usageStatsRequestId
        wrap.style.display = ''

        const data = await getCloudStats().catch(() => null)
        if (requestId !== _usageStatsRequestId) return // окно успели закрыть/переоткрыть

        const todayEl  = document.getElementById('usageTodayTime')
        const weekEl   = document.getElementById('usageWeekTime')
        const streakEl = document.getElementById('usageStreak')
        const msgEl    = document.getElementById('usageMsgTotal')

        if (!data) {
            if (todayEl)  todayEl.textContent  = '—'
            if (weekEl)   weekEl.textContent   = '—'
            if (streakEl) streakEl.textContent = '—'
            if (msgEl)    msgEl.textContent    = '—'
            _renderWeekChart(null)
            _renderServicesBreakdown(null)
            return
        }

        if (todayEl)  todayEl.textContent  = _formatDuration(data.today?.appTime)
        if (weekEl)   weekEl.textContent   = _formatDuration(data.week?.appTime)
        if (streakEl) streakEl.textContent = String(data.streak ?? 0)
        if (msgEl) {
            const sent = data.total?.msgSent || 0
            const recv = data.total?.msgReceived || 0
            msgEl.textContent = String(sent + recv)
        }

        _renderWeekChart(data.chart)
        _renderServicesBreakdown(data.services)
    }

    // ── Открыть вид входа ─────────────────────────────────────────
    function openCloudLogin() {
        const modal = document.getElementById('cloudModal')
        if (!modal) return

        const content = modal.querySelector('.cloud-modal-content')
        if (content) content.classList.remove('profile-open')

        modal.classList.add('show')
        document.getElementById('cloudLoginView').style.display  = 'flex'
        document.getElementById('cloudProfileView').style.display = 'none'
        document.getElementById('cloudLoginError').style.display  = 'none'
        document.getElementById('cloudEmail').value    = ''
        document.getElementById('cloudPassword').value = ''
    }

    // ── Форматирование даты подписки ──────────────────────────────
    function _formatPlanExpiry(iso) {
        if (!iso) return null
        try {
            const d = new Date(iso)
            if (isNaN(d.getTime())) return null
            return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
        } catch { return null }
    }

    // ── Обновляем PRO-секцию ──────────────────────────────────────
    function _renderProSection(user, plan, isPro) {
        const statsRow    = document.getElementById('cpStatsRow')
        const usageStats  = document.getElementById('cpUsageStats')
        const proSection  = document.getElementById('proSubSection')
        const plansSection = document.querySelector('.cp-plans-section')

        if (isPro) {
            // Показываем статистику и блок подписки, скрываем тарифы
            if (statsRow)    statsRow.style.display    = ''
            if (proSection)  proSection.style.display  = 'flex'
            if (plansSection) plansSection.style.display = 'none'
            _renderCloudUsageStats()

            // Имя плана
            const planNameEl = document.getElementById('proSubPlanName')
            if (planNameEl) {
                planNameEl.textContent = plan === 'PRO_YEAR' ? 'Pro Год' : 'Pro'
            }

            // Дата окончания
            const expiryEl = document.getElementById('proSubExpiry')
            if (expiryEl) {
                // Сервер отдаёт поле как planExpiresAt (см. auth-server.js /auth/me и
                // payments-server.js) — раньше здесь проверялось planExpiry (без "es"),
                // которого никогда не существовало, поэтому дата всегда терялась и
                // подставлялось "Бессрочно" даже при реальном сроке подписки.
                const expiry = user?.planExpiresAt || user?.planExpiry || user?.expiresAt || user?.subscriptionExpiresAt || null
                const formatted = _formatPlanExpiry(expiry)
                expiryEl.textContent = formatted || (tGet('cloud.subNoExpiry') || '—')
            }
        } else {
            // FREE: скрываем статистику и PRO-блок, показываем тарифы
            if (statsRow)    statsRow.style.display    = 'none'
            if (usageStats)  usageStats.style.display  = 'none'
            if (proSection)  proSection.style.display  = 'none'
            if (plansSection) plansSection.style.display = ''
        }
    }

    // ── Открыть профиль ───────────────────────────────────────────
    function openCloudProfile() {
        const user  = cloudStore.getUser()
        const modal = document.getElementById('cloudModal')
        if (!modal) return

        const content = modal.querySelector('.cloud-modal-content')
        if (content) content.classList.add('profile-open')

        modal.classList.add('show')
        document.getElementById('cloudLoginView').style.display   = 'none'
        document.getElementById('cloudProfileView').style.display = 'flex'

        document.getElementById('cloudUserName').textContent  = user?.name  || ''
        document.getElementById('cloudUserEmail').textContent = user?.email || ''

        const plan  = (user?.plan || 'FREE').toUpperCase()
        const isPro = _isPro(user)
        _applyPlanBadge(plan)
        _applyProRing(isPro)
        updateAvatarInModal(user?.avatar || null)

        document.getElementById('cloudEditNameWrap').style.display = 'none'
        document.getElementById('cloudEditNameBtn').style.display  = 'flex'

        const promoMsgEl = document.getElementById('cloudPromoMsg')
        if (promoMsgEl) promoMsgEl.style.display = 'none'

        _updatePlanCards(plan)
        _renderProSection(user, plan, isPro)
        _renderLocalStats()
    }

    return {
        updateCloudBtn,
        updateAvatarInModal,
        openCloudLogin,
        openCloudProfile,
        renderLocalStats: _renderLocalStats
    }
}

module.exports = { createCloudUiApi }
