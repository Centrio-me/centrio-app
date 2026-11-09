// 3.7.1 strings for the morning summary (ms) and the assistant (ai); merged into locales/v371.js.
const SYSTEM_EXTRA_RU = 'Новое в 3.7.1. Сводка «что я пропустил»: get_missed_summary — по каждому сервису число непрочитанных и кто писал с прошлого раза (имена и количество). Отвечай по ней коротко: кому ответить в первую очередь и где больше всего ждут; если нужно содержание, загляни в get_recent_notifications. Сон вкладок: sleep_unused_tabs усыпляет неиспользуемые вкладки (освобождает память), get_tab_sleep_settings/set_tab_sleep_settings — через сколько минут и какие вкладки засыпают сами, set_tab_keep_awake — запретить сон конкретной вкладки. Рабочее время: get_work_hours/set_work_hours — личный график, вне которого выбранные рабочие сервисы не присылают всплывающих уведомлений и не звучат (сообщения сохраняются в центре уведомлений); график команды задаёт руководитель на centrio.me/team во вкладке «Оповещения». «Не беспокоить»: set_do_not_disturb. Точки восстановления: list_restore_points и create_restore_point; восстановить пользователь может сам в Настройки → Система → Точки восстановления, приложение перезапустится. Быстрые ответы: list_quick_replies (свои и общие от руководителя). Если просят что-то из этого — сделай сразу, а потом коротко скажи, что сделал.'
const SYSTEM_EXTRA_EN = 'New in 3.7.1. "What did I miss": get_missed_summary returns unread counts per service and who wrote since last time (names and counts). Answer briefly: whom to answer first and where people wait most; for content use get_recent_notifications. Tab sleep: sleep_unused_tabs frees memory now, get_tab_sleep_settings/set_tab_sleep_settings control automatic sleep, set_tab_keep_awake keeps one tab awake. Work hours: get_work_hours/set_work_hours manage the personal schedule; outside it the chosen work services send no pop-ups or sound (messages stay in the notification centre); the team schedule is set by the manager on centrio.me/team (Alerts tab). Do not disturb: set_do_not_disturb. Restore points: list_restore_points and create_restore_point; the person restores one in Settings → System → Restore points, the app restarts. Quick replies: list_quick_replies (own and from the manager). When asked for any of this, do it right away, then say briefly what you did.'

