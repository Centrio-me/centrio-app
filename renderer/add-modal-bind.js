function bindAddModalUi({
    state,
    PAGE_SIZE,
    popularMessengers,
    addModal,
    closeModal,
    openModal,
    fillMessengerGrid,
    updateScrollProgress,
    onSearchInput,
    onSearchEnter,
    addMessenger,
    requirePro,
    tGet,
    freeMessengerLimit
}) {
    // Превентивная блокировка: раньше лимит проверялся только внутри
    // addMessenger() — пользователь открывал модалку выбора сервиса, выбирал
    // что-то, и только тогда узнавал что уперся в лимит. Теперь плюсик сам
    // не открывает модалку при достижении лимита, показывает апгрейд сразу.
    // FEATURE (2026-09-17, live request — "Даже галка нужна - может
    // добавлять свои или нет"): owner-controlled lock, synced into
    // state.orgCanAddOwnMessengers by renderer/org-team.js. Checked before
    // the modal opens at all (same pattern as the Pro/free-limit check
    // right below it) rather than inside addMessenger(), since the modal
    // itself has nothing to gate once it's already open.
    const orgAddLocked = () => state.orgCanAddOwnMessengers === false

    document.getElementById('addMessengerBtn')?.addEventListener('click', () => {
        if (orgAddLocked()) return
        if (state.activeMessengers.length >= freeMessengerLimit && !requirePro('messengerLimit')) return
        openModal()
    })
    document.getElementById('welcomeAddBtn')?.addEventListener('click', () => {
        if (orgAddLocked()) return
        openModal()
    })
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

    // Search / paste-a-link field: filtering and "custom site" detection live
    // in renderer/add-modal-ui.js.
    const searchInput = document.getElementById('modalSearchInput')
    searchInput?.addEventListener('input', (e) => onSearchInput?.(e.target.value))
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); onSearchEnter?.() }
    })
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && addModal?.classList.contains('show')) closeModal()
    })

    addModal?.addEventListener('click', (e) => {
        if (e.target === addModal) closeModal()
    })
}

module.exports = {
    bindAddModalUi
}