'use strict'
// «Версия» card in Settings → Система: what is installed (version, channel, system, when it came out), the state of the
// update right now (checking / found / downloading / up to date), a short «what's new» taken from the version history, and
// a button that copies the details for a support message. It keeps the ids the update check already uses:
// #appVersionText, #updateStatusBadge, #checkUpdatesBtn.
const { buildEntry, formatDate } = require('./changelog-parse')

const LAST_CHECK_KEY = 'lastUpdateCheckAt'
const COPIED_VISIBLE_MS = 1600
const MAX_NEWS = 4
const WINDOWS_11_PLATFORM_MAJOR = 13 // userAgentData.platformVersion: 13+ is Windows 11
const MINUTE_MS = 60 * 1000

function el(tag, className, text) {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text != null) node.textContent = text
    return node
}

function icon(path) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('width', '15')
    svg.setAttribute('height', '15')
    svg.setAttribute('fill', 'none')
    svg.setAttribute('stroke', 'currentColor')
    svg.setAttribute('stroke-width', '1.9')
    svg.setAttribute('stroke-linecap', 'round')
    svg.setAttribute('stroke-linejoin', 'round')
    svg.setAttribute('aria-hidden', 'true')
    svg.innerHTML = path // only our own constants
    return svg
}

const ICON_REFRESH = '<path d="M20 11a8 8 0 0 0-14.500-3.500L4 9M4 4v5h5M4 13a8 8 0 0 0 14.500 3.500L20 15M20 20v-5h-5"/>'
const ICON_LIST = '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>'
const ICON_COPY = '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>'

/** «Windows 11 · x64» */
async function describeSystem() {
    const data = navigator.userAgentData
    const platform = (data && data.platform) || navigator.platform || ''
    const high = await Promise.resolve(data && data.getHighEntropyValues(['architecture', 'platformVersion'])).catch(() => null) || {}
    const arch = ({ x86: 'x64', arm: 'ARM64' })[high.architecture] || high.architecture || ''
    let name = platform
    if (/win/i.test(platform)) name = Number.parseInt(high.platformVersion, 10) >= WINDOWS_11_PLATFORM_MAJOR ? 'Windows 11' : 'Windows 10'
    else if (/mac/i.test(platform)) name = 'macOS'
    else if (/linux/i.test(platform)) name = 'Linux'
    return [name, arch].filter(Boolean).join(' · ')
}

function relativeFrom(timestamp, lang, tGet) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return tGet('vabout.never')
    const diff = Date.now() - timestamp
    if (diff < MINUTE_MS) return tGet('vabout.justNow')
    const rtf = new Intl.RelativeTimeFormat(lang || 'ru', { numeric: 'auto' })
    const minutes = Math.round(diff / MINUTE_MS)
    if (minutes < 60) return rtf.format(-minutes, 'minute')
    const hours = Math.round(minutes / 60)
    if (hours < 24) return rtf.format(-hours, 'hour')
    return rtf.format(-Math.round(hours / 24), 'day')
}

/** The entry of this version from the lists written in index.html, if there is one */
function readEntry(version) {
    const bare = String(version || '').replace(/^v/i, '').replace(/-beta\.\d+$/, '')
    for (const entry of document.querySelectorAll('.changelog-source .changelog-entry')) {
        const v = entry.querySelector('.changelog-version')?.textContent.trim().replace(/^v/i, '')
        if (v !== bare) continue
        return buildEntry({
            version: v,
            date: entry.dataset.date || '',
            hl: entry.dataset.hl || '',
            items: [...entry.querySelectorAll('.changelog-list li')].map((li) => li.textContent.trim())
        })
    }
    return null
}

/**
 * @param {{ mount: HTMLElement, tGet: (key: string, params?: object) => string, getLang: () => string,
 *   ipcRenderer: { on: Function }, store: { get: Function, set: Function },
 *   getAppVersion: () => Promise<string>, openHistory: () => void }} deps
 */
