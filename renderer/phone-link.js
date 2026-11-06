'use strict'
// The phone link: pair a phone by QR, send it the message feed (end-to-end encrypted) and carry out replies typed on it.
//
// The keys and the sealing live in the main process (main/services/e2e.js); the renderer only sees the QR text, the names
// of the paired phones and sealed packets. A reply is only ever sent to a notification THIS computer showed a moment ago
// (the `feedRefs` below), through the same code that answers from a notification pop-up, so the phone cannot make the
// computer write to a chat of its own choosing.
const QRCode = require('qrcode-generator')
const { sendReply } = require('./notif-reply')

const PHONES_POLL_MS = 20 * 1000
const REPLIES_POLL_MS = 4 * 1000
const PAIRING_POLL_MS = 2 * 1000
const REF_KEEP = 300
const REF_TTL_MS = 48 * 3600 * 1000
const MAX_REPLY_LEN = 2000

const unwrap = (r) => (r && r.success === true && 'data' in r ? r.data : r)

function createPhoneLinkApi({ state, cloudStore, cloudApi, invokeIpc, tGet, hasEffectivePro, getMessenger }) {
    const t = (key, fallback) => tGet('phoneLink.' + key) || fallback
    let trusted = [] // [{deviceId, name}] phones this computer has accepted
    const feedRefs = new Map() // ref -> what a reply needs
    const handledReplies = new Set()
    let repliesBusy = false
    let started = false

    const active = () => !!(cloudStore.isLoggedIn() && hasEffectivePro())

    function newRef() {
        const bytes = new Uint8Array(12)
        crypto.getRandomValues(bytes)
        return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    }

    function pruneRefs() {
        const cutoff = Date.now() - REF_TTL_MS
        for (const [ref, ctx] of feedRefs) if (ctx.at < cutoff) feedRefs.delete(ref)
        while (feedRefs.size > REF_KEEP) feedRefs.delete(feedRefs.keys().next().value)
    }

    // ── Phones ──────────────────────────────────────────────────────────────
    async function refreshPhones() {
        if (!active()) { trusted = []; renderList(); return }
        const response = await cloudApi.cloudE2e('phones')
        if (!response || !response.success) return
        const serverPhones = (response.data && response.data.phones) || []
        const synced = unwrap(await invokeIpc('e2e:sync-phones', serverPhones)) || {}
        for (const deviceId of synced.newlyTrusted || []) await cloudApi.cloudE2e('confirm', deviceId)
        trusted = synced.phones || []
        renderList()
    }

    async function unpair(deviceId) {
        await cloudApi.cloudE2e('unpair', deviceId)
        const left = unwrap(await invokeIpc('e2e:forget', deviceId)) || {}
        trusted = left.phones || []
        renderList()
    }

    // ── The feed ────────────────────────────────────────────────────────────
    async function pushFeedItem(item) {
        if (!trusted.length || !active()) return
        const title = String(item.title || '').trim().slice(0, 200)
        const body = String(item.body || '').trim().slice(0, 1000)
        if (!item.messengerName || (!title && !body)) return
        const ref = newRef()
        const sealed = unwrap(await invokeIpc('e2e:seal-feed', ref, JSON.stringify({ title, body }))) || {}
        if (!sealed.payloads || !sealed.payloads.length) return
        feedRefs.set(ref, { messengerId: item.messengerId, nid: item.nid || '', peer: item.peer || '', title, body, canReply: !!item.canReply, at: Date.now() })
        pruneRefs()
        await cloudApi.cloudPushFeedItem({
            ref,
            messengerId: item.messengerId,
            messengerName: item.messengerName,
            canReply: !!(item.canReply && item.nid),
            payloads: sealed.payloads
        })
    }

    // ── Replies typed on the phone ──────────────────────────────────────────
    async function pollReplies() {
        if (repliesBusy || !trusted.length || !active()) return
        repliesBusy = true
        try {
            const response = await cloudApi.cloudE2e('replies')
            const replies = (response && response.success && response.data && response.data.replies) || []
            for (const reply of replies.slice(0, 5)) {
                if (!reply || handledReplies.has(reply.id)) continue
                handledReplies.add(reply.id)
                const status = await carryOut(reply)
                await cloudApi.cloudE2e('reply-result', reply.id, status)
            }
        } catch (e) {
            console.error('[phone-link] replies error:', e)
        } finally {
            repliesBusy = false
        }
    }

    async function carryOut(reply) {
        const opened = unwrap(await invokeIpc('e2e:open-reply', reply)) || {}
        const text = typeof opened.text === 'string' ? opened.text.replace(/\r\n?/g, '\n').trim().slice(0, MAX_REPLY_LEN) : ''
        if (!text) return 'FAILED' // not from a paired phone, damaged, or empty
        const ctx = feedRefs.get(reply.ref)
        if (!ctx || !ctx.canReply || !ctx.nid) return 'FAILED'
        const messenger = getMessenger(ctx.messengerId)
        if (!messenger) return 'FAILED'
        try {
            const outcome = await sendReply(messenger, ctx.nid, text, { title: ctx.title, body: ctx.body, peer: ctx.peer })
            return outcome === 'ok' ? 'SENT' : 'FAILED'
        } catch {
            return 'FAILED'
        }
    }

    // ── The account window: the "Phone" section and the QR window ───────────
    let sectionEl = null

    function mountSection() {
        if (sectionEl) return
        const promo = document.getElementById('cpPromoSection')
        if (!promo || !promo.parentNode) return
        sectionEl = document.createElement('div')
        sectionEl.className = 'cp-phone-section'
        sectionEl.id = 'cpPhoneSection'
        sectionEl.innerHTML = `
            <div class="cp-section-label"><span>${t('title', 'Телефон')}</span></div>
            <div class="cp-phone-desc">${t('desc', 'Привяжите телефон по QR-коду: новые сообщения придут в приложение, а ответить на них можно прямо с телефона. Всё шифруется между вашими устройствами, сервер текст не читает.')}</div>
            <div id="cpPhoneList" class="cp-phone-list"></div>
            <button type="button" id="cpPhonePairBtn" class="cp-promo-btn cp-phone-pair-btn">${t('pair', 'Привязать телефон')}</button>
            <div id="cpPhoneMsg" class="cp-promo-msg" style="display:none;"></div>`
        promo.parentNode.insertBefore(sectionEl, promo)
        sectionEl.querySelector('#cpPhonePairBtn').addEventListener('click', openPairing)
        renderList()
    }

    function showMsg(text) {
        const el = document.getElementById('cpPhoneMsg')
        if (!el) return
        el.textContent = text
        el.style.display = text ? '' : 'none'
    }

    function renderList() {
        const list = document.getElementById('cpPhoneList')
        if (!list) return
        list.textContent = ''
        for (const phone of trusted) {
            const row = document.createElement('div')
            row.className = 'cp-phone-row'
            const name = document.createElement('span')
            name.className = 'cp-phone-name'
            name.textContent = phone.name || t('phone', 'Телефон')
            const remove = document.createElement('button')
            remove.type = 'button'
            remove.className = 'cp-phone-remove'
            remove.textContent = t('unpair', 'Отвязать')
            remove.addEventListener('click', () => unpair(phone.deviceId))
            row.append(name, remove)
            list.appendChild(row)
        }
    }

    let pairingModal = null
    let pairingTimer = null

    function closePairing() {
        clearInterval(pairingTimer)
        pairingTimer = null
        if (pairingModal) pairingModal.classList.remove('show')
    }

    async function openPairing() {
        showMsg('')
        if (!active()) { showMsg(t('needPro', 'Привязка телефона доступна на тарифах Pro и Team.')); return }
        const user = cloudStore.getUser()
        const begun = unwrap(await invokeIpc('e2e:begin-pairing', user && user.id)) || {}
        if (!begun.qr) { showMsg(t('failed', 'Не удалось подготовить QR-код.')); return }

        const code = QRCode(0, 'M')
        code.addData(begun.qr)
        code.make()

        if (!pairingModal) {
            pairingModal = document.createElement('div')
            pairingModal.className = 'modal phone-link-modal'
            pairingModal.addEventListener('click', (e) => { if (e.target === pairingModal) closePairing() })
            document.body.appendChild(pairingModal)
        }
        const before = new Set(trusted.map(p => p.deviceId))
        pairingModal.innerHTML = `
            <div class="phone-link-card">
                <h3>${t('modalTitle', 'Привязка телефона')}</h3>
                <img class="phone-link-qr" alt="QR" src="${code.createDataURL(5, 12)}">
                <ol class="phone-link-steps">
                    <li>${t('step1', 'Откройте Centrio на телефоне: «Настройки» → «Привязать к компьютеру».')}</li>
                    <li>${t('step2', 'Наведите камеру на этот код. Он действует 10 минут.')}</li>
                </ol>
                <div class="phone-link-status" id="phoneLinkStatus">${t('waiting', 'Жду телефон…')}</div>
                <button type="button" class="cp-promo-btn" id="phoneLinkClose">${t('close', 'Закрыть')}</button>
            </div>`
        pairingModal.querySelector('#phoneLinkClose').addEventListener('click', closePairing)
        pairingModal.classList.add('show')

        clearInterval(pairingTimer)
        const expiresAt = begun.expiresAt || Date.now() + 10 * 60 * 1000
        pairingTimer = setInterval(async () => {
            if (Date.now() > expiresAt) { closePairing(); return }
            await refreshPhones()
            const added = trusted.find(p => !before.has(p.deviceId))
            const status = document.getElementById('phoneLinkStatus')
            if (added && status) {
                status.textContent = t('paired', 'Готово: ') + (added.name || t('phone', 'Телефон'))
                clearInterval(pairingTimer)
                pairingTimer = null
                setTimeout(closePairing, 1800)
            }
        }, PAIRING_POLL_MS)
    }

    function start() {
        if (started) return
        started = true
        mountSection()
        refreshPhones()
        setInterval(() => { mountSection(); refreshPhones() }, PHONES_POLL_MS)
        setInterval(pollReplies, REPLIES_POLL_MS)
    }

    return { start, pushFeedItem, openPairing, refreshPhones }
}

module.exports = { createPhoneLinkApi }
