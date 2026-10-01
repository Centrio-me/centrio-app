function createCloudStore(store) {
    return {
        getToken: () => store.get('cloud.accessToken', null),
        getRefresh: () => store.get('cloud.refreshToken', null),
        getUser: () => store.get('cloud.user', null),
        getLastSyncAt: () => store.get('cloud.lastSyncAt', null),
        getLastSyncError: () => store.get('cloud.lastSyncError', null),

        // BUGFIX (2026-09-30, live report — "разложила всё по папкам,
        // закрыла приложение принудительно, запустила и всё повываливалось
        // из папок"): local edits (folders, messenger order, etc.) are
        // written to disk immediately, but the matching cloud push is async
        // (debounced + a real network round-trip) and never awaited by any
        // caller. A hard kill (Task Manager "End Task", not the app's own
        // Выход) skips before-quit entirely, so that push can simply never
        // happen. On the NEXT launch, loadData()/applyCloudBootData() pulls
        // from the cloud and unconditionally overwrites local folders/
        // messengers/workspaces with whatever the cloud last had — which is
        // now the stale, pre-reorganization snapshot, silently destroying
        // the local work that never made it to the server. See usage in
        // notifySyncedStoreWrite() (renderer.js) and loadData() below.
        getPendingLocalChanges: () => store.get('cloud.pendingLocalChanges', false),
        setPendingLocalChanges: (value) => store.set('cloud.pendingLocalChanges', !!value),

        setAuth: (user, accessToken, refreshToken) => {
            // SECURITY: 'cloud.user' is a protected, main-process-owned key
            // (see PROTECTED_SET_KEYS in main.js) — main already persisted it
            // to disk itself, from the same server response this `user` came
            // from, before this code ever runs. Only mirror it into the
            // renderer's local read-cache here (setLocal), don't try to
            // store.set() it again — that would just be rejected.
            store.setLocal('cloud.user', user)
            // Tokens stored encrypted via OS safeStorage (DPAPI/Keychain/libsecret)
            store.secureSet('cloud.accessToken', accessToken)
            store.secureSet('cloud.refreshToken', refreshToken)
        },

        setUser: (user) => {
            store.setLocal('cloud.user', user)
        },

        setLastSyncAt: (value) => {
            store.set('cloud.lastSyncAt', value)
        },

        setLastSyncError: (value) => {
            if (value) store.set('cloud.lastSyncError', value)
            else store.delete('cloud.lastSyncError')
        },

        clear: () => {
            store.delete('cloud.user')
            store.delete('cloud.accessToken')
            store.delete('cloud.refreshToken')
            store.delete('cloud.lastSyncAt')
            store.delete('cloud.lastSyncError')
        },

        isLoggedIn: () => !!store.get('cloud.accessToken', null)
    }
}

