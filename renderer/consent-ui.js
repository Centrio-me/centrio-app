// Согласие на обработку персональных данных при регистрации (152-ФЗ, 2026-10-02).
// Галочка стоит в двух формах (экран первого запуска и окно аккаунта). Регистрация
// по e-mail и вход через Google/Яндекс (при нём создаётся аккаунт) требуют отметки;
// обычный вход по e-mail — нет. Текст и ссылки собираются из локалей при каждом
// applyI18n(), поэтому смена языка подхватывается сама.
const CONSENT_URL = 'https://centrio.me/consent'
const TERMS_URL = 'https://centrio.me/terms'

function renderConsentLabels(tGet) {
    document.querySelectorAll('.app-consent [data-consent-text]').forEach((span) => {
        const parts = String(tGet('cloud.consentText')).split(/(\{consent\}|\{terms\})/)
        span.textContent = ''
        for (const part of parts) {
            if (part === '{consent}' || part === '{terms}') {
                const isConsent = part === '{consent}'
                const a = document.createElement('a')
                a.href = '#'
                a.dataset.url = isConsent ? CONSENT_URL : TERMS_URL
                a.textContent = tGet(isConsent ? 'cloud.consentLinkConsent' : 'cloud.consentLinkTerms')
                span.appendChild(a)
            } else if (part) {
                span.appendChild(document.createTextNode(part))
            }
        }
    })
}

let linksBound = false
function bindConsentLinks() {
    if (linksBound) return
    linksBound = true
    document.addEventListener('click', (event) => {
        const link = event.target?.closest?.('.app-consent a[data-url]')
        if (!link) return
        event.preventDefault()
        window.electronAPI?.openExternal?.(link.dataset.url)
    })
}

/** true, если отмечено; иначе показывает ошибку в errorEl и возвращает false. */
function requireConsent(checkboxId, errorEl, tGet) {
    const box = document.getElementById(checkboxId)
    if (box && box.checked) return true
    if (errorEl) {
        errorEl.textContent = tGet('cloud.consentRequired')
        errorEl.style.display = 'block'
    }
    return false
}

module.exports = { renderConsentLabels, bindConsentLinks, requireConsent }
