// A team account made by the owner with a login and a password has no email. In the profile (overview tab) such an account
// sees a card «Привяжите почту»: type a mailbox → a code goes to it → type the code → the real email replaces the stand-in
// one. With an email the person can restore the password alone (shared/login-account.js decides who sees the card).
'use strict'

const { shouldOfferEmailAttach } = require('../shared/login-account')

const CODE_LENGTH = 6
const RESEND_SECONDS = 45

function createLoginAccountCard({ cloudApi, cloudStore, tGet }) {
    const host = () => document.getElementById('lkLoginAccount')
    const t = (key, params) => tGet(`loginAcc.${key}`, params)
    let sentTo = ''
    let busy = false
    let resendTimer = null
    let statusText = ''
    let countdownOnRender = false

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    function stopTimer() {
        if (resendTimer) { clearInterval(resendTimer); resendTimer = null }
    }

    function render() {
        const box = host()
        if (!box) return
        stopTimer()
        box.textContent = ''
        if (!shouldOfferEmailAttach(cloudStore.getUser())) { box.hidden = true; return }
        box.hidden = false

        const card = el('div', 'lk-band lk-band--attach')
        const main = el('div', 'lk-band-main')
        main.append(el('div', 'lk-summary-title', t('cardTitle')), el('p', 'lk-note', t('cardLead')))

        const form = el('div', 'la-form')
        const emailInput = el('input')
        emailInput.type = 'email'
        emailInput.id = 'lkAttachEmail'
        emailInput.autocomplete = 'email'
        emailInput.placeholder = t('emailPh')
        emailInput.value = sentTo
        emailInput.disabled = !!sentTo
        const codeInput = el('input', 'la-code')
        codeInput.id = 'lkAttachCode'
        codeInput.inputMode = 'numeric'
        codeInput.maxLength = CODE_LENGTH
        codeInput.autocomplete = 'one-time-code'
        codeInput.placeholder = t('codePh')
        codeInput.hidden = !sentTo
        const message = el('div', 'la-note', statusText)
        message.id = 'lkAttachMsg'
        message.setAttribute('role', 'status')
        const error = el('div', 'la-error')
        error.id = 'lkAttachError'
        error.setAttribute('role', 'alert')
        error.hidden = true
        const sendBtn = el('button', 'lk-btn lk-btn--small', sentTo ? t('confirm') : t('sendCode'))
        sendBtn.type = 'button'
        sendBtn.id = 'lkAttachBtn'
        const againBtn = el('button', 'lk-btn lk-btn--ghost lk-btn--small', t('sendCode'))
        againBtn.type = 'button'
        againBtn.hidden = !sentTo
        againBtn.disabled = true

        const showError = (text) => { error.textContent = text || ''; error.hidden = !text }
        const setBusy = (value) => { busy = value; sendBtn.disabled = value }

        function startResendCountdown() {
            let left = RESEND_SECONDS
            againBtn.disabled = true
            againBtn.textContent = `${t('sendCode')} (${left})`
            resendTimer = setInterval(() => {
                left -= 1
                if (left <= 0) { stopTimer(); againBtn.disabled = false; againBtn.textContent = t('sendCode'); return }
                againBtn.textContent = `${t('sendCode')} (${left})`
            }, 1000)
        }

        async function sendCode(email) {
            if (!email) { showError(t('enterEmail')); return }
            showError('')
            setBusy(true)
            sendBtn.textContent = t('sending')
            const result = await cloudApi.authorizedInvoke('api-email-attach-start', email)
            setBusy(false)
            if (!result.success) {
                sendBtn.textContent = sentTo ? t('confirm') : t('sendCode')
                showError(result.error || '')
                return
            }
            sentTo = email
            statusText = t('sentTo', { email })
            countdownOnRender = true
            render()
            const input = host() && host().querySelector('#lkAttachCode')
            if (input) input.focus()
        }

        async function confirm() {
            const code = codeInput.value.replace(/\s/g, '')
            if (code.length !== CODE_LENGTH) { showError(t('enterCode')); return }
            showError('')
            setBusy(true)
            const result = await cloudApi.authorizedInvoke('api-email-attach-confirm', code)
            setBusy(false)
            if (!result.success) { showError(result.error || ''); return }
            sentTo = ''
            statusText = ''
            const user = await cloudApi.refreshUser()
            const line = document.getElementById('cloudUserEmail')
            if (line && user) line.textContent = user.email || ''
            stopTimer()
            const fresh = host()
            if (fresh) {
                fresh.textContent = ''
                fresh.hidden = false
                fresh.append(el('div', 'la-note', t('done')))
                setTimeout(() => { fresh.textContent = ''; fresh.hidden = true }, 8000)
            }
        }

        sendBtn.addEventListener('click', () => { if (!busy) (sentTo ? confirm() : sendCode(emailInput.value.trim())) })
        againBtn.addEventListener('click', () => { if (!busy && !againBtn.disabled) sendCode(sentTo) })
        for (const input of [emailInput, codeInput]) {
            input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); sendBtn.click() } })
        }

        form.append(emailInput, codeInput, message, error, el('div', 'la-row', ''))
        form.lastChild.append(sendBtn, againBtn)
        main.append(form)
        card.append(main)
        box.append(card)
        if (sentTo && countdownOnRender) { countdownOnRender = false; startResendCountdown() }
    }

    document.addEventListener('cloud-profile-shown', render)
    return { render }
}

module.exports = { createLoginAccountCard }
