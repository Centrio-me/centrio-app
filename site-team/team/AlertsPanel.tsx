'use client'
// Оповещения «Клиент ждёт ответа» (2026-09-30). The owner tunes when/whom/
// where; the server (lib/org-alerts.js, every minute) does the watching.
// Backend: /api/org/:orgId/alert-settings (+ /telegram-link, /test),
// /alerts, /messenger-stats, /members, /messenger-assignments.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/api'

type Msg = { type: 'ok' | 'err'; text: string } | null

interface AlertSettings {
  enabled: boolean
  thresholdMinutes: number
  repeatMinutes: number
  maxRepeats: number
  workHours: { enabled: boolean; from: string; to: string; days: number[] }
  timezone: string
  memberUserIds: string[]
  messengerNames: string[]
  channels: { app: boolean; email: boolean; telegram: boolean }
  emailTo: string
  telegramLinked?: boolean
  telegramName?: string | null
  ownerEmail?: string | null
}

interface Member { userId: string; email: string; name?: string | null; role: string }
interface Stat { id: string; userId: string; messengerName: string; unreadCount: number; waitingSince?: string | null; updatedAt?: string }
interface AlertItem { id: string; memberName: string; messengerName: string; waitedMinutes: number; createdAt: string }

const THRESHOLDS = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240]
const REPEATS = [0, 10, 15, 30, 60, 120]
const TIMEZONES = [
  'Europe/Kaliningrad', 'Europe/Moscow', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk',
  'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok',
  'Asia/Magadan', 'Asia/Kamchatka', 'Europe/Minsk', 'Europe/Kyiv', 'Asia/Almaty', 'Asia/Tashkent',
  'Asia/Tbilisi', 'Asia/Yerevan', 'Asia/Baku', 'Europe/Berlin', 'Europe/London', 'UTC'
]
const TELEGRAM_POLL_MS = 3000
const TELEGRAM_POLL_MAX_MS = 3 * 60 * 1000
const LIVE_REFRESH_MS = 60 * 1000

