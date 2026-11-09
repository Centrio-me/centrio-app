// Pure parts of screen sharing (3.7.3): what the picker shows and what the page gets. No Electron here, so tested.
'use strict'

const dataUrl = (image) => {
    try { return image && !image.isEmpty() ? image.toDataURL() : '' } catch { return '' }
}

/**
 * desktopCapturer sources -> picker items. Windows without a name or a picture are system leftovers: dropped.
 * @param {Array<{id:string,name:string,thumbnail:any,appIcon:any}>} sources
 * @param {{screenLabel?: string}} [options] e.g. 'Экран {n}'
 */
function toPickerItems(sources, { screenLabel = 'Screen {n}' } = {}) {
    let n = 0
    return (Array.isArray(sources) ? sources : [])
        .map((s) => {
            const kind = String(s && s.id).startsWith('screen:') ? 'screen' : 'window'
            const thumbnail = dataUrl(s && s.thumbnail)
            if (kind === 'window' && (!s.name || !thumbnail)) return null
            if (kind === 'screen') n++
            return {
                id: s.id,
                kind,
                name: kind === 'screen' ? screenLabel.replace('{n}', String(n)) : String(s.name).slice(0, 120),
                thumbnail,
                icon: kind === 'window' ? dataUrl(s.appIcon) : ''
            }
        })
        .filter(Boolean)
}

/**
 * The picker's answer -> what setDisplayMediaRequestHandler's callback gets, or null to share nothing.
 * The sound of the computer (loopback) exists on Windows only.
 */
function resolveChoice(sources, choice, platform) {
    if (!choice || typeof choice.id !== 'string') return null
    const source = (sources || []).find((s) => s.id === choice.id)
    if (!source) return null
    return choice.audio === true && platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source }
}

module.exports = { toPickerItems, resolveChoice }
