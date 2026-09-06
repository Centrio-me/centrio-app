function bindAddModalUi({
    state,
    PAGE_SIZE,
    popularMessengers,
    addModal,
    closeModal,
    openModal,
    fillMessengerGrid,
    updateScrollProgress,
    addMessenger,
    requirePro,
    tGet,
    freeMessengerLimit
}) {
    // Превентивная блокировка: раньше лимит проверялся только внутри
    // addMessenger() — пользователь открывал модалку выбора сервиса, выбирал
    // что-то, и только тогда узнавал что уперся в лимит. Теперь плюсик сам
    // не открывает модалку при достижении лимита, показывает апгрейд сразу.
    document.getElementById('addMessengerBtn')?.addEventListener('click', () => {
        if (state.activeMessengers.length >= freeMessengerLimit && !requirePro('messengerLimit')) return
        openModal()
    })
    document.getElementById('welcomeAddBtn')?.addEventListener('click', () => openModal())
    document.getElementById('closeModalBtn')?.addEventListener('click', () => closeModal())

    // REDESIGN (2026-08-24) — раньше здесь колесо мыши перехватывалось
    // (e.preventDefault()) и листало плитки целыми страницами, что и вызвало
    // жалобу пользователя на "другую прокрутку". Теперь #modalGridWrap — это
    // обычный overflow-y:auto контейнер с нативной прокруткой (см. CSS и
    // разметку в index.html), а тут только обновляем тонкую шкалу прогресса
    // над сеткой в такт скроллу.
    document.getElementById('modalGridWrap')?.addEventListener('scroll', () => {
        updateScrollProgress?.()
    }, { passive: true })

    document.getElementById('modalSearchInput')?.addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim()
        state.modalFiltered = q
            ? popularMessengers.filter(m => m.name.toLowerCase().includes(q))
            : [...popularMessengers]
        fillMessengerGrid()
    })

    document.getElementById('customToggleBtn')?.addEventListener('click', () => {
        document.getElementById('customSection')?.classList.toggle('open')
    })

    document.getElementById('addCustomBtn')?.addEventListener('click', () => {
        // Добавление своего мессенджера — только для PRO
        if (requirePro && !requirePro('customMessenger')) return

        const name = document.getElementById('customName')?.value.trim()
        const url = document.getElementById('customUrl')?.value.trim()

        if (!name || !url) {
            alert(tGet('errors.fillAll'))
            return
        }

        if (!url.startsWith('http')) {
            alert(tGet('errors.httpOnly'))
            return
        }

        let hostname = ''
        try {
            hostname = new URL(url).hostname
        } catch {
            alert(tGet('errors.badUrl'))
            return
        }

        addMessenger({
            name,
            url,
            icon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
            color: '#7b68ee'
        })

        closeModal()

        const customName = document.getElementById('customName')
        const customUrl = document.getElementById('customUrl')
        if (customName) customName.value = ''
        if (customUrl) customUrl.value = ''
    })

    addModal?.addEventListener('click', (e) => {
        if (e.target === addModal) closeModal()
    })
}

module.exports = {
    bindAddModalUi
}