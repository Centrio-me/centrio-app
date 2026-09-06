// Список изменений в карточке обновления больше не показываем — полный
// список версий и так доступен в попапе «История изменений» (#changelogPopup),
// который открывается из настроек. Раньше здесь дублировался текст (сначала
// захардкоженной копией, потом чтением из DOM попапа) — теперь карточка
// обновления не завязана на чейнджлог вообще, дублирования нет по конструкции.

function getUpdateContainer() {
    let container = document.getElementById('updateToastContainer')
    if (!container) {
        container = document.createElement('div')
        container.id = 'updateToastContainer'
        container.className = 'update-toast-container'
        document.body.appendChild(container)
    }
    return container
}

function removeExistingCard() {
    const existing = document.getElementById('updateToast')
    if (!existing) return
    existing.classList.remove('show')
    setTimeout(() => { if (existing.parentNode) existing.remove() }, 400)
}

// SVG иконки для update-карточки
const UPDATE_ICONS = {
    available:     '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3v10M6 9l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 16h12" stroke-linecap="round"/></svg>',
    downloading:   '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M10 3v9M7 9l3 3 3-3" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14l-1 3h12l-1-3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    downloaded:    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    notAvailable:  '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 10.5l4 4 8-8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    error:         '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="10" cy="10" r="7.5"/><path d="M10 7v4M10 13.5v.5" stroke-linecap="round"/></svg>',
}

function createUpdateCard({ type = 'info', icon, title, version, progress = null, button = null }) {
    const card = document.createElement('div')
    card.id = 'updateToast'
    // Модификатор типа — используется для акцентного свечения карточки.
    const typeClass = type === 'success' ? 'update-card--success' : type === 'error' ? 'update-card--error' : 'update-card--info'
    // «Внимание нужно» — карточки, требующие реакции пользователя (появилось
    // обновление / оно готово к установке), получают пульсацию свечения,
    // чтобы плашку было сложно не заметить. Прогресс/ошибка и так заметны
    // прогресс-баром или тем, что не скрываются сами.
    const isAttentionWorthy = icon === 'available' || icon === 'downloaded'
    card.className = `update-card ${typeClass}${isAttentionWorthy ? ' update-card--attn' : ''}`

    // Stripe
    const stripe = document.createElement('div')
    stripe.className = `update-card-stripe ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`
    card.appendChild(stripe)

    // Header
    const head = document.createElement('div')
    head.className = 'update-card-head'

    const iconEl = document.createElement('div')
    iconEl.className = `update-card-icon ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`
    // icon — ключ из UPDATE_ICONS или SVG-строка напрямую
    iconEl.innerHTML = UPDATE_ICONS[icon] || icon || UPDATE_ICONS.available

    const infoEl = document.createElement('div')
    infoEl.className = 'update-card-info'
    const titleEl = document.createElement('div')
    titleEl.className = 'update-card-title'
    titleEl.textContent = title
    infoEl.appendChild(titleEl)
    if (version) {
        const verEl = document.createElement('div')
        verEl.className = 'update-card-version'
        verEl.textContent = `v${version}`
        infoEl.appendChild(verEl)
    }

    const closeBtn = document.createElement('button')
    closeBtn.className = 'update-card-close'
    closeBtn.type = 'button'
    closeBtn.textContent = '×'
    closeBtn.addEventListener('click', () => {
        card.classList.remove('show')
        setTimeout(() => { if (card.parentNode) card.remove() }, 400)
    })

    head.appendChild(iconEl)
    head.appendChild(infoEl)
    head.appendChild(closeBtn)
    card.appendChild(head)

    // Progress bar
    if (progress !== null) {
        const divider2 = document.createElement('div')
        divider2.className = 'update-card-divider'
        card.appendChild(divider2)

        const progressWrap = document.createElement('div')
        progressWrap.className = 'update-card-progress-wrap'
        progressWrap.id = 'updateCardProgressWrap'

        const label = document.createElement('div')
        label.className = 'update-card-progress-label'
        const statusEl = document.createElement('span')
        statusEl.className = 'update-card-progress-status'
        statusEl.id = 'updateCardStatus'
        statusEl.textContent = `${progress}%`
        const pctEl = document.createElement('span')
        pctEl.className = 'update-card-progress-pct'
        pctEl.id = 'updateCardPct'
        pctEl.textContent = `${progress}%`
        label.appendChild(statusEl)
        label.appendChild(pctEl)

        const barWrap = document.createElement('div')
        barWrap.className = 'update-card-progress-bar'
        const fill = document.createElement('div')
        fill.className = 'update-card-progress-fill'
        fill.id = 'updateCardFill'
        fill.style.width = `${progress}%`
        barWrap.appendChild(fill)

        progressWrap.appendChild(label)
        progressWrap.appendChild(barWrap)
        card.appendChild(progressWrap)
    }

    // Action button
    if (button) {
        const divider3 = document.createElement('div')
        divider3.className = 'update-card-divider'
        card.appendChild(divider3)

        const actions = document.createElement('div')
        actions.className = 'update-card-actions'
        const btn = document.createElement('button')
        btn.className = `update-card-btn ${type === 'success' ? 'success' : ''}`
        btn.textContent = button.text
        btn.addEventListener('click', button.action)
        actions.appendChild(btn)
        card.appendChild(actions)
    }

    return card
}

