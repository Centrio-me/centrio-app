'use strict'

// Allowlist инструментов AI-ассистента — единственное место, где решается,
// какие функции модель может дёргать и как они реально исполняются.
// main/ipc/assistant.js ничего не знает про эти функции: он только
// пересылает tool-call renderer'у (событие 'assistant:tool-call') и ждёт
// результат обратно ('assistant:tool-result') — вся логика UI-состояния
// (переключение вкладок, задачи, настройки) живёт здесь, в renderer, у
// которого есть state.activeMessengers/todos/settings. См.
// .claude/plans/ai-assistant.plan.md §5 и §8: инструменты НИКОГДА не
// читают содержимое переписок в мессенджерах — только метаданные (список
// мессенджеров, счётчики непрочитанного, задачи планировщика, разделы
// настроек). Единственное санкционированное исключение — превью из
// колокольчика уведомлений (get_recent_notifications, данные из
// app-notif-bind.js): это не переписка, а уже показанные пользователю
// системные/пуш-уведомления, которые он и так видит в панели.
// set_app_setting умеет менять НАСТОЯЩИЕ значения настроек (не только
// открывать раздел), но только по фиксированному allowlist'у
// (SETTINGS_SCHEMA ниже) — то же зеркало полей store.get('settings'), что
// показывает сам UI настроек (renderer/settings-ui.js). Секреты (API-ключи,
// VPN-ссылки, PIN) в этот allowlist не входят и не могут быть добавлены
// через этот инструмент.
const DEFAULT_LIST_ID = 'default'

const SETTINGS_SECTIONS = [
    'general', 'appearance', 'notifications', 'shortcuts',
    'security', 'network', 'extensions', 'assistant', 'system'
]

// Allowlist изменяемых настроек для set_app_setting — только безопасные,
// не-секретные поля из store.get('settings'). Ничего похожего на API-ключи,
// VPN-ссылки или PIN сюда не входит и не может быть добавлено этим
// инструментом (см. шапку файла — тот же принцип, что и для переписок).
// Значения enum/hexColor/boolean/number зеркалят реальные опции UI
// (index.html: .theme-item/.density-item/#settingCloseBehavior/...), чтобы
// модель не могла записать в store значение, не поддерживаемое интерфейсом.
const SETTINGS_SCHEMA = {
    theme: { kind: 'enum', values: ['embedded', 'dock', 'light', 'adaptive'] },
    density: { kind: 'enum', values: ['compact', 'normal', 'comfortable'] },
    closeBehavior: { kind: 'enum', values: ['tray', 'minimize', 'quit'] },
    language: { kind: 'enum', values: ['ru', 'en', 'de', 'es', 'fr', 'it', 'zh'] },
    fontSize: { kind: 'enum', values: [12, 13, 15] },
    accentColor: { kind: 'hexColor' },
    showTabs: { kind: 'boolean' },
    notifications: { kind: 'boolean' },
    notifSound: { kind: 'boolean' },
    trayBadge: { kind: 'boolean' },
    foldersEnabled: { kind: 'boolean' },
    folderLabel: { kind: 'boolean' },
    startMinimized: { kind: 'boolean' },
    adblockEnabled: { kind: 'boolean' }
}