function createAboutCard({ mount, tGet, getLang, ipcRenderer, store, getAppVersion, openHistory }) {
    if (!mount) return null
    mount.textContent = ''
    mount.className = 'vc'

    // ── hero: name, version, state of the update ──
    const hero = el('div', 'vc-hero')
    const logo = el('img', 'vc-logo')
    logo.src = 'assets/logo.png'
    logo.alt = 'Centrio'
    const heroText = el('div', 'vc-hero-text')
    const nameRow = el('div', 'vc-name-row')
    nameRow.append(el('span', 'vc-name', 'Centrio'))
    const versionBadge = el('span', 'vc-version', '')
    versionBadge.id = 'appVersionText'
    nameRow.append(versionBadge)
    const status = el('span', 'vc-status', tGet('settings.statusReady'))
    status.id = 'updateStatusBadge'
    status.dataset.state = 'ready'
    status.setAttribute('role', 'status')
    heroText.append(nameRow, el('div', 'vc-sub', tGet('settings.aboutDesc')), status)
    hero.append(logo, heroText)

    // ── download progress (only while a version is coming) ──
    const progress = el('div', 'vc-progress')
    progress.hidden = true
    const progressLine = el('div', 'vc-progress-line')
    const progressFill = el('i', 'vc-progress-fill')
    progressLine.append(progressFill)
    const progressText = el('span', 'vc-progress-text')
    progress.append(progressLine, progressText)

    // ── facts ──
    const facts = el('dl', 'vc-facts')
    const fact = (label) => {
        const box = el('div', 'vc-fact')
        const value = el('dd', 'vc-fact-value')
        box.append(el('dt', 'vc-fact-label', label), value)
        facts.append(box)
        return value
    }
    const releasedValue = fact(tGet('vabout.released'))
    const channelValue = fact(tGet('vabout.channel'))
    const systemValue = fact(tGet('vabout.system'))
    const checkValue = fact(tGet('vabout.lastCheck'))
    describeSystem().then((text) => { systemValue.textContent = text || '—' }).catch(() => { systemValue.textContent = '—' })

    // ── what's new ──
    const news = el('details', 'vc-news')
    const newsTitle = el('summary', 'vc-news-title')
    const newsList = el('ul', 'vc-news-list')
    news.append(newsTitle, newsList)

    // ── actions ──
    const actions = el('div', 'vc-actions')
    const checkBtn = el('button', 'vc-btn vc-btn-primary')
    checkBtn.type = 'button'
    checkBtn.id = 'checkUpdatesBtn'
    checkBtn.append(icon(ICON_REFRESH), el('span', '', tGet('settings.checkUpdatesBtn')))
    const historyBtn = el('button', 'vc-btn')
    historyBtn.type = 'button'
    historyBtn.append(icon(ICON_LIST), el('span', '', tGet('vabout.allHistory')))
    const copyBtn = el('button', 'vc-btn')
    copyBtn.type = 'button'
    const copyLabel = el('span', '', tGet('vabout.copy'))
    copyBtn.append(icon(ICON_COPY), copyLabel)
    actions.append(checkBtn, historyBtn, copyBtn)
    const auto = el('div', 'vc-auto', tGet('settings.autoUpdateNote'))

    mount.append(hero, progress, facts, news, actions, auto)

    let current = ''
    const paintCheck = () => { checkValue.textContent = relativeFrom(store.get(LAST_CHECK_KEY, 0), getLang(), tGet) }

    async function refresh() {
        try { current = String(await getAppVersion()) } catch { current = current || '' }
        versionBadge.textContent = current ? `v${current}` : ''
        const entry = readEntry(current)
        releasedValue.textContent = (entry && formatDate(entry.date)) || '—'
        channelValue.textContent = /-beta\./.test(current) ? tGet('vabout.channelBeta') : tGet('vabout.channelStable')
        newsTitle.textContent = tGet('vabout.whatsNew', { v: current ? `v${current}` : '' })
        newsList.textContent = ''
        const lines = entry ? entry.groups.flatMap((g) => g.items).slice(0, MAX_NEWS) : []
        if (!lines.length) newsList.append(el('li', 'vc-news-empty', tGet('vabout.noNotes')))
        lines.forEach((line) => newsList.append(el('li', '', line)))
        paintCheck()
    }

    // ── live state of the update, from the same channel the update strip listens to ──
    ipcRenderer.on('update-status', (data = {}) => {
        if (!data || typeof data !== 'object') return
        const { status: state = '', percent = 0 } = data
        if (['available', 'not-available', 'downloading', 'downloaded', 'error'].includes(state)) {
            store.set(LAST_CHECK_KEY, Date.now())
            paintCheck()
        }
        progress.hidden = !(state === 'downloading' || state === 'downloaded')
        if (state === 'downloading') {
            const p = Math.max(0, Math.min(100, Math.round(percent || 0)))
            progressFill.style.width = `${p}%`
            progressText.textContent = tGet('vabout.downloading', { p })
        } else if (state === 'downloaded') {
            progressFill.style.width = '100%'
            progressText.textContent = tGet('vabout.downloaded')
        }
    })
    checkBtn.addEventListener('click', () => { store.set(LAST_CHECK_KEY, Date.now()); paintCheck() })
    historyBtn.addEventListener('click', () => { openHistory() })

    copyBtn.addEventListener('click', async () => {
        const text = [`Centrio v${current}`, `${tGet('vabout.channel')}: ${channelValue.textContent}`, `${tGet('vabout.system')}: ${systemValue.textContent}`].join('\n')
        try { await navigator.clipboard.writeText(text) } catch { return }
        copyLabel.textContent = tGet('vabout.copied')
        copyBtn.classList.add('is-done')
        setTimeout(() => { copyLabel.textContent = tGet('vabout.copy'); copyBtn.classList.remove('is-done') }, COPIED_VISIBLE_MS)
    })

    refresh()
    return { refresh }
}

module.exports = { createAboutCard }