function showUpdateCard(opts) {
    removeExistingCard()
    const container = getUpdateContainer()
    const card = createUpdateCard(opts)
    container.appendChild(card)
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('show')))

    // Auto-dismiss informational cards without a button
    // (чуть дольше, чем раньше, — плашка стала заметнее, но не мгновенная)
    if (!opts.button && opts.type !== 'error') {
        setTimeout(() => {
            card.classList.remove('show')
            setTimeout(() => { if (card.parentNode) card.remove() }, 400)
        }, 8000)
    }
}

// Обновляем прогресс-бар уже показанной карточки
function updateCardProgress(percent) {
    const fill = document.getElementById('updateCardFill')
    const pct  = document.getElementById('updateCardPct')
    const status = document.getElementById('updateCardStatus')
    if (fill) fill.style.width = `${percent}%`
    if (pct)  pct.textContent = `${percent}%`
    if (status) status.textContent = `${percent}%`
}

// Обратная совместимость — старый API тостов
function showUpdateBanner(message, type = 'info', button = null) {
    showUpdateCard({
        type,
        icon: type === 'success' ? 'notAvailable' : type === 'error' ? 'error' : 'available',
        title: message,
        version: null,
        progress: null,
        button,
    })
}

let _lastDownloadingPercent = 0

function bindUpdater({ ipcRenderer, invokeIpc, showUpdateBanner: _compat, tGet }) {
    ipcRenderer.on('update-status', (data = {}) => {
        if (!data || typeof data !== 'object') {
            console.warn('[updater] Invalid update-status payload:', data)
            return
        }

        const { status = 'unknown', version = '', percent = 0, error = null } = data

        if (status === 'checking') return

        if (status === 'available') {
            showUpdateCard({
                type: 'info',
                icon: 'available',
                title: tGet('updater.available'),
                version,
            })
            return
        }

        if (status === 'downloading') {
            const p = Math.round(percent || 0)
            // Если карточка уже показана — просто обновляем прогресс
            if (document.getElementById('updateToast')) {
                updateCardProgress(p)
                _lastDownloadingPercent = p
                return
            }
            showUpdateCard({
                type: 'info',
                icon: 'downloading',
                title: tGet('updater.downloading'),
                version,
                progress: p,
            })
            _lastDownloadingPercent = p
            return
        }

        if (status === 'downloaded') {
            showUpdateCard({
                type: 'success',
                icon: 'downloaded',
                title: tGet('updater.downloaded'),
                version,
                button: {
                    text: tGet('updater.installRestart'),
                    action: () => invokeIpc('install-update'),
                },
            })
            return
        }

        if (status === 'not-available') {
            showUpdateCard({
                type: 'success',
                icon: 'notAvailable',
                title: tGet('updater.notAvailable'),
                version: null,
            })
            return
        }

        if (status === 'error') {
            console.warn('[updater] Update error:', error)
            showUpdateCard({
                type: 'error',
                icon: 'error',
                title: tGet('updater.error'),
                version: null,
            })
        }
    })
}

module.exports = {
    bindUpdater,
    showUpdateBanner,
}
