function createProxyApi({
    store,
    invokeIpc,
    tGet,
    openSettings
}) {
    async function initProxySection() {
        const stored = store.get('globalProxy', {})
        document.getElementById('proxyEnabled').checked = stored.enabled !== false
        document.getElementById('proxyType').value = stored.type || 'system'
        document.getElementById('proxyHost').value = stored.host || ''
        document.getElementById('proxyPort').value = stored.port || ''
        document.getElementById('proxyLogin').value = stored.login || ''
        // Password is stored encrypted — never pre-fill (security best practice).
        // Field starts empty; user types it only when changing proxy settings.
        document.getElementById('proxyPassword').value = ''
        updateProxyFields()
        clearProxyStatus()
    }

    function updateProxyFields() {
        const type = document.getElementById('proxyType').value
        const enabled = document.getElementById('proxyEnabled').checked
        const needsHost = ['http', 'https', 'socks4', 'socks5'].includes(type)

        const hostWrap = document.getElementById('proxyHostWrap')
        const authWrap = document.getElementById('proxyAuthWrap')
        const fields = document.getElementById('proxyFields')

        if (hostWrap) hostWrap.style.display = needsHost ? 'flex' : 'none'
        if (authWrap) authWrap.style.display = needsHost ? 'flex' : 'none'

        if (fields) {
            fields.style.opacity = enabled ? '1' : '0.45'
            fields.style.pointerEvents = enabled ? 'auto' : 'none'
        }
    }

    function clearProxyStatus() {
        const s = document.getElementById('proxyStatus')
        if (!s) return
        s.textContent = ''
        s.className = 'proxy-status'
    }

    function setProxyStatus(msg, type = 'info') {
        const s = document.getElementById('proxyStatus')
        if (!s) return
        s.textContent = msg
        s.className = `proxy-status ${type}`
    }

    function getProxyFormData() {
        return {
            enabled: document.getElementById('proxyEnabled').checked,
            type: document.getElementById('proxyType').value,
            host: document.getElementById('proxyHost').value.trim(),
            port: document.getElementById('proxyPort').value.trim(),
            login: document.getElementById('proxyLogin').value.trim(),
            password: document.getElementById('proxyPassword').value.trim()
        }
    }

    function updateGlobalProxyBtn() {
        const btn = document.getElementById('globalProxyBtn')
        if (!btn) return

        const stored = store.get('globalProxy', {})
        const active = stored.enabled === true && ['http', 'https', 'socks4', 'socks5'].includes(stored.type)
        btn.classList.toggle('proxy-active', active)
    }

    function bind() {
        document.getElementById('proxyEnabled').addEventListener('change', updateProxyFields)
        document.getElementById('proxyType').addEventListener('change', updateProxyFields)

        document.getElementById('proxyTestBtn').addEventListener('click', async () => {
            const data = getProxyFormData()
            const needsHost = ['http', 'https', 'socks4', 'socks5'].includes(data.type)

            if (!needsHost) {
                setProxyStatus(
                    data.type === 'none'
                        ? tGet('network.proxyStatusNone')
                        : data.type === 'system'
                            ? tGet('network.proxyStatusSystem')
                            : tGet('network.proxyStatusAuto'),
                    'info'
                )
                return
            }

            if (!data.host || !data.port) {
                setProxyStatus(tGet('network.proxyFillForTest'), 'error')
                return
            }

            setProxyStatus(tGet('network.proxyStatusTesting'), 'loading')

            const result = await invokeIpc('test-proxy', data)
            if (!result.success) {
                setProxyStatus(`${tGet('network.proxyStatusError')}: ${result.error}`, 'error')
                return
            }

            const proxyResult = result.data
            if (proxyResult.success) {
                if (proxyResult.result === 'DIRECT') {
                    setProxyStatus(tGet('network.proxyStatusDirect'), 'error')
                } else {
                    setProxyStatus(`${tGet('network.proxyStatusOk')}: ${proxyResult.result}`, 'success')
                }
            } else {
                setProxyStatus(`${tGet('network.proxyStatusError')}: ${proxyResult.error}`, 'error')
            }
        })

        document.getElementById('proxySaveBtn').addEventListener('click', async () => {
            const data = getProxyFormData()

            if (data.enabled && ['http', 'https', 'socks4', 'socks5'].includes(data.type)) {
                if (!data.host || !data.port) {
                    setProxyStatus(tGet('network.proxyFillHostPort'), 'error')
                    return
                }
            }

            setProxyStatus(tGet('network.proxyStatusApplying'), 'loading')
            // Store proxy settings: password separately via encrypted channel
            const { password, ...proxyWithoutPassword } = data
            store.set('globalProxy', proxyWithoutPassword)
            if (password) {
                store.secureSet('globalProxy.password', password)
            } else {
                store.secureDelete('globalProxy.password')
            }

            const result = await invokeIpc('apply-global-proxy', data)
            if (result.success) {
                setProxyStatus(tGet('network.proxyStatusSaved'), 'success')
                updateGlobalProxyBtn()
                setTimeout(clearProxyStatus, 3000)
            } else {
                setProxyStatus(`${tGet('network.proxyStatusError')}: ${result.error}`, 'error')
            }
        })

        document.getElementById('globalProxyBtn')?.addEventListener('click', () => {
            openSettings()
            setTimeout(() => {
                document.querySelectorAll('.settings-nav-item').forEach(i => i.classList.remove('active'))
                document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'))
                document.querySelector('[data-section="network"]')?.classList.add('active')
                document.getElementById('section-network')?.classList.add('active')
            }, 100)
        })
    }

    function applySavedProxyOnStart() {
        const savedProxy = store.get('globalProxy', null)
        if (savedProxy?.enabled) {
            invokeIpc('apply-global-proxy', savedProxy).catch(() => {})
        }
    }

    return {
        initProxySection,
        updateProxyFields,
        clearProxyStatus,
        setProxyStatus,
        getProxyFormData,
        updateGlobalProxyBtn,
        bind,
        applySavedProxyOnStart
    }
}

module.exports = {
    createProxyApi
}