function bindLockUi({
    state,
    isPasswordEnabled,
    showLockScreen,
    updateLockDots,
    tryUnlock,
    showForgotPinConfirm,
    handlePinInput,
    setActivePinBlock,
    savePinClick,
    resetPinSetup,
    updateSetPinDots,
    updateDisableDots,
    tryDisablePin,
    closePinDisableModal
}) {
    document.querySelectorAll('.lock-key[data-digit]').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = document.getElementById('lockInput')
            if (!input) return

            if (input.value.length < 4) {
                input.value += btn.dataset.digit
                updateLockDots(input.value)
                if (input.value.length === 4) setTimeout(() => tryUnlock(), 120)
            }
        })
    })

    document.getElementById('lockClearBtn')?.addEventListener('click', () => {
        const input = document.getElementById('lockInput')
        if (!input) return

        input.value = input.value.slice(0, -1)
        updateLockDots(input.value)

        const err = document.getElementById('lockError')
        if (err) err.style.display = 'none'
    })

    document.getElementById('lockSubmitBtn')?.addEventListener('click', () => tryUnlock())

    document.getElementById('lockInput')?.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4)
        updateLockDots(e.target.value)
        if (e.target.value.length === 4) setTimeout(() => tryUnlock(), 120)
    })

    document.getElementById('lockInput')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') tryUnlock()
        if (e.key === 'Backspace') {
            setTimeout(() => {
                const input = document.getElementById('lockInput')
                if (input) updateLockDots(input.value)
            }, 0)
        }
    })

    document.getElementById('lockBtn')?.addEventListener('click', () => {
        if (isPasswordEnabled()) showLockScreen()
    })

    document.getElementById('forgotPinBtn')?.addEventListener('click', () => showForgotPinConfirm())

    const pinInputNew = document.getElementById('_pinInputNew')
    const pinInputConfirm = document.getElementById('_pinInputConfirm')
    const pinDisableInput = document.getElementById('_pinDisableInput')

    pinInputNew?.addEventListener('input', () => handlePinInput(pinInputNew, 'new'))
    pinInputConfirm?.addEventListener('input', () => handlePinInput(pinInputConfirm, 'confirm'))

    pinInputNew?.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault()
            setActivePinBlock('confirm')
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            savePinClick()
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            resetPinSetup()
        }
    })

    pinInputConfirm?.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault()
            setActivePinBlock('new')
        }
        if (e.key === 'Enter') {
            e.preventDefault()
            savePinClick()
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            resetPinSetup()
        }
        if (e.key === 'Backspace' && state.pinConfirmVal.length === 0) {
            e.preventDefault()
            setActivePinBlock('new')
        }
    })

    // Clicking the dots must always bring the typing back to that field.
    document.getElementById('setPinDotsNew')?.addEventListener('click', () => setActivePinBlock('new'))
    document.getElementById('setPinDotsConfirm')?.addEventListener('click', () => setActivePinBlock('confirm'))

    pinInputNew?.addEventListener('blur', () => {
        setTimeout(() => {
            const focused = document.activeElement
            if (focused !== pinInputNew && focused !== pinInputConfirm) {
                state.pinActive = null
                document.getElementById('setPinDotsNew')?.classList.remove('active')
                document.getElementById('setPinDotsConfirm')?.classList.remove('active')
                updateSetPinDots(state.pinNewVal, 'setPinDot')
                updateSetPinDots(state.pinConfirmVal, 'setConfirmDot')
            }
        }, 100)
    })

    pinInputConfirm?.addEventListener('blur', () => {
        setTimeout(() => {
            const focused = document.activeElement
            if (focused !== pinInputNew && focused !== pinInputConfirm) {
                state.pinActive = null
                document.getElementById('setPinDotsNew')?.classList.remove('active')
                document.getElementById('setPinDotsConfirm')?.classList.remove('active')
                updateSetPinDots(state.pinNewVal, 'setPinDot')
                updateSetPinDots(state.pinConfirmVal, 'setConfirmDot')
            }
        }, 100)
    })

    document.getElementById('setPinDotsNew')?.addEventListener('mousedown', (e) => {
        e.preventDefault()
        setActivePinBlock('new')
    })

    document.getElementById('setPinDotsConfirm')?.addEventListener('mousedown', (e) => {
        e.preventDefault()
        setActivePinBlock('confirm')
    })

    document.addEventListener('mousedown', (e) => {
        const card = document.querySelector('.pin-setup-card')
        if (!card) return

        if (!card.contains(e.target) && e.target.id !== 'savePasswordBtn') {
            state.pinActive = null
            document.getElementById('setPinDotsNew')?.classList.remove('active')
            document.getElementById('setPinDotsConfirm')?.classList.remove('active')
            updateSetPinDots(state.pinNewVal, 'setPinDot')
            updateSetPinDots(state.pinConfirmVal, 'setConfirmDot')
        }
    })

    document.getElementById('savePasswordBtn')?.addEventListener('click', savePinClick)

    pinDisableInput?.addEventListener('input', () => {
        const raw = pinDisableInput.value.replace(/[^0-9]/g, '').slice(0, 4)
        pinDisableInput.value = raw
        state.disableVal = raw
        updateDisableDots(raw)
        if (raw.length === 4) setTimeout(() => tryDisablePin(), 120)
    })

    pinDisableInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault()
            tryDisablePin()
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            closePinDisableModal(true)
        }
    })

    document.querySelectorAll('[data-disable-digit]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.disableVal.length < 4) {
                state.disableVal += btn.dataset.disableDigit
                if (pinDisableInput) pinDisableInput.value = state.disableVal
                updateDisableDots(state.disableVal)
                if (state.disableVal.length === 4) setTimeout(() => tryDisablePin(), 120)
            }
        })
    })

    document.getElementById('disableClearBtn')?.addEventListener('click', () => {
        state.disableVal = state.disableVal.slice(0, -1)
        if (pinDisableInput) pinDisableInput.value = state.disableVal
        updateDisableDots(state.disableVal)

        const err = document.getElementById('pinDisableError')
        if (err) err.style.display = 'none'
    })

    document.getElementById('disableConfirmBtn')?.addEventListener('click', () => tryDisablePin())
    document.getElementById('pinDisableCancelBtn')?.addEventListener('click', () => closePinDisableModal(true))

    document.getElementById('pinDisableModal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('pinDisableModal')) closePinDisableModal(true)
    })
}

module.exports = {
    bindLockUi
}