// Team journal in plain Russian for the admin app (2026-11-09: the journal showed raw codes like "member.role").
// Pure: who(userId) -> email|null is passed in, so the text can name people without a database call here.

const ROLE = { OWNER: 'владелец', ADMIN: 'администратор', MEMBER: 'сотрудник' }
const PROVIDER = { yookassa: 'ЮKassa', fride: 'FRIDE', admin: 'вручную', support: 'поддержка' }

function fmtDate(value) {
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return null
    const p = (n) => String(n).padStart(2, '0')
    return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

const join = (...parts) => parts.filter((x) => x !== null && x !== undefined && x !== '').join(' · ') || null
const seatsWord = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'место' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'места' : 'мест')

function seatsLine(m) {
    return join(
        m.seats ? `${m.seats} ${seatsWord(m.seats)}` : null,
        m.months ? `${m.months} мес.` : null,
        m.days && !m.months ? `${m.days} дн.` : null,
        m.expiresAt ? `до ${fmtDate(m.expiresAt)}` : null
    )
}

// action -> [title | (meta) => title, (meta, person) => details]
const TEXT = {
    'org.create': ['Команда создана', (m) => m.name || null],
    'org.rename': ['Команда переименована', (m) => m.name || m.to || null],
    'org.logo': ['Изменён логотип', () => null],
    'org.logo.update': ['Изменён логотип', () => null],
    'org.owner': ['Сменился владелец', (m, who) => who(m.userId)],
    'org.grant': ['Продлено вручную', seatsLine],
    'org.settings.update': ['Изменены настройки', () => null],
    'settings.update': ['Изменены настройки', () => null],
    'org.vpn.update': ['Изменён VPN команды', () => null],
    'vpn.update': ['Изменён VPN команды', () => null],
    'member.invite': ['Отправлено приглашение', (m) => join(m.email, m.role ? ROLE[m.role] : null)],
    'member.invite_cancel': ['Приглашение отменено', (m) => m.email || null],
    'member.accept': ['Принял приглашение', (m, who) => who(m.userId)],
    'member.join': ['Добавлен в команду', (m, who) => join(who(m.userId), m.via === 'support' || m.via === 'admin' ? 'через поддержку' : null)],
    'member.remove': ['Удалён из команды', (m, who) => who(m.userId)],
    'member.role': ['Изменена роль', (m, who) => `${who(m.userId) || 'участник'} → ${ROLE[m.role] || m.role}`],
    'member.strict': [(m) => (m.strictMode ? 'Строгий режим включён' : 'Строгий режим выключен'), (m, who) => who(m.userId)],
    'member.canAddOwnMessengers': [(m) => (m.canAddOwnMessengers ? 'Разрешено добавлять свои мессенджеры' : 'Запрещено добавлять свои мессенджеры'), (m, who) => who(m.userId)],
    'messenger.assign': ['Назначен мессенджер', (m, who) => (m.name ? `${m.name} → ${who(m.userId) || 'сотрудник'}` : who(m.userId))],
    'org.messenger.assign': ['Назначен мессенджер', (m, who) => (m.name ? `${m.name} → ${who(m.userId) || 'сотрудник'}` : who(m.userId))],
    'messenger.unassign': ['Мессенджер снят', (m, who) => join(m.name, who(m.userId))],
    'org.messenger.remove': ['Мессенджер снят', (m, who) => join(m.name, who(m.userId))],
    'messenger.edit': ['Мессенджер изменён', (m) => m.name || null],
    'messenger.vpn': ['Изменён VPN мессенджера', (m) => m.name || null],
    'credential.set': ['Сохранён доступ к мессенджеру', (m) => m.name || null],
    'credential.delete': ['Удалён доступ к мессенджеру', (m) => m.name || null],
    'vault.device': ['Подключено устройство', () => null],
    'seats.purchase': ['Оплачены места', seatsLine],
    'seats.grant': ['Места выданы вручную', seatsLine],
    'seats.gift': ['Подарок от поддержки', (m) => join(m.days ? `+${m.days} дн.` : null, m.expiresAt ? `до ${fmtDate(m.expiresAt)}` : null)],
    'seats.autorenew.success': ['Автопродление прошло', seatsLine],
    'seats.autorenew.failed': ['Автопродление не прошло', (m) => m.reason || null],
    'seats.autorenew.error': ['Ошибка автопродления', (m) => m.error || null],
    'expiry.notice': ['Отправлено напоминание об окончании', (m) => (m.days ? `за ${m.days} дн.` : null)],
    'daily.sent': ['Отправлена ежедневная сводка', () => null],
    'alerts.update': ['Изменены оповещения', () => null],
    'alerts.telegramUnlink': ['Отвязан Telegram для оповещений', () => null],
    'customlink.create': ['Добавлена ссылка', (m) => m.title || m.name || null],
    'customlink.delete': ['Удалена ссылка', (m) => m.title || m.name || null],
    'folder.create': ['Создана папка', (m) => m.name || null],
    'folder.delete': ['Удалена папка', (m) => m.name || null],
    'workspace.create': ['Создано рабочее пространство', (m) => m.name || null],
    'workspace.delete': ['Удалено рабочее пространство', (m) => m.name || null],
    'quickReply.create': ['Добавлен быстрый ответ', (m) => m.title || null],
    'quickReply.update': ['Изменён быстрый ответ', (m) => m.title || null],
    'quickReply.delete': ['Удалён быстрый ответ', (m) => m.title || null],
    'task.create': ['Создана задача', (m) => m.title || null],
    'task.delete': ['Удалена задача', (m) => m.title || null],
    'news.post': ['Опубликована новость', (m) => m.title || null],
}

/** { title, details } for one OrgAuditLog row. */
function describeOrgAudit(entry, who = () => null) {
    const meta = entry.metaJson && typeof entry.metaJson === 'object' ? entry.metaJson : {}
    const text = TEXT[entry.action]
    if (!text) return { title: entry.action, details: null }
    const [title, details] = text
    let line = null
    try { line = details(meta, who) || null } catch { line = null }
    if (line && meta.provider && PROVIDER[meta.provider] && entry.action.startsWith('seats.')) line = join(line, PROVIDER[meta.provider])
    return { title: typeof title === 'function' ? title(meta) : title, details: line }
}

module.exports = { describeOrgAudit }