function createCloudApi({
    store,
    cloudStore,
    invokeIpc,
    getSyncPayload,
    onAuthUpdated
}) {
    let refreshPromise = null

    function isUnauthorizedResult(result) {
        if (!result || result.success !== false) return false

        const errorText = String(result.error || '').toLowerCase()
        const codeText = String(result.code || '').toLowerCase()

        return (
            codeText === 'unauthorized' ||
            codeText === 'token_expired' ||
            codeText === 'invalid_token' ||
            errorText.includes('unauthorized') ||
            errorText.includes('jwt expired') ||
            errorText.includes('token expired') ||
            errorText.includes('invalid token') ||
            errorText.includes('forbidden')
        )
    }

    function applyAuthData(data) {
        if (!data) return false

        const currentUser = cloudStore.getUser()
        const nextUser = data.user || currentUser || null
        const nextAccessToken = data.accessToken || cloudStore.getToken()
        const nextRefreshToken = data.refreshToken || cloudStore.getRefresh()

        if (!nextAccessToken) return false

        cloudStore.setAuth(nextUser, nextAccessToken, nextRefreshToken)

        if (typeof onAuthUpdated === 'function') {
            onAuthUpdated(nextUser)
        }

        return true
    }

    function forceLogout() {
        cloudStore.clear()
        if (typeof onAuthUpdated === 'function') onAuthUpdated(null)
    }

    async function cloudRefreshToken() {
        if (refreshPromise) return refreshPromise

        refreshPromise = (async () => {
            try {
                const refresh = cloudStore.getRefresh()
                if (!refresh) return false

                const result = await invokeIpc('api-refresh', refresh)
                if (!result.success) return false

                const data = result.data || {}
                if (!data.accessToken) return false

                applyAuthData(data)
                return true
            } catch {
                return false
            } finally {
                refreshPromise = null
            }
        })()

        return refreshPromise
    }

    async function authorizedInvoke(channel, ...args) {
        const token = cloudStore.getToken()
        if (!token) {
            return {
                success: false,
                error: 'Not authenticated',
                code: 'unauthorized'
            }
        }

        let result = await invokeIpc(channel, token, ...args)
        if (result.success) return result

        if (!isUnauthorizedResult(result)) return result

        const refreshed = await cloudRefreshToken()
        if (!refreshed) {
            forceLogout()
            return {
                success: false,
                error: 'Session expired',
                code: 'session_expired'
            }
        }

        const nextToken = cloudStore.getToken()
        if (!nextToken) {
            forceLogout()
            return {
                success: false,
                error: 'Session expired',
                code: 'session_expired'
            }
        }

        result = await invokeIpc(channel, nextToken, ...args)
        if (!result.success && isUnauthorizedResult(result)) {
            forceLogout()
            return {
                success: false,
                error: 'Session expired',
                code: 'session_expired'
            }
        }

        return result
    }

    async function cloudSyncPush() {
        try {
            if (!cloudStore.getToken()) {
                return {
                    success: false,
                    error: 'Not authenticated',
                    code: 'unauthorized'
                }
            }

            const payload = getSyncPayload()
            const result = await authorizedInvoke(
                'api-sync-push',
                payload.messengers,
                payload.folders,
                payload.settings,
                payload.workspaces
            )

            if (result.success) {
                cloudStore.setLastSyncAt(new Date().toISOString())
                cloudStore.setLastSyncError(null)
                // The cloud now genuinely has this device's latest local
                // edit — see getPendingLocalChanges() above for why this
                // matters on the next boot.
                cloudStore.setPendingLocalChanges(false)
            } else {
                cloudStore.setLastSyncError(result.error || 'Sync push failed')
            }

            return result
        } catch (e) {
            console.error('cloudSyncPush error:', e)
            cloudStore.setLastSyncError(e?.message || 'Sync push failed')
            return {
                success: false,
                error: e?.message || 'Sync push failed'
            }
        }
    }

    async function cloudSyncPull() {
        try {
            if (!cloudStore.getToken()) return null

            const result = await authorizedInvoke('api-sync-pull')
            if (!result.success) {
                cloudStore.setLastSyncError(result.error || 'Sync pull failed')
                return null
            }

            cloudStore.setLastSyncAt(new Date().toISOString())
            cloudStore.setLastSyncError(null)
            return result.data
        } catch (e) {
            cloudStore.setLastSyncError(e?.message || 'Sync pull failed')
            return null
        }
    }

    async function login(email, password) {
        const result = await invokeIpc('api-login', email, password)
        if (!result.success) return result

        const data = result.data || {}
        applyAuthData(data)
        cloudStore.setLastSyncError(null)

        return result
    }

    async function register(email, password, name) {
        const result = await invokeIpc('api-register', email, password, name)
        if (!result.success) return result

        const data = result.data || {}
        applyAuthData(data)
        cloudStore.setLastSyncError(null)

        return result
    }

    async function oauthGoogle() {
        const result = await invokeIpc('oauth-google')
        if (!result.success) return result

        const data = result.data || {}
        applyAuthData(data)
        cloudStore.setLastSyncError(null)

        return result
    }

    async function oauthYandex() {
        const result = await invokeIpc('oauth-yandex')
        if (!result.success) return result

        const data = result.data || {}
        applyAuthData(data)
        cloudStore.setLastSyncError(null)

        return result
    }

    async function updateProfile(dataPatch) {
        const result = await authorizedInvoke('api-update-profile', dataPatch)
        if (!result.success) return result

        const returnedUser = result.data?.user
        if (returnedUser) {
            cloudStore.setUser(returnedUser)
            if (typeof onAuthUpdated === 'function') onAuthUpdated(returnedUser)
            return result
        }

        const currentUser = cloudStore.getUser() || {}
        const nextUser = { ...currentUser, ...dataPatch }
        cloudStore.setUser(nextUser)

        if (typeof onAuthUpdated === 'function') onAuthUpdated(nextUser)

        return result
    }

    async function refreshUser() {
        try {
            if (!cloudStore.getToken()) return null
            const result = await authorizedInvoke('api-me')
            if (!result.success) return null
            const user = result.data?.user || result.data
            if (user && user.email) {
                cloudStore.setUser(user)
                if (typeof onAuthUpdated === 'function') onAuthUpdated(user)
                return user
            }
            return null
        } catch {
            return null
        }
    }

    async function redeemPromo(code) {
        const result = await authorizedInvoke('api-redeem-promo', code)
        if (result.success) await refreshUser()
        return result
    }

    async function logout() {
        try {
            if (cloudStore.getToken()) {
                await authorizedInvoke('api-logout', cloudStore.getRefresh())
            }
        } catch {}
        forceLogout()
    }

    return {
        cloudRefreshToken,
        cloudSyncPush,
        cloudSyncPull,
        login,
        register,
        oauthGoogle,
        oauthYandex,
        updateProfile,
        redeemPromo,
        logout,
        refreshUser,
        authorizedInvoke
    }
}

module.exports = {
    createCloudStore,
    createCloudApi
}