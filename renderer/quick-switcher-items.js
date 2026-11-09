// What the quick switcher (Ctrl+K / Ctrl+P) can open (3.7.1): services, saved split screens and app actions.
// Ranking is in quick-switcher-logic.js; the window itself is the existing quick search (renderer/search-ui.js).
// Russian names people type for popular services (also found when typed in the wrong layout).
const ALIASES = {
    'telegram.org': ['телеграм', 'телега', 'тг'], 't.me': ['телеграм'], 'whatsapp.com': ['ватсап', 'вотсап', 'вацап'],
    'vk.com': ['вк', 'вконтакте'], 'max.ru': ['макс'], 'mail.google.com': ['почта', 'джимейл'],
    'mail.ru': ['почта', 'мейл'], 'mail.yandex.ru': ['почта', 'яндекс'], 'discord.com': ['дискорд'], 'slack.com': ['слак'],
    'instagram.com': ['инстаграм', 'инста'], 'viber.com': ['вайбер'], 'todoist.com': ['тудуист', 'задачи'], 'chatgpt.com': ['чатгпт', 'гпт']
}
const aliasesFor = (host) => Object.entries(ALIASES).filter(([h]) => host === h || host.endsWith(`.${h}`)).flatMap(([, words]) => words)

function createSwitcherItems({ state, store, tGet, switchTab, getSplitApi, openSettingsSection, openAssistant }) {
    const t = (key, params) => tGet(`v371.qs.${key}`, params)
    const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' } }

    function services() {
        return (state.activeMessengers || [])
            .filter((m) => !document.getElementById(`sidebar-${m.id}`)?.hidden)
            .map((m) => ({
                id: `s:${m.id}`, group: 'services', label: m.name, keywords: [hostOf(m.url), ...aliasesFor(hostOf(m.url))], icon: m.icon || '',
                badge: state.unreadCounts?.[m.id] || 0,
                run: () => switchTab(m.id)
            }))
    }

    function presets() {
        const split = getSplitApi?.()
        return (split?.getPresets?.() || []).map((p) => ({
            id: `p:${p.id}`, group: 'presets', label: p.name || t('presetUnnamed'), keywords: [t('presetWord')],
            run: () => split.applyPreset(p.id)
        }))
    }

    function actions() {
        const hib = window.__centrioHibernation
        const dnd = window.__centrioDnd
        const list = [
            { key: 'settings', run: () => openSettingsSection('general') },
            { key: 'notifications', run: () => openSettingsSection('notifications') },
            { key: 'workHours', run: () => openSettingsSection('notifications') },
            { key: 'tabSleep', run: () => openSettingsSection('system') },
            { key: 'restorePoints', run: () => openSettingsSection('system') },
            { key: 'shortcuts', run: () => openSettingsSection('shortcuts') },
            { key: 'assistant', run: () => openAssistant() },
            { key: 'summary', run: () => window.__centrioMorningSummary?.showNow() },
            { key: 'tabManager', run: () => document.dispatchEvent(new CustomEvent('centrio-shortcut', { detail: { action: 'tabManager' } })) }
        ]
        if (dnd) list.push(dnd.isActive() ? { key: 'dndOff', run: () => dnd.stop() } : { key: 'dndOn', run: () => dnd.start(1) })
        if (hib) list.push({ key: 'sleepNow', run: () => (state.activeMessengers || []).forEach((m) => { if ((state.unreadCounts?.[m.id] || 0) === 0 && !m.orgAssigned) window.__centrioSleepTab?.(m.id) }) })
        return list.map((a) => ({
            id: `a:${a.key}`, group: 'actions', label: t(`${a.key}`), keywords: String(t(`${a.key}Kw`)).split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('v371.')),
            run: a.run
        }))
    }

    return () => [...services(), ...presets(), ...actions()]
}

module.exports = { createSwitcherItems }
