// One-time message after the servers were rebuilt (3.5.3): what happened, that some data was lost, that support
// will sort it out, and the 7 gift days for paying customers. Shown once per computer; the button opens support.
const FLAG = 'outageNotice20261104'
const SHOW_DELAY_MS = 2500

const TEXTS = {
    ru: {
        title: 'Centrio снова работает после сбоя',
        body: 'Несколько дней наши серверы были недоступны из-за сбоя у хостинг-провайдера. Часть данных — в основном регистрации и платежи последних недель — потеряна. Наша команда восстанавливает всё, что возможно. Если ваш аккаунт пропал или слетела оплата, напишите в поддержку — обращения из приложения и из личного кабинета на сайте мы рассматриваем в течение часа.',
        gift: 'Всем, кто оплачивал подписку, мы уже добавили 7 дней в подарок.',
        cta: 'Написать в поддержку',
        close: 'Закрыть'
    },
    en: {
        title: 'Centrio is back after an outage',
        body: 'For several days our servers were unavailable because of a failure at our hosting provider. Some data, mostly sign-ups and payments from the last weeks, was lost. Our team is restoring everything we can. If your account is missing or your payment disappeared, contact support — requests sent from the app or from your account on the website are answered within an hour.',
        gift: 'Everyone who had paid for a subscription has already received 7 extra days as a gift.',
        cta: 'Contact support',
        close: 'Close'
    },
    de: {
        title: 'Centrio läuft nach einer Störung wieder',
        body: 'Einige Tage lang waren unsere Server wegen eines Ausfalls bei unserem Hosting-Anbieter nicht erreichbar. Ein Teil der Daten, vor allem Registrierungen und Zahlungen der letzten Wochen, ging verloren. Unser Team stellt alles wieder her, was möglich ist. Fehlt Ihr Konto oder Ihre Zahlung, schreiben Sie dem Support — Anfragen aus der App oder aus dem Kundenkonto auf der Website beantworten wir innerhalb einer Stunde.',
        gift: 'Alle, die ein Abonnement bezahlt hatten, haben bereits 7 Tage geschenkt bekommen.',
        cta: 'Support kontaktieren',
        close: 'Schließen'
    },
    es: {
        title: 'Centrio vuelve a funcionar tras una caída',
        body: 'Durante varios días nuestros servidores no estuvieron disponibles por un fallo de nuestro proveedor de alojamiento. Se perdió una parte de los datos, sobre todo registros y pagos de las últimas semanas. Nuestro equipo está recuperando todo lo posible. Si falta tu cuenta o tu pago, escribe a soporte: las solicitudes enviadas desde la aplicación o desde tu cuenta en el sitio se atienden en una hora.',
        gift: 'Todos los que habían pagado una suscripción ya recibieron 7 días de regalo.',
        cta: 'Contactar con soporte',
        close: 'Cerrar'
    },
    fr: {
        title: 'Centrio est de retour après une panne',
        body: 'Pendant plusieurs jours, nos serveurs étaient inaccessibles à cause d’une défaillance chez notre hébergeur. Une partie des données, surtout les inscriptions et paiements des dernières semaines, a été perdue. Notre équipe restaure tout ce qui est possible. Si votre compte a disparu ou si votre paiement n’apparaît plus, contactez le support : les demandes envoyées depuis l’application ou depuis votre compte sur le site sont traitées dans l’heure.',
        gift: 'Tous les clients qui avaient payé un abonnement ont déjà reçu 7 jours offerts.',
        cta: 'Contacter le support',
        close: 'Fermer'
    },
    it: {
        title: 'Centrio è di nuovo online dopo un guasto',
        body: 'Per diversi giorni i nostri server sono stati irraggiungibili per un guasto presso il provider di hosting. Una parte dei dati, soprattutto registrazioni e pagamenti delle ultime settimane, è andata persa. Il nostro team sta ripristinando tutto il possibile. Se il tuo account è sparito o il pagamento non risulta, scrivi al supporto: le richieste inviate dall’app o dal tuo account sul sito vengono esaminate entro un’ora.',
        gift: 'Chi aveva pagato un abbonamento ha già ricevuto 7 giorni in regalo.',
        cta: 'Scrivi al supporto',
        close: 'Chiudi'
    },
    zh: {
        title: 'Centrio 已在故障后恢复运行',
        body: '由于托管服务商出现故障，我们的服务器中断了数天。部分数据（主要是最近几周的注册和付款记录）已丢失。我们的团队正在尽力恢复。如果您的账号丢失或付款状态异常，请联系客服——通过应用或网站个人中心提交的请求，我们会在一小时内处理。',
        gift: '所有付费订阅用户已获赠 7 天会员时长。',
        cta: '联系客服',
        close: '关闭'
    }
}

function pickTexts(language) {
    return TEXTS[language] || TEXTS.en
}

// Not shown to a brand-new install (it has no account and no messengers, so nothing could have been lost).
function shouldShow({ seen, loggedIn, messengerCount }) {
    if (seen) return false
    return loggedIn || messengerCount > 0
}

function bindOutageNotice({ store, cloudStore, getLanguage }) {
    const seen = !!store.get(FLAG, false)
    const loggedIn = !!cloudStore?.isLoggedIn?.()
    const messengerCount = (store.get('messengers', []) || []).length
    if (!shouldShow({ seen, loggedIn, messengerCount })) {
        if (!seen && !loggedIn && messengerCount === 0) markSeen(store)
        return
    }
    setTimeout(() => showNotice({ store, texts: pickTexts(getLanguage?.()) }), SHOW_DELAY_MS)
}

function markSeen(store) {
    if (store.setAsync) store.setAsync(FLAG, true)
    else store.set(FLAG, true)
}

function showNotice({ store, texts }) {
    if (document.getElementById('outageNotice')) return
    markSeen(store)

    const overlay = document.createElement('div')
    overlay.id = 'outageNotice'
    overlay.className = 'outage-notice-overlay'

    const dialog = document.createElement('div')
    dialog.className = 'outage-notice-dialog'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-labelledby', 'outageNoticeTitle')

    const head = document.createElement('div')
    head.className = 'outage-notice-head'
    const icon = document.createElement('span')
    icon.className = 'outage-notice-icon'
    icon.setAttribute('aria-hidden', 'true')
    icon.textContent = '!'
    const title = document.createElement('h2')
    title.id = 'outageNoticeTitle'
    title.textContent = texts.title
    head.append(icon, title)

    const body = document.createElement('div')
    body.className = 'outage-notice-body'
    const text = document.createElement('p')
    text.textContent = texts.body
    const gift = document.createElement('p')
    gift.className = 'outage-notice-gift'
    gift.textContent = '🎁 ' + texts.gift
    const actions = document.createElement('div')
    actions.className = 'outage-notice-actions'
    const cta = document.createElement('button')
    cta.type = 'button'
    cta.className = 'outage-notice-cta'
    cta.textContent = texts.cta
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'outage-notice-close'
    close.textContent = texts.close
    actions.append(cta, close)
    body.append(text, gift, actions)

    dialog.append(head, body)
    overlay.append(dialog)
    document.body.append(overlay)

    const dismiss = () => {
        document.removeEventListener('keydown', onKey)
        overlay.remove()
    }
    const onKey = (e) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', onKey)
    close.addEventListener('click', dismiss)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss() })
    // The sidebar button already knows what to do for every state (signed out, free plan, Pro).
    cta.addEventListener('click', () => {
        dismiss()
        document.getElementById('supportSidebarBtn')?.click()
    })
    cta.focus()
}

module.exports = { bindOutageNotice, shouldShow, pickTexts, FLAG }
