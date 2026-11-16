'use strict'
// Windows that pop up inside the Centrio app (owner, 2026-11-17): a campaign has words, a picture, a button, an audience
// and dates. This file holds only the rules (cleaning what the admin types, who is it for, is it on now, what the app
// gets, how the events are counted); the files and the routes are in announcements.js and routes/*announcements.js.

const THEMES = ['plain', 'newyear', 'sale']
const LOGO_STYLES = ['none', 'santa']
const ACTIONS = ['link', 'pricing']
const AUDIENCES = ['all', 'guests', 'registered', 'free', 'pro', 'team', 'testers', 'users']
const EVENTS = ['shown', 'click', 'close', 'reopen']

const TITLE_MAX = 120
const BODY_MAX = 1500
const LABEL_MAX = 40
const URL_MAX = 500
const PROMO = /^[A-Z0-9_-]{2,32}$/
const EMAIL = /^[^\s@]{1,80}@[^\s@]{1,120}$/
const MAX_USERS = 200
// our own uploads and any https picture
const IMAGE = /^https:\/\/[^\s]{3,480}$/

const text = (v) => String(v == null ? '' : v).trim()

function parseDate(value) {
    if (value == null || value === '') return { ok: true, iso: '' }
    const ms = Date.parse(String(value))
    return Number.isFinite(ms) ? { ok: true, iso: new Date(ms).toISOString() } : { ok: false }
}

/** @returns {{ ok: true, value: object } | { ok: false, error: string }} */
function normalizeCampaign(input) {
    const src = input && typeof input === 'object' ? input : {}
    const title = text(src.title)
    if (!title) return { ok: false, error: 'Введите заголовок' }
    if (title.length > TITLE_MAX) return { ok: false, error: `Заголовок длиннее ${TITLE_MAX} символов` }
    const body = text(src.body)
    if (body.length > BODY_MAX) return { ok: false, error: `Текст длиннее ${BODY_MAX} символов` }

    const imageUrl = text(src.imageUrl)
    if (imageUrl && !IMAGE.test(imageUrl)) return { ok: false, error: 'Картинка: нужна ссылка https:// или загруженный файл' }

    let button = null
    if (src.button && typeof src.button === 'object') {
        const label = text(src.button.label)
        const action = ACTIONS.includes(src.button.action) ? src.button.action : 'link'
        if (!label) return { ok: false, error: 'Введите подпись кнопки' }
        if (label.length > LABEL_MAX) return { ok: false, error: `Подпись кнопки длиннее ${LABEL_MAX} символов` }
        button = { label, action }
        if (action === 'link') {
            const url = text(src.button.url)
            if (!/^https:\/\/\S+$/.test(url) || url.length > URL_MAX) return { ok: false, error: 'Адрес кнопки должен начинаться с https://' }
            button.url = url
        }
    }

    const promoRaw = text(src.promoCode).toUpperCase()
    if (promoRaw && !PROMO.test(promoRaw)) return { ok: false, error: 'Промокод: буквы, цифры, дефис, от 2 до 32 знаков' }

    const audienceType = text(src.audience && src.audience.type) || 'all'
    if (!AUDIENCES.includes(audienceType)) return { ok: false, error: 'Неизвестная аудитория' }
    const audience = { type: audienceType }
    if (audienceType === 'users') {
        const list = []
        for (const raw of Array.isArray(src.audience.users) ? src.audience.users : []) {
            const email = text(raw).toLowerCase()
            if (!email) continue
            if (!EMAIL.test(email)) return { ok: false, error: `Не похоже на почту: ${email.slice(0, 40)}` }
            if (!list.includes(email)) list.push(email)
        }
        if (!list.length) return { ok: false, error: 'Укажите хотя бы одну почту' }
        if (list.length > MAX_USERS) return { ok: false, error: `Не больше ${MAX_USERS} человек` }
        audience.users = list
    }

    const starts = parseDate(src.startsAt)
    const ends = parseDate(src.endsAt)
    if (!starts.ok) return { ok: false, error: 'Дата начала не распознана' }
    if (!ends.ok) return { ok: false, error: 'Дата окончания не распознана' }
    if (starts.iso && ends.iso && Date.parse(ends.iso) <= Date.parse(starts.iso)) return { ok: false, error: 'Окончание должно быть позже начала' }

    return {
        ok: true,
        value: {
            title,
            body,
            imageUrl,
            button,
            promoCode: promoRaw,
            theme: THEMES.includes(src.theme) ? src.theme : 'plain',
            logoStyle: LOGO_STYLES.includes(src.logoStyle) ? src.logoStyle : 'none',
            audience,
            startsAt: starts.iso,
            endsAt: ends.iso,
            enabled: src.enabled !== false
        }
    }
}

/**
 * Whether a campaign is for a person.
 * @param {{ type: string, users?: string[] }} audience
 * @param {{ kind: 'guest' | 'user', plan?: string, email?: string, tester?: boolean }} who a guest is an install with no account
 */
function audienceMatches(audience, who) {
    const type = audience && audience.type
    const user = !!who && who.kind === 'user'
    switch (type) {
        case 'all': return !!who
        case 'guests': return !!who && who.kind === 'guest'
        case 'registered': return user
        case 'free': return user && who.plan === 'FREE'
        case 'pro': return user && (who.plan === 'PRO' || who.plan === 'TEAM')
        case 'team': return user && who.plan === 'TEAM'
        case 'testers': return user && !!who.tester
        case 'users': return user && !!who.email && Array.isArray(audience.users) && audience.users.includes(String(who.email).toLowerCase())
        default: return false
    }
}

function isActiveNow(campaign, now = Date.now()) {
    if (!campaign || campaign.enabled === false) return false
    if (campaign.startsAt && now < Date.parse(campaign.startsAt)) return false
    if (campaign.endsAt && now >= Date.parse(campaign.endsAt)) return false
    return true
}

/** What the app gets: only what it draws, never the audience, the people or the dates. */
function publicView(c) {
    return {
        id: c.id,
        version: c.updatedAt || c.createdAt || '',
        title: c.title,
        body: c.body,
        imageUrl: c.imageUrl || '',
        button: c.button || null,
        promoCode: c.promoCode || '',
        theme: c.theme,
        logoStyle: c.logoStyle
    }
}

/** Counts per campaign: how many different people were shown it, clicked, closed or opened it again. */
function tally(events) {
    const people = {}
    for (const e of Array.isArray(events) ? events : []) {
        if (!e || !EVENTS.includes(e.event) || !e.id) continue
        const slot = (people[e.id] = people[e.id] || { shown: new Set(), click: new Set(), close: new Set(), reopen: new Set() })
        slot[e.event].add(String(e.who || ''))
    }
    const out = {}
    for (const [id, slot] of Object.entries(people)) out[id] = { shown: slot.shown.size, click: slot.click.size, close: slot.close.size, reopen: slot.reopen.size }
    return out
}

module.exports = { normalizeCampaign, audienceMatches, isActiveNow, publicView, tally, THEMES, LOGO_STYLES, AUDIENCES, EVENTS }
