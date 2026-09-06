// Экран первого запуска — 4 шага:
//  1) язык + вход/регистрация (или «Пропустить»)
//  2) выбор сервисов
//  3) объявление 14-дневного Pro-триала
//  4) «Готово — запустить Centrio»
//
// Показывается один раз — до тех пор пока store.get('onboardingAuthSeen')
// не станет true (флаг ставится только на финальном шаге, чтобы прерванный
// на середине флоу запуск в следующий раз начинался заново, а не завис в
// промежуточном состоянии).
const RECOMMENDED_COUNT = 11

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
    const SCREENS = { auth: screen1, services: screen2, trial: screen3, ready: screen4 }

    // ── Навигация между шагами: простой стек истории, чтобы «назад»
    // работал корректно независимо от того, как пользователь попал на
    // текущий шаг (например, экран 4 достижим и из экрана 3, и напрямую
    // из экрана 2, если триал не показывался). ──
    const navHistory = ['auth']

    function showScreen(name) {
        Object.values(SCREENS).forEach(s => { if (s) s.style.display = 'none' })
        SCREENS[name].style.display = 'flex'
    }

    function goTo(name) {
        navHistory.push(name)
        showScreen(name)
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

    document.getElementById('onbSkipBtn')?.addEventListener('click', () => goTo('services'))

    function showOAuthWait(providerLabel) {
        document.getElementById('onbOauthWait').style.display = 'flex'
        document.getElementById('onbOauthButtons').style.display = 'none'
        document.getElementById('onbOauthDivider').style.display = 'none'
        const waitText = document.getElementById('onbOauthWaitText')
        if (waitText) waitText.textContent = tGet('oauth.waitFor').replace('{provider}', providerLabel)
    }

    function hideOAuthWait() {
        document.getElementById('onbOauthWait').style.display = 'none'
        document.getElementById('onbOauthButtons').style.display = 'flex'
        document.getElementById('onbOauthDivider').style.display = ''
    }

    document.getElementById('onbOauthCancelBtn')?.addEventListener('click', hideOAuthWait)

    async function handleOAuth(oauthFn, providerLabel) {
        showOAuthWait(providerLabel)
        try {
            const result = await oauthFn()
            hideOAuthWait()
            if (!result.success) {
                const errorEl = document.getElementById('onbLoginError')
                errorEl.textContent = result.error || tGet('cloud.oauthError')
                errorEl.style.display = 'block'
                return
            }
            ;(cloudSyncAfterLogin || cloudSyncPush)()
            goTo('services')
        } catch (e) {
            hideOAuthWait()
            console.error('Onboarding OAuth error:', e)
        }
    }

    document.getElementById('onbOauthGoogleBtn')?.addEventListener('click', () => {
        handleOAuth(() => cloudApi.oauthGoogle(), 'Google')
    })

    document.getElementById('onbOauthYandexBtn')?.addEventListener('click', () => {
        handleOAuth(() => cloudApi.oauthYandex(), 'Yandex')
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

        const result = mode === 'register'
            ? await cloudApi.register(email, password, email.split('@')[0])
            : await cloudApi.login(email, password)

        if (!result.success) {
            errorEl.textContent = result.error
            errorEl.style.display = 'block'
            return
        }

        errorEl.style.display = 'none'
        ;(cloudSyncAfterLogin || cloudSyncPush)()
        goTo('services')
    }

    document.getElementById('onbLoginBtn')?.addEventListener('click', () => submitEmail('login'))
    document.getElementById('onbRegisterBtn')?.addEventListener('click', () => submitEmail('register'))

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

    // ── Шаг 3: Pro-триал на 14 дней ──────────────────────────────
    // Раньше выдавался только зарегистрированным (через промокод PRO14 на
    // аккаунт). Теперь — всем, включая тех кто нажал «Пропустить»: без
    // аккаунта триал привязывается к железу через
    // api-device-trial-redeem (см. main/ipc/api.js), с тем же
    // ограничением «один раз», просто по hardwareId вместо userId.
    async function goToTrial() {
        goTo('trial')
        try {
            if (cloudStore.isLoggedIn()) {
                await cloudApi.redeemPromo('PRO14')
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
                await window.electronAPI.invoke('api-device-trial-redeem')
            }
        } catch (e) {
            console.error('onboarding trial grant failed:', e)
        }
        updateTrialStatusBar?.()
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
