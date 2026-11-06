// Экран первого запуска — 4 шага:
//  1) язык + вход/регистрация (или «Пропустить»)
//  2) выбор сервисов
//  3) объявление 7-дневного Pro-триала
//  4) «Готово — запустить Centrio»
//
// Показывается один раз — до тех пор пока store.get('onboardingAuthSeen')
// не станет true (флаг ставится только на финальном шаге, чтобы прерванный
// на середине флоу запуск в следующий раз начинался заново, а не завис в
// промежуточном состоянии).
const { requireConsent } = require('./consent-ui')
const { track } = require('./stats')
const RECOMMENDED_COUNT = 11
const FRESH_TRIAL_MS = 30 * 60 * 1000

function bindOnboardingScreen({
    store,
    cloudApi,
    cloudStore,
    cloudSyncAfterLogin,
    cloudSyncPush,
    tGet,
    getCurrentLanguage,
    setCurrentLanguage,
    applyI18n,
    popularMessengers,
    addMessenger,
    updateTrialStatusBar
}) {
    const screen1 = document.getElementById('onboardingScreen')
    if (!screen1) return

    if (store.get('onboardingAuthSeen', false)) return

    // BUGFIX: onboardingAuthSeen is a local flag that didn't exist before
    // this feature — every already-logged-in existing user updating to this
    // version would have it unset and see the onboarding flow from scratch
    // on their next launch, despite already having an account. Anyone
    // already authenticated at boot is, by definition, past onboarding —
    // mark it seen immediately and skip straight to the real app, no flash
    // of the screen at all.
    if (cloudStore.isLoggedIn()) {
        if (store.setAsync) store.setAsync('onboardingAuthSeen', true)
        else store.set('onboardingAuthSeen', true)
        return
    }

    // Same idea for existing users who were never logged in but already have
    // messengers configured — they clearly went through the equivalent of
    // onboarding by hand before this feature existed. Only a genuinely
    // empty, brand-new install falls through to the screen below.
    if ((store.get('messengers', []) || []).length > 0) {
        if (store.setAsync) store.setAsync('onboardingAuthSeen', true)
        else store.set('onboardingAuthSeen', true)
        return
    }

    const screen2 = document.getElementById('onbServicesScreen')
    const screen3 = document.getElementById('onbTrialScreen')
    const screen4 = document.getElementById('onbReadyScreen')
    const screenReg = document.getElementById('onbRegisterScreen')
    const SCREENS = { auth: screen1, register: screenReg, services: screen2, trial: screen3, ready: screen4 }

    // ── Навигация между шагами: простой стек истории, чтобы «назад»
    // работал корректно независимо от того, как пользователь попал на
    // текущий шаг (например, экран 4 достижим и из экрана 3, и напрямую
    // из экрана 2, если триал не показывался). ──
    const navHistory = ['auth']

    function showScreen(name) {
        Object.values(SCREENS).forEach(s => { if (s) s.style.display = 'none' })
        SCREENS[name].style.display = 'flex'
        track(`onboarding_screen_${name}`, {}, { once: true })
    }

    function goTo(name) {
        navHistory.push(name)
        showScreen(name)
    }

    // A team member who signs in here already has everything waiting for them (messengers and folders from the
    // owner): the setup wizard has nothing to offer, so drop the overlay and show the app right away.
    function leaveOnboarding() {
        Object.values(SCREENS).forEach(s => { if (s) s.style.display = 'none' })
        document.body.classList.remove('onb-active')
        if (store.setAsync) store.setAsync('onboardingAuthSeen', true)
        else store.set('onboardingAuthSeen', true)
        track('onboarding_done', { team: true })
    }

    window.__centrioLeaveOnboarding = leaveOnboarding // also used when team messengers arrive while the wizard is still open

    function continueAfterLogin() {
        ;(cloudSyncAfterLogin || cloudSyncPush)()
        const user = cloudStore.getUser()
        if (user && user.orgSummary && user.orgSummary.orgId) { leaveOnboarding(); return }
        goTo('services')
    }

    function goBack() {
        if (navHistory.length <= 1) return
        navHistory.pop()
        showScreen(navHistory[navHistory.length - 1])
    }

    document.getElementById('onbServicesBackBtn')?.addEventListener('click', goBack)
    document.getElementById('onbTrialBackBtn')?.addEventListener('click', goBack)
    document.getElementById('onbReadyBackBtn')?.addEventListener('click', goBack)

    // ── Шаг 1: язык ──────────────────────────────────────────────
    const langSelect = document.getElementById('onbLangSelect')
    if (langSelect) {
        langSelect.value = getCurrentLanguage()
        langSelect.addEventListener('change', async () => {
            const lang = langSelect.value
            setCurrentLanguage(lang)
            applyI18n()

            const settings = store.get('settings', {}) || {}
            const updated = { ...settings, language: lang }
            if (store.setAsync) await store.setAsync('settings', updated)
            else store.set('settings', updated)
        })
    }

    document.getElementById('onbSkipBtn')?.addEventListener('click', () => { track('onboarding_skip'); goTo('services') })

    // Two screens have Google/Яндекс buttons (sign-in and registration); their element ids differ only by the prefix.
    const OAUTH_UI = {
        auth: { prefix: 'onb', consent: 'onbConsent', error: 'onbLoginError' },
        register: { prefix: 'onbReg', consent: 'onbRegConsent', error: 'onbRegError' }
    }

    function showOAuthWait(ui, providerLabel) {
        document.getElementById(`${ui.prefix}OauthWait`).style.display = 'flex'
        document.getElementById(`${ui.prefix}OauthButtons`).style.display = 'none'
        document.getElementById(`${ui.prefix}OauthDivider`).style.display = 'none'
        const waitText = document.getElementById(`${ui.prefix}OauthWaitText`)
        if (waitText) waitText.textContent = tGet('oauth.waitFor').replace('{provider}', providerLabel)
    }

    function hideOAuthWait(ui) {
        document.getElementById(`${ui.prefix}OauthWait`).style.display = 'none'
        document.getElementById(`${ui.prefix}OauthButtons`).style.display = 'flex'
        document.getElementById(`${ui.prefix}OauthDivider`).style.display = ''
    }

    document.getElementById('onbOauthCancelBtn')?.addEventListener('click', () => hideOAuthWait(OAUTH_UI.auth))
    document.getElementById('onbRegOauthCancelBtn')?.addEventListener('click', () => hideOAuthWait(OAUTH_UI.register))

    async function handleOAuth(oauthFn, providerLabel, ui = OAUTH_UI.auth) {
        // Вход через Google/Яндекс создаёт аккаунт — согласие нужно до начала.
        if (!requireConsent(ui.consent, document.getElementById(ui.error), tGet)) return
        showOAuthWait(ui, providerLabel)
        try {
            const result = await oauthFn()
            hideOAuthWait(ui)
            if (!result.success) {
                const errorEl = document.getElementById(ui.error)
                errorEl.textContent = result.error || tGet('cloud.oauthError')
                errorEl.style.display = 'block'
                return
            }
            continueAfterLogin()
        } catch (e) {
            hideOAuthWait(ui)
            console.error('Onboarding OAuth error:', e)
        }
    }

    document.getElementById('onbOauthGoogleBtn')?.addEventListener('click', () => {
        track('onboarding_google_click')
        handleOAuth(() => cloudApi.oauthGoogle(), 'Google')
    })

    document.getElementById('onbOauthYandexBtn')?.addEventListener('click', () => {
        track('onboarding_yandex_click')
        handleOAuth(() => cloudApi.oauthYandex(), 'Yandex')
    })

    document.getElementById('onbRegGoogleBtn')?.addEventListener('click', () => {
        track('onboarding_reg_google')
        handleOAuth(() => cloudApi.oauthGoogle(), 'Google', OAUTH_UI.register)
    })

    document.getElementById('onbRegYandexBtn')?.addEventListener('click', () => {
        track('onboarding_reg_yandex')
        handleOAuth(() => cloudApi.oauthYandex(), 'Yandex', OAUTH_UI.register)
    })

    async function submitEmail(mode) {
        const email = document.getElementById('onbEmail').value.trim()
        const password = document.getElementById('onbPassword').value.trim()
        const errorEl = document.getElementById('onbLoginError')

        if (!email || !password) {
            errorEl.textContent = tGet('cloud.fillAll')
            errorEl.style.display = 'block'
            return
        }

        const result = await cloudApi.login(email, password)

        if (!result.success) {
            errorEl.textContent = result.error
            errorEl.style.display = 'block'
            return
        }

        errorEl.style.display = 'none'
        continueAfterLogin()
    }

    document.getElementById('onbLoginBtn')?.addEventListener('click', () => { track('onboarding_login_click'); submitEmail('login') })

    document.getElementById('onbForgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault()
        window.electronAPI?.openExternal?.('https://centrio.me/auth/forgot-password')
    })

    // «Создать аккаунт» открывает отдельный экран регистрации (почта + код из письма, Google, Яндекс).
    document.getElementById('onbRegisterBtn')?.addEventListener('click', () => {
        track('onboarding_register_click')
        // Whatever was typed on the sign-in screen carries over, so nobody retypes the address.
        const typed = document.getElementById('onbEmail')?.value.trim()
        const regEmail = document.getElementById('onbRegEmail')
        if (typed && regEmail && !regEmail.value) regEmail.value = typed
        showRegisterStep('form')
        goTo('register')
    })

    // ── Регистрация по почте: код приходит на адрес, аккаунт создаётся только после ввода кода ──
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const regState = { email: '', timer: null, busy: false }

    function showError(id, text) {
        const el = document.getElementById(id)
        if (!el) return
        el.textContent = text || ''
        el.style.display = text ? 'block' : 'none'
    }

    function showRegisterStep(step) {
        document.getElementById('onbRegForm').style.display = step === 'form' ? 'flex' : 'none'
        document.getElementById('onbRegCode').style.display = step === 'code' ? 'flex' : 'none'
        if (step !== 'code') stopResendTimer()
        showError('onbRegError', '')
        showError('onbRegCodeError', '')
    }

    function stopResendTimer() {
        if (regState.timer) { clearInterval(regState.timer); regState.timer = null }
    }

    // The resend button is locked for the server's gap (45 s) and shows the countdown.
    function startResendTimer(seconds) {
        stopResendTimer()
        const btn = document.getElementById('onbRegCodeResendBtn')
        if (!btn) return
        let left = Math.max(0, Math.ceil(seconds || 0))
        const paint = () => {
            btn.disabled = left > 0
            btn.textContent = left > 0 ? tGet('onb.codeResendIn').replace('{s}', String(left)) : tGet('onb.codeResend')
        }
        paint()
        if (left <= 0) return
        regState.timer = setInterval(() => {
            left -= 1
            paint()
            if (left <= 0) stopResendTimer()
        }, 1000)
    }

    function openCodeStep(email, resendInSec) {
        regState.email = email
        document.getElementById('onbRegCodeEmail').textContent = email
        const input = document.getElementById('onbRegCodeInput')
        input.value = ''
        showRegisterStep('code')
        startResendTimer(resendInSec)
        setTimeout(() => input.focus(), 50)
    }

    async function submitRegistration() {
        if (regState.busy) return
        const email = document.getElementById('onbRegEmail').value.trim()
        const password = document.getElementById('onbRegPassword').value
        if (!email || !password) return showError('onbRegError', tGet('cloud.fillAll'))
        if (!EMAIL_RE.test(email)) return showError('onbRegError', tGet('cloud.invalidEmail'))
        if (password.length < 8) return showError('onbRegError', tGet('onb.regPasswordShort'))
        if (!requireConsent('onbRegConsent', document.getElementById('onbRegError'), tGet)) return

        regState.busy = true
        const btn = document.getElementById('onbRegSubmitBtn')
        btn.disabled = true
        try {
            const result = await cloudApi.registerStart(email, password, email.split('@')[0])
            if (!result.success) {
                // 429 right after a previous request: the code is already on its way, so go on to the code step.
                if (result.status === 429 && regState.email === email) return openCodeStep(email, 0)
                return showError('onbRegError', result.error)
            }
            showError('onbRegError', '')
            track('onboarding_code_sent')
            openCodeStep(email, result.data?.resendInSec ?? 45)
        } finally {
            regState.busy = false
            btn.disabled = false
        }
    }

    async function confirmRegistration() {
        if (regState.busy) return
        const code = document.getElementById('onbRegCodeInput').value.replace(/\D/g, '')
        if (code.length !== 6) return showError('onbRegCodeError', tGet('onb.codeFormat'))
        regState.busy = true
        const btn = document.getElementById('onbRegCodeConfirmBtn')
        btn.disabled = true
        try {
            const result = await cloudApi.registerConfirm(regState.email, code)
            if (!result.success) {
                showError('onbRegCodeError', result.error)
                if (result.data?.code === 'code_expired' || result.code === 'code_expired') startResendTimer(0)
                return
            }
            showError('onbRegCodeError', '')
            track('onboarding_code_ok')
            stopResendTimer()
            continueAfterLogin()
        } finally {
            regState.busy = false
            btn.disabled = false
        }
    }

    async function resendCode() {
        if (regState.busy || !regState.email) return
        regState.busy = true
        try {
            const result = await cloudApi.registerResend(regState.email)
            if (!result.success) {
                showError('onbRegCodeError', result.error)
                // Expired signup (server restarted or 15 min passed): the form must be sent again.
                if (result.status === 400) showRegisterStep('form')
                return
            }
            showError('onbRegCodeError', '')
            startResendTimer(result.data?.resendInSec ?? 45)
        } finally {
            regState.busy = false
        }
    }

    document.getElementById('onbRegSubmitBtn')?.addEventListener('click', submitRegistration)
    document.getElementById('onbRegPassword')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitRegistration() })
    document.getElementById('onbRegCodeConfirmBtn')?.addEventListener('click', confirmRegistration)
    document.getElementById('onbRegCodeResendBtn')?.addEventListener('click', resendCode)
    document.getElementById('onbRegCodeChangeBtn')?.addEventListener('click', () => showRegisterStep('form'))
    document.getElementById('onbRegCodeInput')?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
        if (e.target.value.length === 6) confirmRegistration()
    })
    document.getElementById('onbRegisterBackBtn')?.addEventListener('click', () => {
        const onCodeStep = document.getElementById('onbRegCode').style.display !== 'none'
        if (onCodeStep) showRegisterStep('form')
        else goBack()
    })

    // ── Шаг 2: выбор сервисов ────────────────────────────────────
    // Популярные всегда остаются наверху; «Показать все» дописывает
    // остальные снизу, а не заменяет список — иначе после раскрытия нельзя
    // было вернуться к компактному виду (пользователь явно об этом сообщил).
    const selected = new Set()
    let expanded = false
    let gridRendered = false

    function makeTile(m) {
        const tile = document.createElement('div')
        tile.className = 'onb-service-tile' + (selected.has(m.name) ? ' selected' : '')
        tile.innerHTML = `
            <div class="onb-service-check">✓</div>
            <img src="${m.icon}" alt="">
            <span>${m.name}</span>
        `
        tile.addEventListener('click', () => {
            if (selected.has(m.name)) selected.delete(m.name)
            else selected.add(m.name)
            tile.classList.toggle('selected')
        })
        return tile
    }

    function renderServicesGrid() {
        const grid = document.getElementById('onbServicesGrid')
        if (!grid || gridRendered) return
        gridRendered = true
        grid.innerHTML = ''
        popularMessengers.slice(0, RECOMMENDED_COUNT).forEach(m => grid.appendChild(makeTile(m)))
    }

    document.getElementById('onbShowAllBtn')?.addEventListener('click', () => {
        if (expanded) return
        expanded = true
        const grid = document.getElementById('onbServicesGrid')
        popularMessengers.slice(RECOMMENDED_COUNT).forEach(m => grid.appendChild(makeTile(m)))
        const showAllBtn = document.getElementById('onbShowAllBtn')
        if (showAllBtn) showAllBtn.style.display = 'none'
    })

    function addSelectedMessengers() {
        popularMessengers
            .filter(m => selected.has(m.name))
            .forEach(m => { try { addMessenger(m) } catch (e) { console.error('onboarding addMessenger failed:', e) } })
    }

    document.getElementById('onbServicesContinueBtn')?.addEventListener('click', () => {
        addSelectedMessengers()
        goToTrial()
    })

    document.getElementById('onbServicesSkipBtn')?.addEventListener('click', goToTrial)

    // ── Шаг 3: Pro-триал на 7 дней ──────────────────────────────
    // Раньше выдавался только зарегистрированным (через промокод PRO14 на
    // аккаунт). Теперь — всем, включая тех кто нажал «Пропустить»: без
    // аккаунта триал привязывается к железу через
    // api-device-trial-redeem (см. main/ipc/api.js), с тем же
    // ограничением «один раз», просто по hardwareId вместо userId.
    // 2026-11-05: the "Pro enabled for 14 days" screen used to be shown even
    // when the server refused the grant (409: this device or account already
    // used the trial), so people believed they had Pro while staying on Free.
    // Now the screen appears only after a successful grant; otherwise the
    // onboarding goes straight to the final step.
    async function goToTrial() {
        let granted = false
        try {
            if (cloudStore.isLoggedIn()) {
                // Since 2026-11-06 the server grants the 7 days when the account is created (code, Google, Яндекс).
                // Fresh grant = the plan started a few minutes ago; a returning paid customer is not told about a
                // gift they did not get. Accounts made before that still redeem the code here.
                const user = (await cloudApi.refreshUser()) || cloudStore.getUser()
                const startedAt = user?.planStartedAt ? new Date(user.planStartedAt).getTime() : 0
                if (user?.plan === 'PRO' && Date.now() - startedAt < FRESH_TRIAL_MS) {
                    granted = true
                } else if (user?.plan !== 'PRO') {
                    const result = await cloudApi.redeemPromo('PRO14')
                    granted = !!(result && result.success)
                }
            } else if (window.electronAPI?.invoke) {
                // No account to attach the grant to server-side. The expiry is
                // persisted by main itself — see main/ipc/api.js's
                // api-device-trial-redeem handler + main/services/entitlement.js
                // — NOT by the renderer: `localProTrialExpiresAt` is a
                // main-process-owned key (SECURITY, see PROTECTED_SET_KEYS in
                // main.js) precisely so a compromised/DevTools'd renderer can't
                // grant itself an unlimited "trial" by writing an arbitrary
                // future date to it directly. By the time this call resolves,
                // main has already written it if the server granted the trial —
                // requirePro()/addMessenger() in renderer.js will see it on
                // their next store.get('localProTrialExpiresAt') read. A device
                // only ever gets one successful grant (server enforces
                // uniqueness by hardwareId), so a repeat onboarding run just
                // fails softly here and any existing expiry is left untouched.
                const result = await window.electronAPI.invoke('api-device-trial-redeem')
                granted = !!(result && result.success)
            }
        } catch (e) {
            console.error('onboarding trial grant failed:', e)
        }
        updateTrialStatusBar?.()
        if (granted) goTo('trial')
        else goToReady()
    }

    // ── Шаг 4: готово ────────────────────────────────────────────
    function goToReady() {
        const user = cloudStore.getUser()
        const avatarWrap = document.getElementById('onbReadyAvatar')
        const avatarImg = document.getElementById('onbReadyAvatarImg')
        if (user?.avatar && avatarImg) {
            avatarImg.src = user.avatar
            avatarWrap?.classList.add('has-photo')
        } else if (avatarWrap) {
            avatarWrap.classList.remove('has-photo')
        }
        goTo('ready')
    }

    document.getElementById('onbTrialContinueBtn')?.addEventListener('click', goToReady)

    document.getElementById('onbLaunchBtn')?.addEventListener('click', () => {
        track('onboarding_done')
        Object.values(SCREENS).forEach(s => { if (s) s.style.display = 'none' })
        document.body.classList.remove('onb-active')
        if (store.setAsync) store.setAsync('onboardingAuthSeen', true)
        else store.set('onboardingAuthSeen', true)
    })

    document.body.classList.add('onb-active')
    renderServicesGrid()
    showScreen('auth')
}

module.exports = { bindOnboardingScreen }