const STR = {
  ru: {
    title: 'Оповещения «Клиент ждёт ответа»',
    desc: 'Если в назначенном сотруднику мессенджере сообщение висит непрочитанным дольше заданного времени — вам придёт оповещение. Centrio видит только факт «прочитано / не прочитано», содержимое переписки не читается и не хранится.',
    enable: 'Оповещения включены',
    whenTitle: 'Когда оповещать',
    threshold: 'Если не ответили в течение',
    repeat: 'Напоминать повторно',
    noRepeat: 'Не повторять',
    every: (m: string) => `каждые ${m}`,
    maxRepeats: 'Не больше',
    times: (n: number) => `${n} ${n === 1 ? 'раза' : 'раз'}`,
    workTitle: 'Рабочее время',
    workOnly: 'Оповещать только в рабочее время',
    from: 'С', to: 'До',
    tz: 'Часовой пояс',
    days: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
    workHint: 'Вне рабочего времени оповещения не приходят. Если клиент написал ночью и ему так и не ответили — оповещение придёт в начале рабочего дня.',
    whoTitle: 'За кем следить',
    allMembers: 'Все сотрудники',
    selectedMembers: 'Выбранные сотрудники',
    allMessengers: 'Все мессенджеры',
    selectedMessengers: 'Выбранные мессенджеры',
    noMessengers: 'Сотрудникам пока не назначено ни одного мессенджера — назначьте их на вкладке «Участники».',
    whereTitle: 'Куда присылать',
    chApp: 'В приложение Centrio',
    chAppHint: 'Всплывающее уведомление на компьютере и запись в колокольчике — у владельца и администраторов, когда их приложение запущено.',
    chEmail: 'На почту',
    chEmailHint: 'Письмо со списком, кто и сколько ждёт. Можно выбрать почту владельца или любого сотрудника команды.',
    emailPlaceholder: (owner: string) => owner ? `Владелец — ${owner}` : 'Почта владельца',
    chTelegram: 'В Telegram',
    chTelegramHint: 'Сообщение от бота Centrio в личку — удобно, когда вы не за компьютером.',
    tgConnect: 'Подключить Telegram',
    tgWaiting: 'Откройте Telegram и нажмите «Start» у бота…',
    tgLinked: (n: string) => `Подключено${n ? ': ' + n : ''}`,
    tgUnlink: 'Отключить',
    tgNeedLink: 'Сначала подключите Telegram',
    tgLinkedOk: 'Telegram подключён',
    tgTimeout: 'Не дождались подтверждения. Нажмите «Подключить Telegram» ещё раз.',
    save: 'Сохранить настройки',
    saving: 'Сохраняем…',
    saved: 'Настройки сохранены',
    saveFailed: 'Не удалось сохранить настройки',
    test: 'Отправить проверку',
    testing: 'Отправляем…',
    testResult: (parts: string[]) => `Проверка: ${parts.join(', ')}`,
    testOk: 'доставлено', testFail: 'не удалось',
    testNoChannels: 'Включите хотя бы один канал и сохраните настройки',
    unsaved: 'Есть несохранённые изменения',
    noSeats: 'Оповещения работают, пока у команды оплачены места. Сейчас места не активны — продлите их во вкладке «Места и оплата».',
    liveTitle: 'Сейчас ждут ответа',
    liveEmpty: 'Все сообщения прочитаны — никто не ждёт.',
    waits: (m: string) => `ждёт ${m}`,
    offline: 'приложение закрыто',
    historyTitle: 'Последние оповещения',
    historyEmpty: 'Оповещений за последние 7 дней не было.',
    loadFailed: 'Не удалось загрузить настройки оповещений',
    min: (n: number) => formatMinutesRu(n)
  },
  en: {
    title: '"Client is waiting" alerts',
    desc: 'If a message in an employee\'s assigned messenger stays unread longer than you allow, you get an alert. Centrio only sees read / unread status — it never reads or stores message content.',
    enable: 'Alerts enabled',
    whenTitle: 'When to alert',
    threshold: 'If nobody replies within',
    repeat: 'Remind again',
    noRepeat: 'Don\'t repeat',
    every: (m: string) => `every ${m}`,
    maxRepeats: 'At most',
    times: (n: number) => `${n} time${n === 1 ? '' : 's'}`,
    workTitle: 'Working hours',
    workOnly: 'Alert only during working hours',
    from: 'From', to: 'To',
    tz: 'Time zone',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    workHint: 'No alerts outside working hours. If a client wrote at night and still has no reply, the alert arrives when the working day starts.',
    whoTitle: 'Who to watch',
    allMembers: 'All employees',
    selectedMembers: 'Selected employees',
    allMessengers: 'All messengers',
    selectedMessengers: 'Selected messengers',
    noMessengers: 'No messengers are assigned to employees yet — assign them on the Members tab.',
    whereTitle: 'Where to send',
    chApp: 'In the Centrio app',
    chAppHint: 'A desktop notification plus an entry in the bell — for the owner and admins while their app is running.',
    chEmail: 'By email',
    chEmailHint: 'An email listing who is waiting and for how long. Send it to the owner or any team member.',
    emailPlaceholder: (owner: string) => owner ? `Owner — ${owner}` : 'Owner email',
    chTelegram: 'In Telegram',
    chTelegramHint: 'A private message from the Centrio bot — handy when you are away from the computer.',
    tgConnect: 'Connect Telegram',
    tgWaiting: 'Open Telegram and press "Start" in the bot…',
    tgLinked: (n: string) => `Connected${n ? ': ' + n : ''}`,
    tgUnlink: 'Disconnect',
    tgNeedLink: 'Connect Telegram first',
    tgLinkedOk: 'Telegram connected',
    tgTimeout: 'No confirmation received. Press "Connect Telegram" again.',
    save: 'Save settings',
    saving: 'Saving…',
    saved: 'Settings saved',
    saveFailed: 'Could not save settings',
    test: 'Send a test',
    testing: 'Sending…',
    testResult: (parts: string[]) => `Test: ${parts.join(', ')}`,
    testOk: 'delivered', testFail: 'failed',
    testNoChannels: 'Turn on at least one channel and save the settings',
    unsaved: 'You have unsaved changes',
    noSeats: 'Alerts only run while the team has paid seats. Seats are not active right now — renew them on the Seats & billing tab.',
    liveTitle: 'Waiting for a reply right now',
    liveEmpty: 'Everything is read — nobody is waiting.',
    waits: (m: string) => `waiting ${m}`,
    offline: 'app closed',
    historyTitle: 'Recent alerts',
    historyEmpty: 'No alerts in the last 7 days.',
    loadFailed: 'Could not load alert settings',
    min: (n: number) => formatMinutesEn(n)
  }
}

