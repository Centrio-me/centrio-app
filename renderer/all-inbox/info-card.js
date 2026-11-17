'use strict'
// The card of a chat that opens from the conversation's header (Oleg, 2026-11-13: «у каналов нет окна с информацией о
// канале при клике на заголовок»): what it is, how many people, what it says about itself, its public link.

const USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,31}$/
const FORMS = {
    channel: ['подписчик', 'подписчика', 'подписчиков'],
    group: ['участник', 'участника', 'участников']
}
const KIND_LABEL = { channel: 'Канал', group: 'Группа', user: 'Контакт', bot: 'Бот' }

/** The Russian form of a word for a number: 1 подписчик, 2 подписчика, 5 подписчиков. */
function plural(n, forms) {
    const abs = Math.abs(Math.trunc(Number(n) || 0))
    const last = abs % 10
    const tens = abs % 100
    if (tens >= 11 && tens <= 14) return forms[2]
    if (last === 1) return forms[0]
    if (last >= 2 && last <= 4) return forms[1]
    return forms[2]
}

/** A telephone number as people write it: +7 900 123-45-67; anything that is not digits gives nothing. */
function phoneText(raw) {
    const digits = String(raw || '').replace(/[\s+()-]/g, '')
    if (!/^\d{7,15}$/.test(digits)) return ''
    const ru = /^7(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(digits)
    return ru ? `+7 ${ru[1]} ${ru[2]}-${ru[3]}-${ru[4]}` : `+${digits}`
}

function grouped(n) {
    return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** @returns {{ title: string, subtitle: string, about: string, link: string }} */
function describeInfo(info) {
    if (!info || typeof info !== 'object') return { title: '', subtitle: '', about: '', link: '' }
    const kind = KIND_LABEL[info.kind] ? info.kind : 'group'
    const members = Number(info.members) || 0
    const label = KIND_LABEL[kind]
    const username = String(info.username || '')
    // a person or a bot: the number, or else the address; a channel or a group: the people
    let subtitle = members > 0 ? `${label} · ${grouped(members)} ${plural(members, FORMS[kind] || FORMS.group)}` : label
    if (kind === 'user' || kind === 'bot') {
        const how = phoneText(info.phone) || (USERNAME.test(username) ? `@${username}` : '')
        subtitle = how ? `${label} · ${how}` : label
    }
    return {
        title: String(info.title || ''),
        subtitle,
        about: String(info.about || '').trim(),
        link: USERNAME.test(username) ? `https://t.me/${username}` : ''
    }
}

module.exports = { describeInfo, plural }