module.exports = {
    ru: {
        ms: {
            morning: 'Доброе утро', day: 'Пока вас не было',
            leadUnread: 'Непрочитанных: {n}.', leadQuiet: 'Новых сообщений нет.',
            todos: 'Открытых задач: {n}.', more: 'и ещё {n}',
            open: 'Открыть {name}', discuss: 'Разобрать с ассистентом', later: 'Позже', hide: 'Скрыть',
            discussPrompt: 'Разбери, что я пропустил: кому ответить в первую очередь и что может подождать.',
            settingsTitle: 'Утренняя сводка',
            settingsHint: 'Раз в день, когда вы садитесь за компьютер утром (после начала рабочего дня, если он задан), ассистент пишет, кто писал, пока вас не было. Только имена и количество, без текста сообщений. Сводка собирается на компьютере и никуда не отправляется.',
            showNow: 'Показать сейчас', nothing: 'Сейчас пропущенного нет.'
        },
        ai: {
            capMissedTitle: 'Что я пропустил', capMissedPrompt: 'Что я пропустил?',
            toolSummary: 'Смотрю, что пропущено', toolSleep: 'Усыпляю вкладки', toolSleepSettings: 'Сон вкладок', toolKeepAwake: 'Сон вкладки',
            toolWorkHours: 'Рабочее время', toolDnd: '«Не беспокоить»', toolRestore: 'Точки восстановления', toolRestoreSave: 'Сохраняю точку восстановления', toolReplies: 'Быстрые ответы',
            systemExtra: SYSTEM_EXTRA_RU
        }
    },
    en: {
        ms: {
            morning: 'Good morning', day: 'While you were away',
            leadUnread: 'Unread: {n}.', leadQuiet: 'No new messages.',
            todos: 'Open tasks: {n}.', more: 'and {n} more',
            open: 'Open {name}', discuss: 'Go through it with the assistant', later: 'Later', hide: 'Hide',
            discussPrompt: 'Go through what I missed: whom should I answer first and what can wait?',
            settingsTitle: 'Morning summary',
            settingsHint: 'Once a day, when you sit down at the computer in the morning (after your work day starts, if set), the assistant tells you who wrote while you were away. Names and counts only, never message text. Built on your computer and sent nowhere.',
            showNow: 'Show now', nothing: 'Nothing missed right now.'
        },
        ai: {
            capMissedTitle: 'What did I miss', capMissedPrompt: 'What did I miss?',
            toolSummary: 'Checking what you missed', toolSleep: 'Putting tabs to sleep', toolSleepSettings: 'Tab sleep', toolKeepAwake: 'Tab sleep',
            toolWorkHours: 'Work hours', toolDnd: 'Do not disturb', toolRestore: 'Restore points', toolRestoreSave: 'Saving a restore point', toolReplies: 'Quick replies',
            systemExtra: SYSTEM_EXTRA_EN
        }
    },
    de: {
        ms: {
            morning: 'Guten Morgen', day: 'Während du weg warst', leadUnread: 'Ungelesen: {n}.', leadQuiet: 'Keine neuen Nachrichten.',
            todos: 'Offene Aufgaben: {n}.', more: 'und {n} weitere', open: '{name} öffnen', discuss: 'Mit dem Assistenten durchgehen', later: 'Später', hide: 'Ausblenden',
            discussPrompt: 'Geh durch, was ich verpasst habe: wem soll ich zuerst antworten und was kann warten?',
            settingsTitle: 'Morgenübersicht', settingsHint: 'Einmal täglich, wenn du morgens an den Computer kommst, zeigt der Assistent, wer geschrieben hat. Nur Namen und Anzahl, nie Nachrichtentext. Wird auf dem Computer erstellt und nirgends hingeschickt.',
            showNow: 'Jetzt zeigen', nothing: 'Gerade nichts verpasst.'
        },
        ai: { capMissedTitle: 'Was habe ich verpasst', capMissedPrompt: 'Was habe ich verpasst?', toolSummary: 'Prüfe Verpasstes', toolSleep: 'Tabs schlafen legen', toolSleepSettings: 'Tab-Ruhezustand', toolKeepAwake: 'Tab-Ruhezustand', toolWorkHours: 'Arbeitszeit', toolDnd: 'Nicht stören', toolRestore: 'Wiederherstellungspunkte', toolRestoreSave: 'Speichere Wiederherstellungspunkt', toolReplies: 'Schnellantworten' }
    },
    es: {
        ms: {
            morning: 'Buenos días', day: 'Mientras no estabas', leadUnread: 'Sin leer: {n}.', leadQuiet: 'No hay mensajes nuevos.',
            todos: 'Tareas abiertas: {n}.', more: 'y {n} más', open: 'Abrir {name}', discuss: 'Revisarlo con el asistente', later: 'Más tarde', hide: 'Ocultar',
            discussPrompt: 'Revisa lo que me perdí: ¿a quién respondo primero y qué puede esperar?',
            settingsTitle: 'Resumen matutino', settingsHint: 'Una vez al día, cuando te sientas al ordenador por la mañana, el asistente te dice quién escribió. Solo nombres y cantidades, nunca el texto. Se crea en tu ordenador y no se envía a ningún sitio.',
            showNow: 'Mostrar ahora', nothing: 'Ahora no hay nada pendiente.'
        },
        ai: { capMissedTitle: 'Qué me perdí', capMissedPrompt: '¿Qué me perdí?', toolSummary: 'Revisando lo pendiente', toolSleep: 'Suspendiendo pestañas', toolSleepSettings: 'Suspensión de pestañas', toolKeepAwake: 'Suspensión de pestañas', toolWorkHours: 'Horario laboral', toolDnd: 'No molestar', toolRestore: 'Puntos de restauración', toolRestoreSave: 'Guardando un punto de restauración', toolReplies: 'Respuestas rápidas' }
    },
    fr: {
        ms: {
            morning: 'Bonjour', day: 'Pendant votre absence', leadUnread: 'Non lus : {n}.', leadQuiet: 'Aucun nouveau message.',
            todos: 'Tâches ouvertes : {n}.', more: 'et {n} autres', open: 'Ouvrir {name}', discuss: 'Voir avec l’assistant', later: 'Plus tard', hide: 'Masquer',
            discussPrompt: 'Passe en revue ce que j’ai manqué : à qui répondre en premier et qu’est-ce qui peut attendre ?',
            settingsTitle: 'Résumé du matin', settingsHint: 'Une fois par jour, quand vous vous installez le matin, l’assistant indique qui a écrit. Seulement les noms et le nombre, jamais le texte. Créé sur votre ordinateur, envoyé nulle part.',
            showNow: 'Afficher', nothing: 'Rien de manqué pour l’instant.'
        },
        ai: { capMissedTitle: 'Qu’ai-je manqué', capMissedPrompt: 'Qu’ai-je manqué ?', toolSummary: 'Je regarde ce qui a été manqué', toolSleep: 'Mise en veille des onglets', toolSleepSettings: 'Veille des onglets', toolKeepAwake: 'Veille des onglets', toolWorkHours: 'Heures de travail', toolDnd: 'Ne pas déranger', toolRestore: 'Points de restauration', toolRestoreSave: 'Enregistrement d’un point', toolReplies: 'Réponses rapides' }
    },
    it: {
        ms: {
            morning: 'Buongiorno', day: 'Mentre eri via', leadUnread: 'Non letti: {n}.', leadQuiet: 'Nessun nuovo messaggio.',
            todos: 'Attività aperte: {n}.', more: 'e altri {n}', open: 'Apri {name}', discuss: 'Rivedi con l’assistente', later: 'Più tardi', hide: 'Nascondi',
            discussPrompt: 'Rivedi cosa mi sono perso: a chi rispondere per primo e cosa può aspettare?',
            settingsTitle: 'Riepilogo del mattino', settingsHint: 'Una volta al giorno, quando ti siedi al computer la mattina, l’assistente ti dice chi ha scritto. Solo nomi e numero, mai il testo. Creato sul computer e non inviato da nessuna parte.',
            showNow: 'Mostra ora', nothing: 'Al momento nulla di perso.'
        },
        ai: { capMissedTitle: 'Cosa mi sono perso', capMissedPrompt: 'Cosa mi sono perso?', toolSummary: 'Controllo cosa hai perso', toolSleep: 'Sospendo le schede', toolSleepSettings: 'Sospensione schede', toolKeepAwake: 'Sospensione schede', toolWorkHours: 'Orario di lavoro', toolDnd: 'Non disturbare', toolRestore: 'Punti di ripristino', toolRestoreSave: 'Salvo un punto di ripristino', toolReplies: 'Risposte rapide' }
    },
    zh: {
        ms: {
            morning: '早上好', day: '你不在时', leadUnread: '未读：{n}。', leadQuiet: '没有新消息。',
            todos: '未完成任务：{n}。', more: '还有 {n} 人', open: '打开 {name}', discuss: '让助手帮我梳理', later: '稍后', hide: '隐藏',
            discussPrompt: '帮我梳理错过的内容：先回复谁，哪些可以等？',
            settingsTitle: '早间摘要', settingsHint: '每天早上你坐到电脑前时，助手会告诉你谁发来了消息。只有名字和数量，不含消息内容。在电脑上生成，不会发送到任何地方。',
            showNow: '立即显示', nothing: '目前没有错过的内容。'
        },
        ai: { capMissedTitle: '我错过了什么', capMissedPrompt: '我错过了什么？', toolSummary: '查看错过的内容', toolSleep: '让标签页休眠', toolSleepSettings: '标签页休眠', toolKeepAwake: '标签页休眠', toolWorkHours: '工作时间', toolDnd: '勿扰', toolRestore: '还原点', toolRestoreSave: '保存还原点', toolReplies: '快捷回复' }
    }
}