function formatMinutesRu(n: number) {
  if (n < 60) return `${n} мин`
  const h = Math.floor(n / 60), m = n % 60
  if (h >= 24) return `${Math.floor(h / 24)} дн ${h % 24} ч`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}
function formatMinutesEn(n: number) {
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60), m = n % 60
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`
  return m ? `${h} h ${m} min` : `${h} h`
}

function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow' } catch { return 'Europe/Moscow' }
}

function comparable(s: AlertSettings | null) {
  if (!s) return ''
  const { telegramLinked, telegramName, ownerEmail, ...rest } = s
  return JSON.stringify(rest)
}

export default function AlertsPanel({ orgId, lang, seatsActive }: { orgId: string; lang: 'ru' | 'en'; seatsActive: boolean }) {
  const s = STR[lang]
  const [settings, setSettings] = useState<AlertSettings | null>(null)
  const [saved, setSaved] = useState<AlertSettings | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messengerNames, setMessengerNames] = useState<string[]>([])
  const [stats, setStats] = useState<Stat[]>([])
  const [history, setHistory] = useState<AlertItem[]>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [linking, setLinking] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadLive = useCallback(async () => {
    try {
      const [st, al] = await Promise.all([
        api.get(`/api/org/${orgId}/messenger-stats`),
        api.get(`/api/org/${orgId}/alerts`)
      ])
      if (st.data?.success) setStats(st.data.data)
      if (al.data?.success) setHistory(al.data.data.items)
    } catch {}
  }, [orgId])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [set, mem, asg] = await Promise.all([
          api.get(`/api/org/${orgId}/alert-settings`),
          api.get(`/api/org/${orgId}/members`),
          api.get(`/api/org/${orgId}/messenger-assignments`)
        ])
        if (cancelled) return
        if (set.data?.success) {
          const loaded: AlertSettings = set.data.data
          const initial = loaded.enabled || loaded.workHours.enabled ? loaded : { ...loaded, timezone: browserTimezone() }
          setSettings(initial)
          setSaved(initial)
        }
        if (mem.data?.success) setMembers(mem.data.data)
        if (asg.data?.success) {
          const names = [...new Set<string>(asg.data.data.map((a: { name: string }) => a.name.trim()).filter(Boolean))]
          setMessengerNames(names.sort((a, b) => a.localeCompare(b)))
        }
      } catch {
        if (!cancelled) setMsg({ type: 'err', text: s.loadFailed })
      }
    })()
    loadLive()
    const timer = setInterval(loadLive, LIVE_REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [orgId, loadLive, s.loadFailed])

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const memberName = useCallback((userId: string) => {
    const m = members.find(x => x.userId === userId)
    return (m?.name && m.name.trim()) || m?.email || '—'
  }, [members])

  const waiting = useMemo(() => {
    const now = Date.now()
    return stats
      .filter(st => st.unreadCount > 0 && st.waitingSince)
      .map(st => ({
        ...st,
        minutes: Math.max(0, Math.floor((now - new Date(st.waitingSince as string).getTime()) / 60000)),
        offline: st.updatedAt ? now - new Date(st.updatedAt).getTime() > 10 * 60000 : false
      }))
      .sort((a, b) => b.minutes - a.minutes)
  }, [stats])

  if (!settings) {
    return (
      <div className="glass-card" style={{ padding: 26 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{s.title}</div>
        {msg && <div className={`form-msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}
      </div>
    )
  }

  const update = (patch: Partial<AlertSettings>) => { setSettings(prev => prev ? { ...prev, ...patch } : prev); setMsg(null) }
  const updateWork = (patch: Partial<AlertSettings['workHours']>) => update({ workHours: { ...settings.workHours, ...patch } })
  const updateChannels = (patch: Partial<AlertSettings['channels']>) => update({ channels: { ...settings.channels, ...patch } })
  const toggleIn = (list: string[], value: string) => list.includes(value) ? list.filter(x => x !== value) : [...list, value]
  const dirty = comparable(settings) !== comparable(saved)
  const hasChannel = settings.channels.app || settings.channels.email || (settings.channels.telegram && !!settings.telegramLinked)
  const timezones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES]

  const handleSave = async () => {
    setSaving(true)
    setMsg(null)
    try {
      const { data } = await api.patch(`/api/org/${orgId}/alert-settings`, settings)
      if (data?.success) {
        setSettings(data.data)
        setSaved(data.data)
        setMsg({ type: 'ok', text: s.saved })
      }
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || s.saveFailed })
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!hasChannel || dirty) { setMsg({ type: 'err', text: dirty ? s.unsaved : s.testNoChannels }); return }
    setTesting(true)
    setMsg(null)
    try {
      const { data } = await api.post(`/api/org/${orgId}/alert-settings/test`)
      const r = data?.data || {}
      const parts: string[] = []
      if (r.app !== null && r.app !== undefined) parts.push(`${s.chApp} — ${r.app ? s.testOk : s.testFail}`)
      if (r.email !== null && r.email !== undefined) parts.push(`${s.chEmail} — ${r.email ? s.testOk : s.testFail}`)
      if (r.telegram !== null && r.telegram !== undefined) parts.push(`${s.chTelegram} — ${r.telegram ? s.testOk : s.testFail}`)
      const allOk = [r.app, r.email, r.telegram].every(v => v !== false)
      setMsg({ type: allOk ? 'ok' : 'err', text: s.testResult(parts) })
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || s.testFail })
    } finally {
      setTesting(false)
    }
  }

  const stopTelegramPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
    setLinking(false)
  }

  const handleTelegramConnect = async () => {
    setMsg(null)
    try {
      const { data } = await api.post(`/api/org/${orgId}/alert-settings/telegram-link`)
      if (!data?.success) return
      window.open(data.data.url, '_blank', 'noopener,noreferrer')
      setLinking(true)
      const startedAt = Date.now()
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = setInterval(async () => {
        if (Date.now() - startedAt > TELEGRAM_POLL_MAX_MS) {
          stopTelegramPoll()
          setMsg({ type: 'err', text: s.tgTimeout })
          return
        }
        try {
          const res = await api.get(`/api/org/${orgId}/alert-settings`)
          if (res.data?.success && res.data.data.telegramLinked) {
            stopTelegramPoll()
            setSettings(prev => prev ? {
              ...prev,
              telegramLinked: true,
              telegramName: res.data.data.telegramName,
              channels: { ...prev.channels, telegram: true }
            } : prev)
            setSaved(res.data.data)
            setMsg({ type: 'ok', text: s.tgLinkedOk })
          }
        } catch {}
      }, TELEGRAM_POLL_MS)
    } catch (err: any) {
      setMsg({ type: 'err', text: err.response?.data?.error || s.saveFailed })
    }
  }

  const handleTelegramUnlink = async () => {
    try {
      const { data } = await api.delete(`/api/org/${orgId}/alert-settings/telegram-link`)
      if (data?.success) {
        setSettings(prev => prev ? { ...prev, telegramLinked: false, telegramName: null, channels: { ...prev.channels, telegram: false } } : prev)
        setSaved(data.data)
      }
    } catch {}
  }

  return (
    <div className="glass-card alerts-card" style={{ padding: 26 }}>
      <div className="qr-head">
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>{s.title}</div>
          <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)', maxWidth: 620 }}>{s.desc}</p>
        </div>
        <label className="switch-row">
          <input type="checkbox" className="switch" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })} />
          <span>{s.enable}</span>
        </label>
      </div>

      {!seatsActive && <div className="alerts-warning">{s.noSeats}</div>}

      <fieldset className="alerts-fieldset" disabled={!settings.enabled}>
        <section className="alerts-section">
          <h3 className="alerts-section-title">{s.whenTitle}</h3>
          <div className="alerts-grid">
            <div>
              <label className="field-label" htmlFor="al-threshold">{s.threshold}</label>
              <select id="al-threshold" className="field-select" value={settings.thresholdMinutes} onChange={e => update({ thresholdMinutes: Number(e.target.value) })}>
                {(THRESHOLDS.includes(settings.thresholdMinutes) ? THRESHOLDS : [...THRESHOLDS, settings.thresholdMinutes].sort((a, b) => a - b))
                  .map(m => <option key={m} value={m}>{s.min(m)}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="al-repeat">{s.repeat}</label>
              <select id="al-repeat" className="field-select" value={settings.repeatMinutes} onChange={e => update({ repeatMinutes: Number(e.target.value) })}>
                {(REPEATS.includes(settings.repeatMinutes) ? REPEATS : [...REPEATS, settings.repeatMinutes].sort((a, b) => a - b))
                  .map(m => <option key={m} value={m}>{m === 0 ? s.noRepeat : s.every(s.min(m))}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="al-max">{s.maxRepeats}</label>
              <select id="al-max" className="field-select" value={settings.maxRepeats} disabled={settings.repeatMinutes === 0} onChange={e => update({ maxRepeats: Number(e.target.value) })}>
                {[1, 2, 3, 5, 10].concat([1, 2, 3, 5, 10].includes(settings.maxRepeats) ? [] : [settings.maxRepeats])
                  .sort((a, b) => a - b).map(n => <option key={n} value={n}>{s.times(n)}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="alerts-section">
          <h3 className="alerts-section-title">{s.workTitle}</h3>
          <label className="check-row">
            <input type="checkbox" checked={settings.workHours.enabled} onChange={e => updateWork({ enabled: e.target.checked })} />
            <span>{s.workOnly}</span>
          </label>
          {settings.workHours.enabled && (
            <>
              <div className="alerts-grid" style={{ marginTop: 14 }}>
                <div>
                  <label className="field-label" htmlFor="al-from">{s.from}</label>
                  <input id="al-from" type="time" className="field-input" value={settings.workHours.from} onChange={e => e.target.value && updateWork({ from: e.target.value })} />
                </div>
                <div>
                  <label className="field-label" htmlFor="al-to">{s.to}</label>
                  <input id="al-to" type="time" className="field-input" value={settings.workHours.to} onChange={e => e.target.value && updateWork({ to: e.target.value })} />
                </div>
                <div>
                  <label className="field-label" htmlFor="al-tz">{s.tz}</label>
                  <select id="al-tz" className="field-select" value={settings.timezone} onChange={e => update({ timezone: e.target.value })}>
                    {timezones.map(tz => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="chip-row" role="group" aria-label={s.workTitle}>
                {s.days.map((label, i) => {
                  const day = i + 1
                  const on = settings.workHours.days.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`chip${on ? ' on' : ''}`}
                      aria-pressed={on}
                      onClick={() => updateWork({ days: on ? settings.workHours.days.filter(d => d !== day) : [...settings.workHours.days, day].sort() })}
                    >{label}</button>
                  )
                })}
              </div>
              <p className="alerts-hint">{s.workHint}</p>
            </>
          )}
        </section>

        <section className="alerts-section">
          <h3 className="alerts-section-title">{s.whoTitle}</h3>
          <div className="segmented" role="radiogroup">
            <button type="button" role="radio" aria-checked={settings.memberUserIds.length === 0} className={settings.memberUserIds.length === 0 ? 'active' : ''} onClick={() => update({ memberUserIds: [] })}>{s.allMembers}</button>
            <button type="button" role="radio" aria-checked={settings.memberUserIds.length > 0} className={settings.memberUserIds.length > 0 ? 'active' : ''} onClick={() => settings.memberUserIds.length === 0 && members[0] && update({ memberUserIds: members.filter(m => m.role !== 'OWNER').map(m => m.userId) })}>{s.selectedMembers}</button>
          </div>
          {settings.memberUserIds.length > 0 && (
            <div className="chip-row">
              {members.map(m => {
                const on = settings.memberUserIds.includes(m.userId)
                return (
                  <button key={m.userId} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                    onClick={() => { const next = toggleIn(settings.memberUserIds, m.userId); update({ memberUserIds: next }) }}>
                    {(m.name && m.name.trim()) || m.email}
                  </button>
                )
              })}
            </div>
          )}

          <div className="segmented" role="radiogroup" style={{ marginTop: 14 }}>
            <button type="button" role="radio" aria-checked={settings.messengerNames.length === 0} className={settings.messengerNames.length === 0 ? 'active' : ''} onClick={() => update({ messengerNames: [] })}>{s.allMessengers}</button>
            <button type="button" role="radio" aria-checked={settings.messengerNames.length > 0} className={settings.messengerNames.length > 0 ? 'active' : ''} disabled={messengerNames.length === 0} onClick={() => settings.messengerNames.length === 0 && update({ messengerNames: [...messengerNames] })}>{s.selectedMessengers}</button>
          </div>
          {messengerNames.length === 0 && <p className="alerts-hint">{s.noMessengers}</p>}
          {settings.messengerNames.length > 0 && (
            <div className="chip-row">
              {messengerNames.map(name => {
                const on = settings.messengerNames.includes(name)
                return (
                  <button key={name} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on}
                    onClick={() => update({ messengerNames: toggleIn(settings.messengerNames, name) })}>{name}</button>
                )
              })}
            </div>
          )}
        </section>

        <section className="alerts-section">
          <h3 className="alerts-section-title">{s.whereTitle}</h3>
          <div className="channel-list">
            <label className={`channel${settings.channels.app ? ' on' : ''}`}>
              <input type="checkbox" checked={settings.channels.app} onChange={e => updateChannels({ app: e.target.checked })} />
              <div>
                <div className="channel-name">{s.chApp}</div>
                <div className="channel-hint">{s.chAppHint}</div>
              </div>
            </label>

            <div className={`channel${settings.channels.email ? ' on' : ''}`}>
              <input type="checkbox" id="al-ch-email" checked={settings.channels.email} onChange={e => updateChannels({ email: e.target.checked })} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="al-ch-email" className="channel-name">{s.chEmail}</label>
                <div className="channel-hint">{s.chEmailHint}</div>
                {settings.channels.email && (
                  <select className="field-select" style={{ marginTop: 10 }} value={settings.emailTo}
                    onChange={e => update({ emailTo: e.target.value })}>
                    <option value="">{s.emailPlaceholder(settings.ownerEmail || '')}</option>
                    {[...new Set(members.map(m => m.email).filter(e => e && e !== settings.ownerEmail))].map(email => (
                      <option key={email} value={email}>{email}</option>
                    ))}
                    {settings.emailTo && !members.some(m => m.email === settings.emailTo) && <option value={settings.emailTo}>{settings.emailTo}</option>}
                  </select>
                )}
              </div>
            </div>

            <div className={`channel${settings.channels.telegram && settings.telegramLinked ? ' on' : ''}`}>
              <input type="checkbox" id="al-ch-tg" checked={settings.channels.telegram && !!settings.telegramLinked}
                disabled={!settings.telegramLinked} title={settings.telegramLinked ? '' : s.tgNeedLink}
                onChange={e => updateChannels({ telegram: e.target.checked })} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <label htmlFor="al-ch-tg" className="channel-name">{s.chTelegram}</label>
                <div className="channel-hint">{s.chTelegramHint}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  {settings.telegramLinked ? (
                    <>
                      <span className="channel-linked">{s.tgLinked(settings.telegramName || '')}</span>
                      <button type="button" className="btn-ghost" onClick={handleTelegramUnlink}>{s.tgUnlink}</button>
                    </>
                  ) : linking ? (
                    <span className="channel-hint">{s.tgWaiting}</span>
                  ) : (
                    <button type="button" className="btn-ghost" onClick={handleTelegramConnect}>{s.tgConnect}</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </fieldset>

      <div className="alerts-actions">
        <button type="button" className="btn-primary" disabled={saving || !dirty} onClick={handleSave}>{saving ? s.saving : s.save}</button>
        <button type="button" className="btn-ghost" disabled={testing || saving || !settings.enabled} onClick={handleTest}>{testing ? s.testing : s.test}</button>
        {dirty && !saving && <span className="alerts-dirty">{s.unsaved}</span>}
      </div>
      {msg && <div className={`form-msg ${msg.type}`} style={{ marginTop: 12 }}>{msg.text}</div>}

      <div className="alerts-live">
        <section>
          <h3 className="alerts-section-title">{s.liveTitle}</h3>
          {waiting.length === 0 ? (
            <p className="alerts-hint">{s.liveEmpty}</p>
          ) : waiting.map(w => (
            <div key={w.id} className="audit-row">
              <span><strong style={{ color: '#eaf0fb' }}>{memberName(w.userId)}</strong> · {w.messengerName}{w.offline ? <span className="alerts-offline"> · {s.offline}</span> : null}</span>
              <span className={w.minutes >= settings.thresholdMinutes ? 'alerts-late' : 'alerts-ok'}>{s.waits(s.min(w.minutes))}</span>
            </div>
          ))}
        </section>
        <section>
          <h3 className="alerts-section-title">{s.historyTitle}</h3>
          {history.length === 0 ? (
            <p className="alerts-hint">{s.historyEmpty}</p>
          ) : history.slice(0, 10).map(h => (
            <div key={h.id} className="audit-row">
              <span><strong style={{ color: '#eaf0fb' }}>{h.memberName}</strong> · {h.messengerName} · {s.waits(s.min(h.waitedMinutes))}</span>
              <span style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{new Date(h.createdAt).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
