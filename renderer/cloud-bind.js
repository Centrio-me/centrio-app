function bindCloudUi({
    cloudStore,
    cloudApi,
    cloudSyncPush,
    cloudSyncAfterLogin,
    tGet,
    openCloudLogin,
    openCloudProfile,
    updateAvatarInModal,
    renderLocalStats,
    openUrl
}) {
    document.getElementById('cloudBtn').addEventListener('click', async () => {
        if (cloudStore.isLoggedIn()) {
            openCloudProfile()                                    // сразу из кэша
            cloudApi.refreshUser().then(() => openCloudProfile()) // обновить план с сервера
        } else {
            openCloudLogin()
        }
    })

    document.getElementById('closeCloudModalBtn').addEventListener('click', () => {
        document.getElementById('cloudModal').classList.remove('show')
    })

    document.getElementById('cloudModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('cloudModal')) {
            document.getElementById('cloudModal').classList.remove('show')
        }
    })

    // ── helpers for browser-based OAuth wait state ────────────────
    function showOAuthWait(providerLabel) {
        const waitView    = document.getElementById('oauthWaitView')
        const btnsView    = document.getElementById('oauthButtonsView')
        const divider     = document.querySelector('#cloudLoginView .oauth-divider')
        const form        = document.querySelector('#cloudLoginView .vsc-input')
        const waitText    = document.getElementById('oauthWaitText')
        if (waitText) waitText.textContent = tGet('oauth.waitFor').replace('{provider}', providerLabel)
        if (waitView)  waitView.style.display  = 'flex'
        if (btnsView)  btnsView.style.display  = 'none'
        if (divider)   divider.style.display   = 'none'
    }

    function hideOAuthWait() {
        const waitView    = document.getElementById('oauthWaitView')
        const btnsView    = document.getElementById('oauthButtonsView')
        const divider     = document.querySelector('#cloudLoginView .oauth-divider')
        if (waitView)  waitView.style.display  = 'none'
        if (btnsView)  btnsView.style.display  = 'flex'
        if (divider)   divider.style.display   = ''
    }

    document.getElementById('oauthCancelBtn')?.addEventListener('click', () => {
        hideOAuthWait()
    })

    async function handleSystemOAuth(oauthFn, providerLabel) {
        showOAuthWait(providerLabel)
        try {
            const result = await oauthFn()
            hideOAuthWait()
            if (!result.success) {
                document.getElementById('cloudLoginError').textContent = result.error || tGet('cloud.oauthError')
                document.getElementById('cloudLoginError').style.display = 'block'
                return
            }
            document.getElementById('cloudLoginError').style.display = 'none'
            openCloudProfile()
            ;(cloudSyncAfterLogin || cloudSyncPush)()
        } catch (e) {
            hideOAuthWait()
            console.error('OAuth error:', e)
        }
    }

    document.getElementById('oauthGoogleBtn').addEventListener('click', () => {
        handleSystemOAuth(() => cloudApi.oauthGoogle(), 'Google')
    })

    document.getElementById('oauthYandexBtn').addEventListener('click', () => {
        handleSystemOAuth(() => cloudApi.oauthYandex(), 'Yandex')
    })

    document.getElementById('cloudLoginBtn').addEventListener('click', async () => {
        const email = document.getElementById('cloudEmail').value.trim()
        const password = document.getElementById('cloudPassword').value.trim()
        const errorEl = document.getElementById('cloudLoginError')

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
        openCloudProfile()
        ;(cloudSyncAfterLogin || cloudSyncPush)()
    })

    document.getElementById('cloudRegisterBtn').addEventListener('click', async () => {
        const email = document.getElementById('cloudEmail').value.trim()
        const password = document.getElementById('cloudPassword').value.trim()
        const errorEl = document.getElementById('cloudLoginError')

        if (!email || !password) {
            errorEl.textContent = tGet('cloud.fillAll')
            errorEl.style.display = 'block'
            return
        }

        const result = await cloudApi.register(email, password, email.split('@')[0])
        if (!result.success) {
            errorEl.textContent = result.error
            errorEl.style.display = 'block'
            return
        }

        errorEl.style.display = 'none'
        openCloudProfile()
        ;(cloudSyncAfterLogin || cloudSyncPush)()
    })

    document.getElementById('cloudUserAvatar').addEventListener('mouseenter', () => {
        document.getElementById('cloudAvatarOverlay').style.display = 'flex'
    })

    document.getElementById('cloudUserAvatar').addEventListener('mouseleave', () => {
        document.getElementById('cloudAvatarOverlay').style.display = 'none'
    })

    document.getElementById('cloudUserAvatar').addEventListener('click', () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0]
            if (!file) return

            const reader = new FileReader()
            reader.onload = async (ev) => {
                const base64 = ev.target.result
                const result = await cloudApi.updateProfile({ avatar: base64 })
                if (!result.success) {
                    alert(result.error)
                    return
                }
                updateAvatarInModal(base64)
            }
            reader.readAsDataURL(file)
        })

        input.click()
    })

    document.getElementById('cloudEditNameBtn').addEventListener('click', () => {
        const user = cloudStore.getUser()
        document.getElementById('cloudEditName').value = user?.name || ''
        document.getElementById('cloudEditNameWrap').style.display = 'block'
        document.getElementById('cloudEditNameBtn').style.display = 'none'
        setTimeout(() => document.getElementById('cloudEditName').focus(), 50)
    })

    document.getElementById('cloudCancelNameBtn').addEventListener('click', () => {
        document.getElementById('cloudEditNameWrap').style.display = 'none'
        document.getElementById('cloudEditNameBtn').style.display = 'flex'
    })

    document.getElementById('cloudSaveNameBtn').addEventListener('click', async () => {
        const name = document.getElementById('cloudEditName').value.trim()
        if (!name) return

        const result = await cloudApi.updateProfile({ name })
        if (!result.success) {
            alert(result.error)
            return
        }

        document.getElementById('cloudUserName').textContent = name
        document.getElementById('cloudEditNameWrap').style.display = 'none'
        document.getElementById('cloudEditNameBtn').style.display = 'flex'
    })

    document.getElementById('cloudEditName').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') document.getElementById('cloudSaveNameBtn').click()
        if (e.key === 'Escape') document.getElementById('cloudCancelNameBtn').click()
    })

    function showPromoMsg(text, ok) {
        const msgEl = document.getElementById('cloudPromoMsg')
        if (!msgEl) return
        msgEl.textContent = text
        msgEl.className = 'cp-promo-msg ' + (ok ? 'is-ok' : 'is-err')
        msgEl.style.display = 'block'
    }

    async function submitPromoCode() {
        const input = document.getElementById('cloudPromoInput')
        const btn   = document.getElementById('cloudPromoBtn')
        const code  = input.value.trim()
        if (!code) return

        btn.disabled = true
        const result = await cloudApi.redeemPromo(code)
        btn.disabled = false

        if (!result.success) {
            showPromoMsg(result.error || tGet('cloud.promoError'), false)
            return
        }

        input.value = ''
        showPromoMsg(tGet('cloud.promoSuccess'), true)
        openCloudProfile()
    }

    document.getElementById('cloudPromoBtn').addEventListener('click', submitPromoCode)
    document.getElementById('cloudPromoInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitPromoCode()
    })

    document.getElementById('cloudSyncNowBtn').addEventListener('click', async () => {
        const btn = document.getElementById('cloudSyncNowBtn')
        const spanEl = btn.querySelector('span')

        if (spanEl) spanEl.textContent = tGet('cloud.syncing')
        btn.disabled = true
        await cloudSyncPush()
        if (spanEl) spanEl.textContent = tGet('cloud.sync')
        btn.disabled = false
        // Обновить время синхронизации после завершения
        if (renderLocalStats) renderLocalStats()
    })

    document.getElementById('cloudLogoutBtn').addEventListener('click', () => {
        cloudApi.logout()
        const content = document.querySelector('.cloud-modal-content')
        if (content) content.classList.remove('profile-open')
        document.getElementById('cloudProfileView').style.display = 'none'
        document.getElementById('cloudLoginView').style.display = 'flex'
        document.getElementById('cloudModal').classList.remove('show')
    })

    const DASHBOARD_URL = 'https://centrio.me/dashboard'

    const _doOpenUrl = (url) => {
        if (openUrl) openUrl(url)
        else window.electronAPI?.openExternal?.(url)
    }

    document.getElementById('planBuyProBtn')?.addEventListener('click', () => {
        _doOpenUrl(DASHBOARD_URL)
    })

    document.getElementById('cloudSupportBtn')?.addEventListener('click', () => {
        _doOpenUrl(`${DASHBOARD_URL}?tab=support`)
    })

    document.getElementById('planBuyProYearBtn')?.addEventListener('click', () => {
        _doOpenUrl(DASHBOARD_URL)
    })

    document.getElementById('proExtendBtn')?.addEventListener('click', () => {
        _doOpenUrl(DASHBOARD_URL)
    })

}

module.exports = {
    bindCloudUi
}