function coerceSettingValue(key, rawValue) {
    const spec = SETTINGS_SCHEMA[key]
    if (!spec) return { error: 'unknown_setting' }
    if (spec.kind === 'enum') {
        const match = spec.values.find(v => String(v) === String(rawValue))
        if (match === undefined) return { error: 'invalid_value' }
        return { value: match }
    }
    if (spec.kind === 'boolean') {
        if (typeof rawValue === 'boolean') return { value: rawValue }
        if (rawValue === 'true' || rawValue === 'false') return { value: rawValue === 'true' }
        return { error: 'invalid_value' }
    }
    if (spec.kind === 'hexColor') {
        if (typeof rawValue === 'string' && /^#[0-9a-fA-F]{6}$/.test(rawValue)) return { value: rawValue }
        return { error: 'invalid_value' }
    }
    return { error: 'invalid_value' }
}

// Заметки — Pro/Team-плагин (см. renderer/notes-bind.js), не локальный store,
// а сервер (landing/notes-route.js). Инструменты ниже проверяют тот же
// тумблер extensionsState.notes, что и сама панель, чтобы модель не пыталась
// дёргать API у пользователя, который плагин не включил — и получала внятную
// причину вместо непонятной 403 от сервера.
function isNotesEnabled(store) {
    const state = store.get('extensionsState', {}) || {}
    return state.notes === true
}

function summarizeNote(n) {
    return {
        id: n.id,
        type: n.type,
        title: n.title || '',
        body: n.type === 'NOTE' ? (n.body || '') : undefined,
        items: n.type === 'CHECKLIST' ? (n.items || []).map(i => ({ id: i.id, text: i.text, done: !!i.done })) : undefined,
        pinned: !!n.pinned,
        color: n.color || null,
        updatedAt: n.updatedAt
    }
}

function bindAssistantTools({ state, store, tGet, switchTab, openSettings, invokeIpc, authorizedInvoke, getRecentNotifications, searchRecentNotifications, applySettings, mediaPlayerApi }) {
    function getTodosData() {
        const data = store.get('todos', null)
        if (!data || Array.isArray(data) || !Array.isArray(data.lists)) {
            // Тот же формат по умолчанию, что и в todos-bind.js — инструмент
            // не должен молча падать, если планировщик ещё ни разу не
            // открывали (данные могли ещё не мигрировать/не создаться).
            return { lists: [{ id: DEFAULT_LIST_ID, name: tGet('todos.all') || 'Todos' }], items: [] }
        }
        return data
    }

    function saveTodosData(data) {
        store.set('todos', data)
    }

    const handlers = {
        list_messengers() {
            return {
                messengers: (state.activeMessengers || []).map(m => ({
                    id: m.id,
                    name: m.name,
                    unread: state.unreadCounts?.[m.id] || 0
                }))
            }
        },

        switch_to_messenger({ id } = {}) {
            const messenger = (state.activeMessengers || []).find(m => String(m.id) === String(id))
            if (!messenger) return { error: 'messenger_not_found', id }
            if (typeof switchTab === 'function') switchTab(messenger.id)
            return { success: true, id: messenger.id, name: messenger.name }
        },

        list_todos({ list } = {}) {
            const data = getTodosData()
            const items = list ? data.items.filter(t => t.listId === list) : data.items
            return {
                lists: data.lists.map(l => ({ id: l.id, name: l.name })),
                items: items.map(t => ({ id: t.id, text: t.text, done: !!t.done, starred: !!t.starred, listId: t.listId }))
            }
        },

        add_todo({ text, list } = {}) {
            const trimmed = typeof text === 'string' ? text.trim() : ''
            if (!trimmed) return { error: 'empty_text' }
            const data = getTodosData()
            const listId = (list && data.lists.some(l => l.id === list)) ? list : (data.lists[0]?.id || DEFAULT_LIST_ID)
            const todo = { id: Date.now(), text: trimmed, done: false, starred: false, listId }
            data.items.unshift(todo)
            saveTodosData(data)
            return { success: true, id: todo.id }
        },

        toggle_todo({ id } = {}) {
            const data = getTodosData()
            const idx = data.items.findIndex(t => String(t.id) === String(id))
            if (idx === -1) return { error: 'todo_not_found', id }
            data.items[idx].done = !data.items[idx].done
            saveTodosData(data)
            return { success: true, id, done: data.items[idx].done }
        },

        open_settings_section({ section } = {}) {
            const target = SETTINGS_SECTIONS.includes(section) ? section : 'general'
            if (typeof openSettings === 'function') openSettings()
            // Модалка настроек рисуется асинхронно (openSettings await'ит
            // текущие значения) — ждём кадр, прежде чем искать нав-пункт в DOM.
            requestAnimationFrame(() => {
                document.querySelector(`.settings-nav-item[data-section="${target}"]`)?.click()
            })
            return { success: true, section: target }
        },

        get_unread_summary() {
            const messengers = state.activeMessengers || []
            const counts = state.unreadCounts || {}
            const byMessenger = messengers
                .filter(m => (counts[m.id] || 0) > 0)
                .map(m => ({ id: m.id, name: m.name, unread: counts[m.id] || 0 }))
            const total = byMessenger.reduce((sum, m) => sum + m.unread, 0)
            return { total, byMessenger }
        },

        // См. комментарий в шапке файла — единственное разрешённое чтение
        // "контента": превью title/body из панели-колокольчика (не диалоги).
        //
        // BUGFIX (2026-09-10, "в уведомлениях полный текст, а ИИ наш ищет не
        // по полному тексту" — live user report): without `query`, this only
        // ever saw the most recent ~50 (post-slice) items — with local
        // history now storable up to 10,000, a keyword search request like
        // "найди уведомление про доставку" had no way to reach anything
        // past the very latest few. When `query` is given, this now runs
        // renderer/app-notif-bind.js searchRecentNotifications() — the exact
        // same substring match the panel's own search box uses — over the
        // FULL stored+cloud history, THEN caps the returned count (not what
        // gets searched). Without `query`, behavior is unchanged (most
        // recent N, optionally unread-only).
        get_recent_notifications({ limit, unreadOnly, query } = {}) {
            const trimmedQuery = typeof query === 'string' ? query.trim() : ''
            let list
            if (trimmedQuery && typeof searchRecentNotifications === 'function') {
                list = searchRecentNotifications(trimmedQuery)
            } else if (typeof getRecentNotifications === 'function') {
                list = getRecentNotifications()
            } else {
                return { notifications: [] }
            }
            if (unreadOnly) list = list.filter(n => !n.isRead)
            const cap = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50)
            return { notifications: list.slice(0, cap), matchedCount: list.length, query: trimmedQuery || null }
        },

        async get_vpn_status() {
            if (typeof invokeIpc !== 'function') return { error: 'vpn_unavailable' }
            const status = await invokeIpc('vpn-status')
            // Никогда не отдаём status.configs как есть — каждая запись несёт
            // расшифрованную VPN-ссылку (креды сервера) в поле link.
            return {
                active: !!status?.active,
                name: status?.name || null,
                savedServersCount: (status?.configs || []).length
            }
        },

        async connect_fastest_vpn() {
            if (typeof invokeIpc !== 'function') return { error: 'vpn_unavailable' }
            const status = await invokeIpc('vpn-status')
            const configs = status?.configs || []
            if (configs.length === 0) return { error: 'no_saved_servers' }

            const pings = await Promise.all(configs.map(async (c) => {
                const res = await invokeIpc('vpn-ping', c.link)
                return { name: c.name, link: c.link, ms: res?.success ? res.ms : null }
            }))
            const reachable = pings.filter(p => typeof p.ms === 'number')
            if (reachable.length === 0) return { error: 'no_reachable_servers' }
            reachable.sort((a, b) => a.ms - b.ms)
            const best = reachable[0]

            let result = await invokeIpc('vpn-connect-saved', best.link)
            if (result?.needsDownload) {
                result = await invokeIpc('vpn-download-and-connect', best.link)
            }
            if (!result?.success) return { error: 'vpn_connect_failed', message: result?.error || null }
            return { success: true, name: best.name, ms: best.ms }
        },

        async disconnect_vpn() {
            if (typeof invokeIpc !== 'function') return { error: 'vpn_unavailable' }
            const result = await invokeIpc('vpn-disconnect')
            return result?.success ? { success: true } : { error: 'vpn_disconnect_failed' }
        },

        get_app_settings() {
            const settings = store.get('settings', {}) || {}
            const result = {}
            for (const key of Object.keys(SETTINGS_SCHEMA)) {
                result[key] = settings[key]
            }
            return result
        },

        set_app_setting({ key, value } = {}) {
            const coerced = coerceSettingValue(key, value)
            if (coerced.error) return { error: coerced.error, key }
            const current = store.get('settings', {}) || {}
            const next = { ...current, [key]: coerced.value }
            store.set('settings', next)
            if (typeof applySettings === 'function') applySettings(next)
            return { success: true, key, value: coerced.value }
        },

        // ── Медиаплеер (renderer/media-player-ui.js) ──────────────────────
        get_media_player_status() {
            if (typeof mediaPlayerApi?.getPlayingSources !== 'function') return { sources: [] }
            return { sources: mediaPlayerApi.getPlayingSources() }
        },

        media_player_command({ id, command } = {}) {
            if (typeof mediaPlayerApi?.sendCommand !== 'function') return { error: 'media_player_unavailable' }
            const sources = mediaPlayerApi.getPlayingSources?.() || []
            if (!sources.some(s => s.id === id)) return { error: 'source_not_playing', id }
            if (!['play', 'pause', 'next', 'previous'].includes(command)) return { error: 'invalid_command', command }
            mediaPlayerApi.sendCommand(id, command)
            return { success: true, id, command }
        },

        // ── Заметки (Pro/Team-плагин, renderer/notes-bind.js) ─────────────
        async list_notes() {
            if (!isNotesEnabled(store)) return { error: 'notes_disabled', hint: 'Плагин "Заметки" выключен — включить можно в Настройки → Расширения.' }
            if (typeof authorizedInvoke !== 'function') return { error: 'notes_unavailable' }
            const result = await authorizedInvoke('api-notes-list')
            if (!result?.success) return { error: 'notes_request_failed', message: result?.error || null }
            return { notes: (result.data?.notes || []).map(summarizeNote) }
        },

        async create_note({ type, title, body, items } = {}) {
            if (!isNotesEnabled(store)) return { error: 'notes_disabled', hint: 'Плагин "Заметки" выключен — включить можно в Настройки → Расширения.' }
            if (typeof authorizedInvoke !== 'function') return { error: 'notes_unavailable' }
            const noteType = type === 'CHECKLIST' ? 'CHECKLIST' : 'NOTE'
            const payload = { type: noteType, title: typeof title === 'string' ? title : '' }
            if (noteType === 'CHECKLIST') {
                payload.items = (Array.isArray(items) ? items : []).map((text, i) => ({
                    id: `item-${Date.now()}-${i}`,
                    text: String(text).slice(0, 500),
                    done: false
                }))
            } else {
                payload.body = typeof body === 'string' ? body : ''
            }
            const result = await authorizedInvoke('api-notes-create', payload)
            if (!result?.success) return { error: 'notes_request_failed', message: result?.error || null }
            return { success: true, note: summarizeNote(result.data.note) }
        },

        async add_checklist_item({ noteId, text } = {}) {
            if (!isNotesEnabled(store)) return { error: 'notes_disabled' }
            if (typeof authorizedInvoke !== 'function') return { error: 'notes_unavailable' }
            const trimmed = typeof text === 'string' ? text.trim() : ''
            if (!trimmed) return { error: 'empty_text' }
            const list = await authorizedInvoke('api-notes-list')
            if (!list?.success) return { error: 'notes_request_failed' }
            const note = (list.data?.notes || []).find(n => n.id === noteId)
            if (!note) return { error: 'note_not_found', noteId }
            const items = [...(note.items || []), { id: `item-${Date.now()}`, text: trimmed, done: false }]
            const result = await authorizedInvoke('api-notes-update', noteId, { items })
            if (!result?.success) return { error: 'notes_request_failed' }
            return { success: true, note: summarizeNote(result.data.note) }
        },

        async toggle_note_pin({ noteId } = {}) {
            if (!isNotesEnabled(store)) return { error: 'notes_disabled' }
            if (typeof authorizedInvoke !== 'function') return { error: 'notes_unavailable' }
            const list = await authorizedInvoke('api-notes-list')
            if (!list?.success) return { error: 'notes_request_failed' }
            const note = (list.data?.notes || []).find(n => n.id === noteId)
            if (!note) return { error: 'note_not_found', noteId }
            const result = await authorizedInvoke('api-notes-update', noteId, { pinned: !note.pinned })
            if (!result?.success) return { error: 'notes_request_failed' }
            return { success: true, note: summarizeNote(result.data.note) }
        },

        async delete_note({ noteId } = {}) {
            if (!isNotesEnabled(store)) return { error: 'notes_disabled' }
            if (typeof authorizedInvoke !== 'function') return { error: 'notes_unavailable' }
            const result = await authorizedInvoke('api-notes-delete', noteId)
            if (!result?.success) return { error: 'notes_request_failed', message: result?.error || null }
            return { success: true, noteId }
        }
    }

    // JSON-схемы для передачи модели — main/ipc/assistant.js прокидывает их
    // как есть в провайдер (main/services/aiProviders/*), каждый адаптер сам
    // конвертирует в свой формат function-calling (OpenAI tools/Anthropic
    // input_schema/Gemini functionDeclarations).
    const TOOL_SCHEMAS = [
        {
            name: 'list_messengers',
            description: 'Вернуть список подключённых у пользователя мессенджеров: id, название, число непрочитанных.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'switch_to_messenger',
            description: 'Переключить активную вкладку приложения на указанный мессенджер.',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string', description: 'id мессенджера из list_messengers' } },
                required: ['id']
            }
        },
        {
            name: 'list_todos',
            description: 'Вернуть задачи пользователя из планировщика, опционально по id списка.',
            parameters: {
                type: 'object',
                properties: { list: { type: 'string', description: 'id списка задач (необязательно)' } },
                required: []
            }
        },
        {
            name: 'add_todo',
            description: 'Добавить новую задачу в планировщик пользователя.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'Текст задачи' },
                    list: { type: 'string', description: 'id списка задач (необязательно, по умолчанию первый список)' }
                },
                required: ['text']
            }
        },
        {
            name: 'toggle_todo',
            description: 'Переключить статус "выполнено" у задачи планировщика по её id.',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string', description: 'id задачи из list_todos' } },
                required: ['id']
            }
        },
        {
            name: 'open_settings_section',
            description: 'Открыть окно настроек приложения на нужном разделе.',
            parameters: {
                type: 'object',
                properties: { section: { type: 'string', enum: SETTINGS_SECTIONS, description: 'Раздел настроек' } },
                required: ['section']
            }
        },
        {
            name: 'get_unread_summary',
            description: 'Вернуть суммарное и по-мессенджерное число непрочитанных сообщений.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'get_recent_notifications',
            description: 'Прочитать уведомления из колокольчика приложения (заголовок и текст превью). Без query возвращает самые последние (по умолчанию 20, максимум 50). С query — ищет подстроку по заголовку и ПОЛНОМУ тексту всей сохранённой истории уведомлений (не только последних), а затем уже применяет limit к найденному — используй query, когда пользователь просит найти конкретное уведомление, а не просто "покажи последние". Не даёт доступ к перепискам мессенджеров — только к самим системным/пуш-уведомлениям, которые пользователь уже видел в панели.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Строка для поиска по заголовку и тексту (регистронезависимо, ищет по всей истории, не только последним)' },
                    limit: { type: 'number', description: 'Максимум уведомлений в ответе (по умолчанию 20, максимум 50)' },
                    unreadOnly: { type: 'boolean', description: 'Вернуть только непрочитанные' }
                },
                required: []
            }
        },
        {
            name: 'get_vpn_status',
            description: 'Проверить, включён ли сейчас VPN, имя активного сервера и число сохранённых серверов.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'connect_fastest_vpn',
            description: 'Замерить пинг до всех сохранённых VPN-серверов пользователя и подключиться к самому быстрому.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'disconnect_vpn',
            description: 'Отключить VPN, если он сейчас активен.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'get_app_settings',
            description: 'Вернуть текущие значения настроек приложения (тема, язык, плотность интерфейса, поведение при закрытии, уведомления и т.д.).',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'set_app_setting',
            description: `Изменить одну настройку приложения и применить её сразу же. Разрешённые ключи и значения: theme (${SETTINGS_SCHEMA.theme.values.join('|')}), density (${SETTINGS_SCHEMA.density.values.join('|')}), closeBehavior (${SETTINGS_SCHEMA.closeBehavior.values.join('|')}), language (${SETTINGS_SCHEMA.language.values.join('|')}), fontSize (${SETTINGS_SCHEMA.fontSize.values.join('|')}), accentColor (hex-цвет, например #7b68ee), showTabs/notifications/notifSound/trayBadge/foldersEnabled/folderLabel/startMinimized/adblockEnabled (true|false).`,
            parameters: {
                type: 'object',
                properties: {
                    key: { type: 'string', enum: Object.keys(SETTINGS_SCHEMA), description: 'Имя настройки' },
                    value: { description: 'Новое значение настройки (строка, число или булево — в зависимости от ключа)' }
                },
                required: ['key', 'value']
            }
        },
        {
            name: 'get_media_player_status',
            description: 'Вернуть список источников, где сейчас играет аудио/видео (мини-плеер в правом сайдбаре): id мессенджера, название, заголовок трека, доступность кнопок вперёд/назад.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'media_player_command',
            description: 'Управлять воспроизведением в конкретном источнике из get_media_player_status: поставить на паузу/возобновить/переключить трек.',
            parameters: {
                type: 'object',
                properties: {
                    id: { type: 'string', description: 'id источника из get_media_player_status' },
                    command: { type: 'string', enum: ['play', 'pause', 'next', 'previous'], description: 'Команда управления' }
                },
                required: ['id', 'command']
            }
        },
        {
            name: 'list_notes',
            description: 'Вернуть заметки и списки покупок пользователя (плагин "Заметки", Pro/Team). Если плагин выключен — вернёт notes_disabled с подсказкой, где его включить.',
            parameters: { type: 'object', properties: {}, required: [] }
        },
        {
            name: 'create_note',
            description: 'Создать новую заметку или список покупок (плагин "Заметки", Pro/Team).',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['NOTE', 'CHECKLIST'], description: 'NOTE — обычный текст, CHECKLIST — список покупок' },
                    title: { type: 'string', description: 'Заголовок заметки (необязательно)' },
                    body: { type: 'string', description: 'Текст заметки — только для типа NOTE' },
                    items: { type: 'array', items: { type: 'string' }, description: 'Пункты списка — только для типа CHECKLIST' }
                },
                required: ['type']
            }
        },
        {
            name: 'add_checklist_item',
            description: 'Добавить пункт в существующий список покупок по его id из list_notes.',
            parameters: {
                type: 'object',
                properties: {
                    noteId: { type: 'string', description: 'id заметки-чек-листа из list_notes' },
                    text: { type: 'string', description: 'Текст нового пункта' }
                },
                required: ['noteId', 'text']
            }
        },
        {
            name: 'toggle_note_pin',
            description: 'Закрепить или открепить заметку по её id из list_notes.',
            parameters: {
                type: 'object',
                properties: { noteId: { type: 'string', description: 'id заметки из list_notes' } },
                required: ['noteId']
            }
        },
        {
            name: 'delete_note',
            description: 'Удалить заметку по её id из list_notes.',
            parameters: {
                type: 'object',
                properties: { noteId: { type: 'string', description: 'id заметки из list_notes' } },
                required: ['noteId']
            }
        }
    ]

    async function executeAssistantTool(name, args) {
        const handler = handlers[name]
        if (!handler) return { error: 'unknown_tool', name }
        try {
            return await handler(args || {})
        } catch (error) {
            console.error(`[assistant-tools] error executing "${name}":`, error)
            return { error: 'tool_execution_failed', message: error?.message || String(error) }
        }
    }

    return { getToolSchemas: () => TOOL_SCHEMAS, executeAssistantTool }
}

module.exports = { bindAssistantTools }
