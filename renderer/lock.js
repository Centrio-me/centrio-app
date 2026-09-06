const LOCK_ICON_SVG = `
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="currentColor" stroke-width="1.8"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>
`

// См. main/ipc/lockBackground.js PRESET_IDS — aurora остаётся сгенерированным
// SVG (свой дизайн по умолчанию), beach/lake — реальные фото пользователя.
const LOCK_PRESET_EXTS = { aurora: 'svg', beach: 'jpg', lake: 'jpg' }

function createLockApi({
    state,
    store,
    tGet,
    ipcRenderer,
    hashPassword,
    pinInputNew,
    pinInputConfirm,
    pinDisableInput
}) {
    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }

    // ── Часы ──────────────────────────────────────────────────────────────
    let clockTimer = null
    let lastClockTimeStr = ''

    function formatClockTime(d) {
        return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
    }

    function formatClockDate(d) {
        return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    }

    function tickClock() {
        const timeEl = document.getElementById('lockClockTime')
        const dateEl = document.getElementById('lockClockDate')
        if (!timeEl || !dateEl) return
        const now = new Date()
        const timeStr = formatClockTime(now)
        // Перерисовываем DOM только когда реально изменилась минута — тикаем
        // раз в секунду только для точности момента смены минуты, не ради
        // бессмысленных перерисовок 60 раз/мин.
        if (timeStr === lastClockTimeStr) return
        lastClockTimeStr = timeStr
        timeEl.textContent = timeStr
        dateEl.textContent = formatClockDate(now)
    }

    function startClock() {
        tickClock()
        if (clockTimer) clearInterval(clockTimer)
        clockTimer = setInterval(tickClock, 1000)
    }

    function stopClock() {
        if (clockTimer) clearInterval(clockTimer)
        clockTimer = null
    }

    // ── Виджет "Погода" ───────────────────────────────────────────────────
    // Сеть дёргаем НЕ отсюда — только зовём IPC 'weather:get' (реализация и
    // кэш с TTL 30 мин в main/ipc/weather.js, см. комментарий там про CSP).
    // Здесь свой, более редкий интервал обновления (WEATHER_REFRESH_MS), а не
    // общий 5-секундный WIDGET_REFRESH_MS — незачем дёргать IPC туда-обратно
    // так часто ради данных, которые на стороне main всё равно не обновятся
    // раньше TTL.
    const WEATHER_REFRESH_MS = 10 * 60 * 1000

    async function renderWeatherWidget() {
        const widget = document.getElementById('lockWidgetWeather')
        const iconEl = document.getElementById('lockWeatherIcon')
        const tempEl = document.getElementById('lockWeatherTemp')
        const cityEl = document.getElementById('lockWeatherCity')
        if (!widget || !iconEl || !tempEl || !cityEl) return

        let weather = null
        try {
            weather = await ipcRenderer.invoke('weather:get')
        } catch {
            weather = null
        }

        if (!weather || typeof weather.tempC !== 'number') {
            widget.style.display = 'none'
            return
        }

        widget.style.display = ''
        iconEl.textContent = weather.icon || '🌡️'
        tempEl.textContent = `${weather.tempC > 0 ? '+' : ''}${weather.tempC}°`
        cityEl.textContent = weather.city || tGet(`lock.weather.${weather.conditionKey}`) || ''
    }

    // ── Виджет "Недавняя активность" ─────────────────────────────────────
    // Группируем локальную историю уведомлений (main/ipc/appNotifications.js,
    // messengerNotifHistory) по мессенджеру за последние 24ч: только имя
    // мессенджера + счётчик + время последнего события. Тело/заголовок
    // сообщения намеренно НЕ читаем и не показываем — это чужой контент,
    // пользователь ещё не прошёл аутентификацию.
    const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000

    function formatRelativeTime(ts) {
        const diffMin = Math.max(0, Math.floor((Date.now() - ts) / 60000))
        if (diffMin < 1) return tGet('lock.justNow') || tGet('notifications.justNow') || 'now'
        if (diffMin < 60) return `${diffMin} ${tGet('lock.minShort') || 'мин'}`
        const diffH = Math.floor(diffMin / 60)
        return `${diffH} ${tGet('lock.hourShort') || 'ч'}`
    }

    async function renderActivityWidget() {
        const list = document.getElementById('lockActivityList')
        const widget = document.getElementById('lockWidgetActivity')
        if (!list || !widget) return

        let history = []
        try {
            history = await ipcRenderer.invoke('app-notifs:get-history') || []
        } catch {
            history = []
        }

        const windowStart = Date.now() - ACTIVITY_WINDOW_MS
        const byMessenger = new Map()

        history
            .filter(n => typeof n?.id === 'string' && n.id.startsWith('local-') && n.messengerId)
            .forEach(n => {
                const ts = new Date(n.createdAt || 0).getTime()
                if (!Number.isFinite(ts) || ts < windowStart) return
                const entry = byMessenger.get(n.messengerId) || { count: 0, latest: 0 }
                entry.count += 1
                entry.latest = Math.max(entry.latest, ts)
                byMessenger.set(n.messengerId, entry)
            })

        const rows = [...byMessenger.entries()]
            .sort((a, b) => b[1].latest - a[1].latest)
            .slice(0, 4)
            .map(([messengerId, entry]) => {
                const messenger = (state.activeMessengers || []).find(m => m.id === messengerId)
                return messenger ? { messenger, ...entry } : null
            })
            .filter(Boolean)

        if (!rows.length) {
            widget.style.display = 'none'
            return
        }

        widget.style.display = ''
        list.innerHTML = rows.map(({ messenger, count, latest }) => `
            <div class="lock-activity-item">
                <img class="lock-activity-icon" src="${escapeHtml(messenger.icon || 'assets/logo.png')}" alt=""
                     onerror="this.src='assets/logo.png'">
                <span class="lock-activity-name">${escapeHtml(messenger.name)}</span>
                <span class="lock-activity-count">${count > 99 ? '99+' : count}</span>
                <span class="lock-activity-time">${escapeHtml(formatRelativeTime(latest))}</span>
            </div>
        `).join('')
    }

    let widgetRefreshTimer = null
    let weatherRefreshTimer = null
    const WIDGET_REFRESH_MS = 5000

    function refreshLockWidgets() {
        renderActivityWidget()
    }

    function startWidgetRefresh() {
        refreshLockWidgets()
        renderWeatherWidget()
        if (widgetRefreshTimer) clearInterval(widgetRefreshTimer)
        widgetRefreshTimer = setInterval(refreshLockWidgets, WIDGET_REFRESH_MS)
        if (weatherRefreshTimer) clearInterval(weatherRefreshTimer)
        weatherRefreshTimer = setInterval(renderWeatherWidget, WEATHER_REFRESH_MS)
    }

    function stopWidgetRefresh() {
        if (widgetRefreshTimer) clearInterval(widgetRefreshTimer)
        widgetRefreshTimer = null
        if (weatherRefreshTimer) clearInterval(weatherRefreshTimer)
        weatherRefreshTimer = null
    }

    // Показываем аватар аккаунта Centrio вместо иконки замка, если пользователь
    // вошёл в облако и у него есть аватар — то же самое фото, что в шапке ЛК.
    function applyLockAvatar() {
        const wrap = document.querySelector('.lock-logo-circle')
        if (!wrap) return
        const user = store.get('cloud.user', null)
        wrap.innerHTML = ''
        wrap.classList.remove('has-avatar')

        if (user?.avatar) {
            const img = document.createElement('img')
            img.className = 'lock-avatar-img'
            img.alt = ''
            img.onerror = () => { wrap.innerHTML = LOCK_ICON_SVG; wrap.classList.remove('has-avatar') }
            img.src = user.avatar
            wrap.appendChild(img)
            wrap.classList.add('has-avatar')
        } else {
            wrap.innerHTML = LOCK_ICON_SVG
        }
    }
    // ── Фон экрана блокировки ────────────────────────────────────────────
    // См. main/ipc/lockBackground.js — 3 встроенных SVG-пресета (локальные
    // файлы, assets/lock-backgrounds/) или своя картинка пользователя
    // (копируется в userData, отдаётся сюда как data:-URL). Тёмный scrim
    // поверх включаем только когда реально есть фон — иначе поверх обычного
    // .lock-bg-blur градиента он был бы лишним затемнением.
    async function applyLockBackground() {
        const imageEl = document.getElementById('lockBgImage')
        const scrimEl = document.getElementById('lockBgScrim')
        if (!imageEl || !scrimEl) return

        let bg = { type: 'none' }
        try {
            bg = await ipcRenderer.invoke('lock-bg:get') || { type: 'none' }
        } catch (e) {
            console.error('[lock] failed to read background:', e)
        }

        if (bg.type === 'preset') {
            const ext = LOCK_PRESET_EXTS[bg.value] || 'svg'
            imageEl.style.backgroundImage = `url("assets/lock-backgrounds/${bg.value}.${ext}")`
            imageEl.classList.add('is-active')
            scrimEl.classList.add('is-active')
        } else if (bg.type === 'custom' && bg.dataUrl) {
            imageEl.style.backgroundImage = `url("${bg.dataUrl}")`
            imageEl.classList.add('is-active')
            scrimEl.classList.add('is-active')
        } else {
            imageEl.style.backgroundImage = 'none'
            imageEl.classList.remove('is-active')
            scrimEl.classList.remove('is-active')
        }

        document.querySelectorAll('.lock-bg-preset-item').forEach(btn => {
            btn.classList.toggle('is-selected', bg.type === 'preset' && btn.dataset.preset === bg.value)
        })
    }

    function toggleLockBgPickerPanel(forceOpen) {
        const panel = document.getElementById('lockBgPickerPanel')
        const btn = document.getElementById('lockBgPickerBtn')
        if (!panel || !btn) return
        const isOpen = typeof forceOpen === 'boolean' ? forceOpen : panel.style.display === 'none'
        panel.style.display = isOpen ? 'flex' : 'none'
        btn.classList.toggle('is-active', isOpen)
    }

    // dataset.bound-флаги — rebindLockScreen() может вызываться повторно
    // (например после отмены "забыли PIN"), не плодим дублирующиеся листенеры.
    function bindLockBgPicker() {
        const btn = document.getElementById('lockBgPickerBtn')
        const panel = document.getElementById('lockBgPickerPanel')

        if (btn && !btn.dataset.bound) {
            btn.dataset.bound = '1'
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                toggleLockBgPickerPanel()
            })
        }

        if (panel && !panel.dataset.bound) {
            panel.dataset.bound = '1'
            panel.addEventListener('click', (e) => e.stopPropagation())
        }

        document.querySelectorAll('.lock-bg-preset-item').forEach(item => {
            if (item.dataset.bound) return
            item.dataset.bound = '1'
            item.addEventListener('click', async () => {
                try {
                    await ipcRenderer.invoke('lock-bg:set-preset', item.dataset.preset)
                } catch (e) {
                    console.error('[lock] failed to set preset background:', e)
                }
                applyLockBackground()
            })
        })

        const uploadBtn = document.getElementById('lockBgUploadBtn')
        if (uploadBtn && !uploadBtn.dataset.bound) {
            uploadBtn.dataset.bound = '1'
            uploadBtn.addEventListener('click', async () => {
                try {
                    const result = await ipcRenderer.invoke('lock-bg:choose-custom')
                    if (result?.success) {
                        await applyLockBackground()
                        toggleLockBgPickerPanel(false)
                    }
                } catch (e) {
                    console.error('[lock] failed to choose custom background:', e)
                }
            })
        }

        const resetBtn = document.getElementById('lockBgResetBtn')
        if (resetBtn && !resetBtn.dataset.bound) {
            resetBtn.dataset.bound = '1'
            resetBtn.addEventListener('click', async () => {
                try {
                    await ipcRenderer.invoke('lock-bg:clear')
                } catch (e) {
                    console.error('[lock] failed to clear background:', e)
                }
                await applyLockBackground()
                toggleLockBgPickerPanel(false)
            })
        }

        // Клик вне панели её закрывает — вешаем один раз на весь документ.
        if (!document.body.dataset.lockBgOutsideBound) {
            document.body.dataset.lockBgOutsideBound = '1'
            document.addEventListener('click', () => toggleLockBgPickerPanel(false))
        }
    }

    function isPasswordEnabled() {
        const sec = store.get('security', {})
        return sec.enabled === true && !!sec.hash
    }

    function updateLockBtn() {
        const btn = document.getElementById('lockBtn')
        if (!btn) return
        btn.style.display = isPasswordEnabled() ? 'flex' : 'none'
    }

    function checkLockOnStart() {
        if (!isPasswordEnabled()) return
        showLockScreen()
    }

    function updateLockDots(value) {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`lockDot${i}`)
            if (!dot) continue
            dot.classList.toggle('filled', i < value.length)
            dot.classList.remove('error')
        }
    }

    function showLockDotsError() {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`lockDot${i}`)
            if (!dot) continue
            dot.classList.remove('filled')
            dot.classList.add('error')
        }

        setTimeout(() => {
            for (let i = 0; i < 4; i++) document.getElementById(`lockDot${i}`)?.classList.remove('error')
        }, 400)
    }

    // ── Автомасштабирование экрана блокировки под размер окна ──────────────
    // BUGFIX (2026-08-24, "на всех экранах на экране блокировки всё должно
    // масштабироваться под размер экрана. А то половина не видна" — live
    // user report): подробности архитектуры — в комментарии у #lockStack в
    // index.html. scrollWidth/scrollHeight ниже — это layout-размер БЕЗ
    // учёта CSS-transform (transform не меняет layout-box), так что их можно
    // мерить, не сбрасывая уже применённый масштаб перед пересчётом.
    const LOCK_STACK_MIN_SCALE = 0.55
    let lockStackResizeObserver = null
    let lockStackFitRaf = null

    function fitLockStack() {
        const lockScreen = document.getElementById('lockScreen')
        const stack = document.getElementById('lockStack')
        if (!lockScreen || !stack) return
        if (lockScreen.style.display === 'none') return

        const cs = getComputedStyle(lockScreen)
        const padX = parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0')
        const padY = parseFloat(cs.paddingTop || '0') + parseFloat(cs.paddingBottom || '0')
        const availableW = lockScreen.clientWidth - padX
        const availableH = lockScreen.clientHeight - padY
        const naturalW = stack.scrollWidth
        const naturalH = stack.scrollHeight
        if (naturalW <= 0 || naturalH <= 0 || availableW <= 0 || availableH <= 0) return

        const rawScale = Math.min(1, availableW / naturalW, availableH / naturalH)
        // Ниже этого порога контент стал бы нечитаемым — дальше остаток
        // отдаём уже существующему overflow-y:auto на .lock-screen вместо
        // сжатия до нечитаемости.
        const scale = Math.max(LOCK_STACK_MIN_SCALE, rawScale)

        stack.style.transform = scale < 0.999 ? `scale(${scale})` : ''
    }

    function scheduleFitLockStack() {
        if (lockStackFitRaf) return
        lockStackFitRaf = requestAnimationFrame(() => {
            lockStackFitRaf = null
            fitLockStack()
        })
    }

    // Реагирует и на изменение размера ОКНА (viewport), и на изменение
    // естественного размера самого контента (виджеты погоды/активности
    // подгружаются асинхронно и переключают display:none → flex уже ПОСЛЕ
    // первого showLockScreen() — без ResizeObserver масштаб не пересчитался
    // бы под их появление).
    function bindLockStackAutoFit() {
        const stack = document.getElementById('lockStack')
        if (!stack) return

        if (!lockStackResizeObserver && typeof ResizeObserver !== 'undefined') {
            lockStackResizeObserver = new ResizeObserver(scheduleFitLockStack)
            lockStackResizeObserver.observe(stack)
        }

        if (!bindLockStackAutoFit._windowBound) {
            bindLockStackAutoFit._windowBound = true
            window.addEventListener('resize', scheduleFitLockStack)
        }
    }

    function showLockScreen() {
        const lockScreen = document.getElementById('lockScreen')
        const lockInput = document.getElementById('lockInput')
        if (!lockScreen || !lockInput) return

        document.body.classList.add('startup-locked')
        lockScreen.style.display = 'flex'
        lockInput.value = ''
        updateLockDots('')
        document.getElementById('lockError').style.display = 'none'
        applyLockAvatar()
        applyLockBackground()
        // bindLockUi() (renderer/lock-bind.js) wires the digit keys etc. once
        // at startup but was written before the bg-picker existed, so it never
        // attaches the picker's listeners — bindLockBgPicker() is idempotent
        // (dataset.bound guards), so it's safe to call on every show.
        bindLockBgPicker()
        bindLockStackAutoFit()
        scheduleFitLockStack()
        startClock()
        startWidgetRefresh()
        setTimeout(() => lockInput.focus(), 150)

        // Сообщаем main-процессу, что экран заблокирован — он держит это в
        // памяти и на этом основании глушит нативные всплывающие уведомления
        // (main/ipc/notifications.js), пока не долетит парная 'false' отсюда
        // же из hideLockScreen(). Сама история/счётчики уведомлений (для
        // виджета "Недавняя активность" здесь на лок-скрине) идут отдельным
        // каналом (app-notifs:add) и не гасятся — блокируется только
        // OS-тост поверх экрана, что и было целью блокировки.
        try { ipcRenderer.send('lock:set-state', true) } catch {}
    }

    function hideLockScreen() {
        const lockScreen = document.getElementById('lockScreen')
        if (lockScreen) lockScreen.style.display = 'none'
        document.body.classList.remove('startup-locked')
        stopClock()
        stopWidgetRefresh()
        try { ipcRenderer.send('lock:set-state', false) } catch {}
    }

    // Verification runs in the main process (main/ipc/window.js →
    // main/services/pinHash.js) because it needs Node's crypto.scryptSync,
    // which this sandboxed renderer (nodeIntegration:false, contextIsolation:
    // true) has no access to. The plaintext PIN only ever exists transiently
    // here in memory; it's never hashed or compared client-side anymore.
    // Old-format PINs are verified and transparently migrated server-side
    // (main process) on first successful unlock — no UI changes needed here.
    async function tryUnlock() {
        const input = document.getElementById('lockInput')
        if (!input) return

        const password = input.value
        if (password.length !== 4) return

        let valid = false
        try {
            const result = await ipcRenderer.invoke('security:verify-pin', password)
            valid = !!result?.valid
        } catch (e) {
            console.error('[lock] PIN verification failed:', e)
        }

        if (valid) {
            hideLockScreen()
            input.value = ''
            updateLockDots('')
        } else {
            showLockDotsError()
            const errorEl = document.getElementById('lockError')
            if (errorEl) errorEl.style.display = 'block'
            input.value = ''
            setTimeout(() => {
                const err = document.getElementById('lockError')
                if (err) err.style.display = 'none'
            }, 2000)
        }
    }

    function updateSetPinDots(value, prefix) {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`${prefix}${i}`)
            if (!dot) continue
            dot.classList.remove('filled', 'error', 'cursor')
            if (i < value.length) dot.classList.add('filled')
        }

        const isNew = prefix === 'setPinDot' && state.pinActive === 'new'
        const isConfirm = prefix === 'setConfirmDot' && state.pinActive === 'confirm'
        if ((isNew || isConfirm) && value.length < 4) {
            document.getElementById(`${prefix}${value.length}`)?.classList.add('cursor')
        }
    }

    function setPinDotsError(prefix) {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`${prefix}${i}`)
            if (!dot) continue
            dot.classList.remove('filled', 'cursor')
            dot.classList.add('error')
        }

        setTimeout(() => {
            for (let i = 0; i < 4; i++) document.getElementById(`${prefix}${i}`)?.classList.remove('error')
        }, 600)
    }

    function setActivePinBlock(which) {
        state.pinActive = which
        const newBlock = document.getElementById('setPinDotsNew')
        const confirmBlock = document.getElementById('setPinDotsConfirm')

        if (newBlock) newBlock.classList.toggle('active', which === 'new')
        if (confirmBlock) confirmBlock.classList.toggle('active', which === 'confirm')

        updateSetPinDots(state.pinNewVal, 'setPinDot')
        updateSetPinDots(state.pinConfirmVal, 'setConfirmDot')

        setTimeout(() => {
            if (which === 'new') pinInputNew.focus()
            if (which === 'confirm') pinInputConfirm.focus()
        }, 50)
    }

    function resetPinSetup() {
        state.pinNewVal = ''
        state.pinConfirmVal = ''
        state.pinActive = null
        pinInputNew.value = ''
        pinInputConfirm.value = ''

        updateSetPinDots('', 'setPinDot')
        updateSetPinDots('', 'setConfirmDot')

        document.getElementById('setPinDotsNew')?.classList.remove('active')
        document.getElementById('setPinDotsConfirm')?.classList.remove('active')

        const status = document.getElementById('passwordStatus')
        if (status) {
            status.textContent = ''
            status.className = 'password-status'
        }
    }

    async function savePinClick() {
        const status = document.getElementById('passwordStatus')

        if (state.pinNewVal.length !== 4) {
            if (status) {
                status.textContent = tGet('lock.pinShort')
                status.className = 'password-status error'
            }
            setPinDotsError('setPinDot')
            setActivePinBlock('new')
            return
        }

        if (state.pinConfirmVal.length !== 4) {
            if (status) {
                status.textContent = tGet('lock.pinShort')
                status.className = 'password-status error'
            }
            setPinDotsError('setConfirmDot')
            setActivePinBlock('confirm')
            return
        }

        if (state.pinNewVal !== state.pinConfirmVal) {
            if (status) {
                status.textContent = tGet('settings.passwordMismatch')
                status.className = 'password-status error'
            }
            setPinDotsError('setConfirmDot')
            state.pinConfirmVal = ''
            pinInputConfirm.value = ''
            updateSetPinDots('', 'setConfirmDot')
            setActivePinBlock('confirm')
            return
        }

        let hash
        try {
            hash = await ipcRenderer.invoke('security:hash-pin', state.pinNewVal)
        } catch (e) {
            console.error('[lock] PIN hashing failed:', e)
            if (status) {
                status.textContent = tGet('lock.error')
                status.className = 'password-status error'
            }
            return
        }

        store.set('security', {
            enabled: true,
            hash,
            lockOnHide: document.getElementById('settingLockOnHide').checked
        })

        resetPinSetup()

        if (status) {
            status.textContent = tGet('lock.pinSaved')
            status.className = 'password-status success'
        }

        updateLockBtn()
        setTimeout(() => {
            const st = document.getElementById('passwordStatus')
            if (st) {
                st.textContent = ''
                st.className = 'password-status'
            }
        }, 3000)
    }

    function handlePinInput(inputEl, which) {
        const raw = inputEl.value.replace(/[^0-9]/g, '').slice(0, 4)
        inputEl.value = raw

        const status = document.getElementById('passwordStatus')

        if (which === 'new') {
            state.pinNewVal = raw
            updateSetPinDots(state.pinNewVal, 'setPinDot')
            if (status) status.textContent = ''
            if (state.pinNewVal.length === 4) setTimeout(() => setActivePinBlock('confirm'), 80)
        } else {
            state.pinConfirmVal = raw
            updateSetPinDots(state.pinConfirmVal, 'setConfirmDot')
            if (status) status.textContent = ''
            if (state.pinConfirmVal.length === 4) setTimeout(() => savePinClick(), 150)
        }
    }

    function updateDisableDots(value) {
        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`disableDot${i}`)
            if (!dot) continue
            dot.classList.toggle('filled', i < value.length)
            dot.classList.remove('error')
        }
    }

    function showDisableDotsError() {
        state.disableVal = ''
        updateDisableDots('')

        for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`disableDot${i}`)
            if (!dot) continue
            dot.classList.remove('filled')
            dot.classList.add('error')
        }

        const err = document.getElementById('pinDisableError')
        if (err) err.style.display = 'block'

        setTimeout(() => {
            for (let i = 0; i < 4; i++) document.getElementById(`disableDot${i}`)?.classList.remove('error')
            const errorEl = document.getElementById('pinDisableError')
            if (errorEl) errorEl.style.display = 'none'
        }, 1500)
    }

    function openPinDisableModal() {
        state.disableVal = ''
        updateDisableDots('')
        const err = document.getElementById('pinDisableError')
        if (err) err.style.display = 'none'
        const modal = document.getElementById('pinDisableModal')
        if (modal) modal.style.display = 'flex'
        setTimeout(() => pinDisableInput.focus(), 100)
    }

    function closePinDisableModal(restoreCheck = true) {
        const modal = document.getElementById('pinDisableModal')
        if (modal) modal.style.display = 'none'
        state.disableVal = ''
        if (restoreCheck) {
            const checkbox = document.getElementById('settingPasswordEnable')
            if (checkbox) checkbox.checked = true
        }
    }

    async function tryDisablePin() {
        if (state.disableVal.length !== 4) return

        let valid = false
        try {
            const result = await ipcRenderer.invoke('security:verify-pin', state.disableVal)
            valid = !!result?.valid
        } catch (e) {
            console.error('[lock] PIN verification failed:', e)
        }

        if (valid) {
            store.set('security', { enabled: false, hash: null, lockOnHide: false })
            const fields = document.getElementById('passwordFields')
            if (fields) fields.style.display = 'none'
            resetPinSetup()
            updateLockBtn()
            closePinDisableModal(false)
        } else {
            showDisableDotsError()
        }
    }

    function showForgotPinConfirm() {
        const lockBox = document.querySelector('.lock-box')
        if (!lockBox) return

        const originalHTML = lockBox.innerHTML
        lockBox.innerHTML = `
            <div class="lock-logo-circle" style="background:rgba(239,68,68,0.15);border-color:var(--danger);color:var(--danger);">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                          stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                    <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                    <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
            </div>
            <h2 class="lock-title" style="color:var(--danger);">${tGet('lock.resetTitle')}</h2>
            <p class="lock-sub" style="text-align:center;max-width:260px;line-height:1.6;">${tGet('lock.resetDesc')}</p>
            <div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-top:8px;">
                <button id="confirmResetBtn" class="lock-key lock-key-enter"
                        style="width:100%;height:44px;border-radius:10px;font-size:13px;background:var(--danger);gap:8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <polyline points="3 6 5 6 21 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    ${tGet('lock.resetConfirmBtn')}
                </button>
                <button id="cancelResetBtn" class="pin-disable-cancel" style="margin-top:0;">
                    ${tGet('lock.resetCancelBtn')}
                </button>
            </div>
        `

        document.getElementById('confirmResetBtn')?.addEventListener('click', () => {
            // Сбрасываем ТОЛЬКО PIN/security, а не весь store (мессенджеры, папки, настройки).
            // Ранее здесь был store.clear() — метода clear() у renderer-шима store вообще нет
            // (есть только get/set/delete), поэтому кнопка реально бросала исключение и не
            // работала. store.delete('security') использует существующий IPC-канал store:delete
            // (main.js, allowlist ALLOWED_STORE_ROOTS уже включает 'security').
            store.delete('security')
            ipcRenderer.send('quit-app', true)
        })

        document.getElementById('cancelResetBtn')?.addEventListener('click', () => {
            lockBox.innerHTML = originalHTML
            rebindLockScreen()
        })
    }

    function rebindLockScreen() {
        document.querySelectorAll('.lock-key[data-digit]').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('lockInput')
                if (!input) return
                if (input.value.length < 4) {
                    input.value += btn.dataset.digit
                    updateLockDots(input.value)
                    if (input.value.length === 4) setTimeout(() => tryUnlock(), 120)
                }
            })
        })

        document.getElementById('lockClearBtn')?.addEventListener('click', () => {
            const input = document.getElementById('lockInput')
            if (!input) return
            input.value = input.value.slice(0, -1)
            updateLockDots(input.value)
            const err = document.getElementById('lockError')
            if (err) err.style.display = 'none'
        })

        document.getElementById('lockSubmitBtn')?.addEventListener('click', () => tryUnlock())

        document.getElementById('lockInput')?.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
            updateLockDots(e.target.value)
            if (e.target.value.length === 4) setTimeout(() => tryUnlock(), 120)
        })

        document.getElementById('lockInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') tryUnlock()
            if (e.key === 'Backspace') {
                setTimeout(() => {
                    const input = document.getElementById('lockInput')
                    if (input) updateLockDots(input.value)
                }, 0)
            }
        })

        document.getElementById('forgotPinBtn')?.addEventListener('click', () => showForgotPinConfirm())

        bindLockBgPicker()

        const input = document.getElementById('lockInput')
        if (input) {
            input.value = ''
            updateLockDots('')
        }

        const err = document.getElementById('lockError')
        if (err) err.style.display = 'none'
        setTimeout(() => input?.focus(), 100)
    }

    return {
        isPasswordEnabled,
        updateLockBtn,
        checkLockOnStart,
        updateLockDots,
        showLockDotsError,
        showLockScreen,
        hideLockScreen,
        applyLockBackground,
        tryUnlock,
        updateSetPinDots,
        setPinDotsError,
        setActivePinBlock,
        resetPinSetup,
        savePinClick,
        handlePinInput,
        updateDisableDots,
        showDisableDotsError,
        openPinDisableModal,
        closePinDisableModal,
        tryDisablePin,
        showForgotPinConfirm,
        rebindLockScreen
    }
}

module.exports = {
    createLockApi
}