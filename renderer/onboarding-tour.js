// Ознакомительный тур для новых пользователей — короткий спотлайт-обход
// нескольких ключевых кнопок тулбара (добавить мессенджер, горячие клавиши,
// настройки, VPN, история изменений). Показывается один раз автоматически
// (флаг settings.onboardingSeen), либо вручную из настроек ("Показать тур снова").
//
// Технически основано на том же паттерне, что и остальные попапы в проекте
// (colorPickerModal, changelogPopup): один статичный DOM-узел в index.html,
// показ/скрытие через style.display, позиционирование через getBoundingClientRect().
function createOnboardingTourApi({ store, tGet }) {
    const overlay = document.getElementById('onboardingTour')
    const spotlight = document.getElementById('onboardingSpotlight')
    const card = document.getElementById('onboardingCard')
    const titleEl = document.getElementById('onboardingTitle')
    const descEl = document.getElementById('onboardingDesc')
    const dotsEl = document.getElementById('onboardingDots')
    const skipBtn = document.getElementById('onboardingSkipBtn')
    const nextBtn = document.getElementById('onboardingNextBtn')

    // Каждый шаг указывает на реально существующий элемент тулбара — если элемент
    // не найден в DOM (скрыт фичей/темой) или недоступен, шаг просто пропускается.
    const steps = [
        { selector: '#addMessengerBtn', titleKey: 'onboarding.step1Title', descKey: 'onboarding.step1Desc' },
        { selector: '#settingsBtn',     titleKey: 'onboarding.step3Title', descKey: 'onboarding.step3Desc' },
        { selector: '#vpnBtn',          titleKey: 'onboarding.step4Title', descKey: 'onboarding.step4Desc' },
        { selector: '#statusVersion',   titleKey: 'onboarding.step5Title', descKey: 'onboarding.step5Desc' }
    ]

    let activeSteps = []
    let idx = 0

    function isVisible(el) {
        if (!el) return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
    }

    function markSeen() {
        const settings = store.get('settings', {}) || {}
        store.set('settings', { ...settings, onboardingSeen: true })
    }

    function finish() {
        overlay.style.display = 'none'
        markSeen()
    }

    function renderDots() {
        dotsEl.innerHTML = ''
        activeSteps.forEach((_, i) => {
            const dot = document.createElement('div')
            dot.className = 'onboarding-dot' + (i === idx ? ' active' : '')
            dotsEl.appendChild(dot)
        })
    }

    function renderStep() {
        const step = activeSteps[idx]
        if (!step) { finish(); return }

        const target = document.querySelector(step.selector)
        if (!target || !isVisible(target)) {
            // Цель недоступна прямо сейчас (например, VPN-кнопка скрыта) — пропускаем шаг.
            idx++
            renderStep()
            return
        }

        const rect = target.getBoundingClientRect()
        const pad = 6
        spotlight.style.top = `${rect.top - pad}px`
        spotlight.style.left = `${rect.left - pad}px`
        spotlight.style.width = `${rect.width + pad * 2}px`
        spotlight.style.height = `${rect.height + pad * 2}px`

        titleEl.textContent = tGet(step.titleKey)
        descEl.textContent = tGet(step.descKey)
        nextBtn.textContent = idx === activeSteps.length - 1 ? tGet('onboarding.done') : tGet('onboarding.next')
        renderDots()

        // Карточку располагаем справа от подсвеченного элемента (тулбар обычно
        // слева/сверху), с запасным вариантом ниже, если не хватает места по ширине.
        const cardWidth = 300
        const margin = 16
        let top = rect.top
        let left = rect.right + margin

        if (left + cardWidth > window.innerWidth - margin) {
            left = rect.left
            top = rect.bottom + margin
        }
        if (top + 160 > window.innerHeight - margin) {
            top = Math.max(margin, window.innerHeight - 160 - margin)
        }

        card.style.top = `${top}px`
        card.style.left = `${left}px`
    }

    function next() {
        idx++
        if (idx >= activeSteps.length) finish()
        else renderStep()
    }

    function isLockScreenActive() {
        // Тур не должен показываться поверх экрана блокировки (PIN) — его
        // оверлей рисуется с более высоким z-index, чем lock-screen, и не
        // просто перекрывает его визуально, а блокирует клики по PIN-паду,
        // не давая войти в приложение вообще.
        if (document.body.classList.contains('startup-locked')) return true
        const lockScreen = document.getElementById('lockScreen')
        return !!lockScreen && lockScreen.style.display !== 'none' && lockScreen.offsetParent !== null
    }

    function start(force = false) {
        const settings = store.get('settings', {}) || {}
        if (!force && settings.onboardingSeen) return
        if (isLockScreenActive()) return

        activeSteps = steps.filter(s => isVisible(document.querySelector(s.selector)))
        if (!activeSteps.length) {
            if (!force) markSeen()
            return
        }

        idx = 0
        overlay.style.display = 'block'
        renderStep()
    }

    function bind() {
        nextBtn?.addEventListener('click', () => next())
        skipBtn?.addEventListener('click', () => finish())
    }

    return {
        start,
        bind
    }
}

module.exports = {
    createOnboardingTourApi
}
