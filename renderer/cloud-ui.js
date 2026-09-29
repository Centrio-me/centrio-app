function createCloudUiApi({
    cloudStore,
    tGet,
    getUserInitial,
    getLocalStats,  // () => { messengers, folders, lastSyncAt }
    getCloudStats,  // async () => api-get-stats response data, or null on failure
    applyOrgLogo = () => {}, // (user) => void — swaps app logo images for the org's custom one, see renderer/org-branding.js
    // FEATURE (2026-09-21, "для PRO-пользователя, у которого уже привязана
    // карта, можно продлевать прямо в приложении в один клик" — live user
    // idea, approved for 2.9): () => { autoRenew, hasMethod, expiresAt } | null
    getAutoRenewStatus = async () => null
}) {
    const PRO_PLANS = new Set(['PRO', 'PRO_YEAR', 'TEAM'])

    // FEATURE (2026-09-10, "свяжи Pro-доступ с оплаченным местом в команде"):
    // also true for a member occupying a paid team seat (orgSummary.orgProSeat),
    // same OR branch just added to hasEffectivePro()/getUserIsPro() elsewhere.
    function _isPro(user) {
        return PRO_PLANS.has((user?.plan || '').toUpperCase()) || user?.orgSummary?.orgProSeat === true
    }

    // FEATURE (2026-09-10, "оформи так все в приложении, что человек
    // понимает, что у него про подписка команды. обводка у про команды
    // другая" — live user request): drives a visually distinct ring/badge
    // color (gold, vs. the personal-Pro indigo/cyan gradient) specifically
    // when Pro comes from a paid team seat rather than the user's own plan —
    // so a team member can tell at a glance WHY they have Pro.
    function _isTeamPro(user) {
        return user?.orgSummary?.orgProSeat === true
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
        applyOrgLogo(user)
        if (!user) {
            btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/>
            </svg>`
            btn.title = tGet('cloud.accountBtn')
            _updateCloudBtnLabel(null)
            return
        }

        const pro     = _isPro(user)
        const teamPro = _isTeamPro(user)
        const size  = pro ? 26 : 26  // inner avatar size
        const inner = user.avatar
            ? `<img src="${user.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<div style="width:100%;height:100%;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:white;">${getUserInitial(user)}</div>`

        if (pro) {
            btn.innerHTML = `
                <div class="sidebar-avatar-ring is-pro${teamPro ? ' is-team-pro' : ''}" style="width:30px;height:30px;" title="${teamPro ? (tGet('cloud.proFromTeam') || 'Pro от команды') : ''}">
                    <div class="sidebar-avatar-inner" style="width:${size}px;height:${size}px;">${inner}</div>
                </div>`
        } else {
            btn.innerHTML = `
                <div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;flex-shrink:0;">${inner}</div>`
        }
        // BUGFIX (2026-09-10, same audit as media-player-ui.js's VK Video
        // icon fix): inline onerror="..." is silently blocked by this app's
        // CSP (script-src 'self', no 'unsafe-inline') — attach via JS instead.
        const avatarImg = btn.querySelector('img')
        if (avatarImg) {
            avatarImg.addEventListener('error', () => { avatarImg.style.display = 'none' })
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
    function _applyProRing(isPro, isTeamPro) {
        const ring = document.getElementById('cloudAvatarRing')
        if (!ring) return
        ring.classList.toggle('is-pro', isPro)
        ring.classList.toggle('is-team-pro', !!isTeamPro)
    }

    // ── Бейдж плана ──────────────────────────────────────────────
    // UPDATE (2026-09-10, "оформи так все в приложении, что человек
    // понимает, что у него про подписка команды" — live user request):
    // isTeamPro appends "· КОМАНДА" to the badge text and switches it to
    // the gold team-Pro color — the raw `plan` field alone (still FREE for
    // a team member whose personal plan is unpaid) wouldn't say why they
    // actually have Pro features.
    function _applyPlanBadge(plan, isTeamPro) {
        const el = document.getElementById('cloudUserPlan')
        if (!el) return
        el.textContent = isTeamPro ? `${plan} · ${tGet('cloud.teamBadgeSuffix') || 'КОМАНДА'}` : plan
        el.classList.toggle('is-pro', PRO_PLANS.has(plan) || isTeamPro)
        el.classList.toggle('is-team-pro', !!isTeamPro)
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

    // ── График активности за 7 дней (кривая + подсказка при наведении) ──
    // REDESIGN (2026-09-30, "не нравится график за 7 дней. Сделай его
    // кривой по дням. И при наведении видно — сколько в день" — live
    // feedback): was a bar chart with the number always shown above each
    // bar — now a smoothed line/area chart (plain inline SVG, no charting
    // library in this project) with the per-day value only revealed on
    // hover via a tooltip. See styles.css's .cp-chart-* rules.
    const CHART_W = 640
    const CHART_H = 76
    const CHART_TOP_PAD = 14

    // Catmull-Rom → cubic-Bezier smoothing, the standard approach for a
    // curve that actually passes through every data point (not just an
    // approximation like a plain quadratic smoothing would give).
    function _smoothChartPath(points) {
        if (points.length < 2) return `M ${points[0].x} ${points[0].y}`
        let d = `M ${points[0].x} ${points[0].y}`
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i - 1] || points[i]
            const p1 = points[i]
            const p2 = points[i + 1]
            const p3 = points[i + 2] || p2
            const c1x = p1.x + (p2.x - p0.x) / 6
            const c1y = p1.y + (p2.y - p0.y) / 6
            const c2x = p2.x - (p3.x - p1.x) / 6
            const c2y = p2.y - (p3.y - p1.y) / 6
            d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`
        }
        return d
    }

    function _renderWeekChart(chart) {
        const section = document.getElementById('cpWeekChart')
        const holder  = document.getElementById('cpChartBars')
        if (!section || !holder) return

        if (!Array.isArray(chart) || chart.length === 0) {
            section.style.display = 'none'
            return
        }

        section.style.display = ''
        const maxMinutes = Math.max(1, ...chart.map(d => d.minutes || 0))
        const todayIso   = new Date().toISOString().slice(0, 10)
        const n = chart.length

        const points = chart.map((day, i) => {
            const minutes = day.minutes || 0
            return {
                x: n === 1 ? CHART_W / 2 : (i / (n - 1)) * CHART_W,
                y: CHART_TOP_PAD + (CHART_H - CHART_TOP_PAD) * (1 - minutes / maxMinutes),
                minutes,
                isToday: day.date === todayIso,
                label: (day.label || '').replace('.', '')
            }
        })

        const linePath = _smoothChartPath(points)
        const areaPath = `${linePath} L ${points[n - 1].x} ${CHART_H} L ${points[0].x} ${CHART_H} Z`
        const gradId = 'cpChartGrad' + Math.random().toString(36).slice(2, 8)

        holder.textContent = ''

        const wrap = document.createElement('div')
        wrap.className = 'cp-chart-wrap'

        const svgNs = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(svgNs, 'svg')
        svg.setAttribute('class', 'cp-chart-svg')
        svg.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`)
        svg.setAttribute('preserveAspectRatio', 'none')
        svg.innerHTML =
            `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">` +
            `<stop offset="0%" stop-color="#818cf8" stop-opacity="0.35"/>` +
            `<stop offset="100%" stop-color="#818cf8" stop-opacity="0"/>` +
            `</linearGradient></defs>` +
            `<path class="cp-chart-area" d="${areaPath}" fill="url(#${gradId})"/>` +
            `<path class="cp-chart-line" d="${linePath}" fill="none"/>`

        const tooltip = document.createElement('div')
        tooltip.className = 'cp-chart-tooltip'
        tooltip.style.display = 'none'

        const dotsG = document.createElementNS(svgNs, 'g')
        points.forEach((p, i) => {
            const dot = document.createElementNS(svgNs, 'circle')
            dot.setAttribute('class', 'cp-chart-dot' + (p.isToday ? ' is-today' : ''))
            dot.setAttribute('cx', p.x)
            dot.setAttribute('cy', p.y)
            dot.setAttribute('r', p.isToday ? 4 : 3)
            dotsG.appendChild(dot)

            const hit = document.createElementNS(svgNs, 'circle')
            hit.setAttribute('class', 'cp-chart-hit')
            hit.setAttribute('cx', p.x)
            hit.setAttribute('cy', p.y)
            hit.setAttribute('r', 16)
            hit.addEventListener('mouseenter', () => {
                dot.classList.add('is-active')
                tooltip.textContent = `${p.label}: ${_formatDuration(p.minutes * 60)}`
                tooltip.style.left = (p.x / CHART_W * 100) + '%'
                tooltip.style.top  = (p.y / CHART_H * 76) + 'px'
                tooltip.classList.toggle('align-start', i === 0)
                tooltip.classList.toggle('align-end', i === n - 1)
                tooltip.style.display = 'block'
            })
            hit.addEventListener('mouseleave', () => {
                dot.classList.remove('is-active')
                tooltip.style.display = 'none'
            })
            dotsG.appendChild(hit)
        })
        svg.appendChild(dotsG)

        wrap.appendChild(svg)
        wrap.appendChild(tooltip)
        holder.appendChild(wrap)

        const daysRow = document.createElement('div')
        daysRow.className = 'cp-chart-days'
        points.forEach((p) => {
            const dayEl = document.createElement('span')
            dayEl.className = 'cp-chart-day' + (p.isToday ? ' is-today' : '')
            dayEl.textContent = p.label
            daysRow.appendChild(dayEl)
        })
        holder.appendChild(daysRow)
    }

    // ── Разбивка активности по мессенджерам ──────────────────────
    // BUGFIX/FEATURE (2026-09-21): "По мессенджерами статистика слишком
    // много места занимает. Убери её" (turned it fully off) → then, same
    // conversation, "разбивку по мессенджерам ... можно вернуть компактнее
    // — не список полосок, а просто топ-3 без графика" (approved for 2.9).
    // Same section, same element ids — just top 3 by time, plain
    // name+duration rows, no bar-chart visualization (the width-scaled
    // .cp-service-bar-track/-fill markup from before this is gone).
    function _renderServicesBreakdown(services) {
        const section = document.getElementById('cpServicesBreakdown')
        const list    = document.getElementById('cpServicesList')
        if (!section || !list) return

        const top3 = (Array.isArray(services) ? services : [])
            .filter(s => s.name && (s.minutes || 0) > 0)
            .sort((a, b) => (b.minutes || 0) - (a.minutes || 0))
            .slice(0, 3)

        if (top3.length === 0) {
            section.style.display = 'none'
            return
        }

        section.style.display = ''
        list.textContent = ''
        top3.forEach(s => {
            const row = document.createElement('div')
            row.className = 'cp-service-item-compact'

            const name = document.createElement('span')
            name.className = 'cp-service-name'
            name.textContent = s.name
            name.title = s.name

            const time = document.createElement('span')
            time.className = 'cp-service-time'
            time.textContent = _formatDuration((s.minutes || 0) * 60)

            row.appendChild(name)
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
            // REDESIGN (2026-09-30, approved mockup): shortened from
            // 'long' — a full month name ("19 ноября 2026 г.") sitting next
            // to a real user name in the widened header left too little
            // room for the name before it started truncating hard.
            return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })
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

            // FEATURE (2026-09-21, one-click renew — see param doc above):
            // fire-and-forget, doesn't block the rest of the profile from
            // rendering. Defaults the button back to "go to website" (the
            // pre-existing behavior) unless/until this resolves with a
            // saved card on file.
            const extendBtn = document.getElementById('proExtendBtn')
            if (extendBtn) {
                extendBtn.dataset.canRenewNow = 'false'
                extendBtn.textContent = tGet('cloud.extend')
                getAutoRenewStatus().then((status) => {
                    if (status?.hasMethod) {
                        extendBtn.dataset.canRenewNow = 'true'
                        extendBtn.textContent = tGet('cloud.renewNow')
                    }
                }).catch(() => {})
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

        const plan     = (user?.plan || 'FREE').toUpperCase()
        const isPro    = _isPro(user)
        const isTeamPro = _isTeamPro(user)
        _applyPlanBadge(plan, isTeamPro)
        _applyProRing(isPro, isTeamPro)
        updateAvatarInModal(user?.avatar || null)

        document.getElementById('cloudEditNameWrap').style.display = 'none'
        document.getElementById('cloudEditNameBtn').style.display  = 'flex'

        const promoMsgEl = document.getElementById('cloudPromoMsg')
        if (promoMsgEl) promoMsgEl.style.display = 'none'

        _updatePlanCards(plan)
        _renderProSection(user, plan, isPro)
        _renderLocalStats()

        // FEATURE (2026-09-21, "для PRO поддержка и тикеты доступны прямо
        // из приложения"): decoupled from this module on purpose —
        // renderer/support-tickets-ui.js listens for this instead of
        // threading a callback through createCloudUiApi()'s params, same
        // reasoning as the existing DOM events this file already relies on
        // elsewhere (e.g. 'close-all-popups').
        document.dispatchEvent(new CustomEvent('cloud-profile-opened', { detail: { isPro } }))
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
